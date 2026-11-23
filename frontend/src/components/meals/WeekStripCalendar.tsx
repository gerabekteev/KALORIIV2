import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Scale, ChevronDown, ChevronUp } from 'lucide-react'
import { statsApi } from '../../api/stats'
import { getTodayDateString } from '../../store/mealsStore'
import { calculateWeeklyBank, WeeklyBankResult } from '../../utils/calorieBank'
import { haptics } from '../../utils/haptics'

interface WeekStripCalendarProps {
  selectedDate: string
  onSelectDate: (date: string) => void
  currentDayCalories: number
  dailyGoalCalories: number
  onWeeklyBankChange?: (bank: WeeklyBankResult | null) => void
}

interface WeekDayItem {
  dateStr: string
  dayNum: number
  dateObj: Date
}

function getMonday(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(y, m - 1, diff)
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildWeekDays(baseMonday: Date, offsetDays: number): WeekDayItem[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(
      baseMonday.getFullYear(),
      baseMonday.getMonth(),
      baseMonday.getDate() + offsetDays + i
    )
    return {
      dateStr: formatDateISO(d),
      dayNum: d.getDate(),
      dateObj: d,
    }
  })
}

type SlidePhase = 'idle' | 'dragging' | 'animating-prev' | 'animating-next' | 'snapping-back'

export const WeekStripCalendar: React.FC<WeekStripCalendarProps> = ({
  selectedDate,
  onSelectDate,
  currentDayCalories,
  dailyGoalCalories,
  onWeeklyBankChange,
}) => {
  const todayStr = useMemo(() => getTodayDateString(), [])
  const [weekCaloriesMap, setWeekCaloriesMap] = useState<Record<string, number>>({})
  const [showBankDetails, setShowBankDetails] = useState(false)

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [dragX, setDragX] = useState(0)
  const [slidePhase, setSlidePhase] = useState<SlidePhase>('idle')

  const pointerStartRef = useRef<{
    x: number
    y: number
    time: number
    active: boolean
    isHorizontal: boolean | null
  }>({
    x: 0,
    y: 0,
    time: 0,
    active: false,
    isHorizontal: null,
  })
  const suppressClickRef = useRef(false)
  const animTimerRef = useRef<number | null>(null)
  const wheelCooldownRef = useRef<number>(0)

  const monday = useMemo(() => getMonday(selectedDate), [selectedDate])
  const prevWeekDays = useMemo(() => buildWeekDays(monday, -7), [monday])
  const weekDays = useMemo(() => buildWeekDays(monday, 0), [monday])
  const nextWeekDays = useMemo(() => buildWeekDays(monday, 7), [monday])
  const threeWeeks = useMemo(
    () => [prevWeekDays, weekDays, nextWeekDays],
    [prevWeekDays, weekDays, nextWeekDays]
  )

  const mondayStr = weekDays[0].dateStr

  useLayoutEffect(() => {
    if (animTimerRef.current) {
      window.clearTimeout(animTimerRef.current)
      animTimerRef.current = null
    }
    setSlidePhase('idle')
    setDragX(0)
  }, [mondayStr])

  useEffect(() => {
    return () => {
      if (animTimerRef.current) {
        window.clearTimeout(animTimerRef.current)
      }
    }
  }, [])

  const weeklyBank = useMemo(() => {
    return calculateWeeklyBank({
      dailyGoalCalories,
      weekDateStrings: weekDays.map((d) => d.dateStr),
      todayStr,
      selectedDate,
      currentDayCalories,
      weekCaloriesMap,
    })
  }, [dailyGoalCalories, weekDays, todayStr, selectedDate, currentDayCalories, weekCaloriesMap])

  useEffect(() => {
    if (onWeeklyBankChange) {
      onWeeklyBankChange(weeklyBank)
    }
  }, [weeklyBank, onWeeklyBankChange])

  const fetchStartStr = useMemo(() => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 21)
    return formatDateISO(d)
  }, [monday])

  const fetchEndStr = useMemo(() => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 13)
    return formatDateISO(d)
  }, [monday])

  useEffect(() => {
    let isCancelled = false
    const fetchWeekStats = async () => {
      try {
        const res = await statsApi.getStats('custom', fetchStartStr, fetchEndStr)
        if (isCancelled) return
        setWeekCaloriesMap((prev) => {
          const next = { ...prev }
          ;(res.daily_stats || []).forEach((item) => {
            next[item.date] = item.calories || 0
          })
          return next
        })
      } catch {
        // Safe fallback
      }
    }
    fetchWeekStats()
    return () => {
      isCancelled = true
    }
  }, [fetchStartStr, fetchEndStr])

  const shiftWeek = useCallback(
    (daysDelta: number) => {
      const [y, m, d] = selectedDate.split('-').map(Number)
      const nextDate = new Date(y, m - 1, d + daysDelta)
      onSelectDate(formatDateISO(nextDate))
    },
    [selectedDate, onSelectDate]
  )

  const animateToWeek = useCallback(
    (direction: 'prev' | 'next') => {
      if (slidePhase === 'animating-prev' || slidePhase === 'animating-next') return
      haptics.release()
      setDragX(0)
      setSlidePhase(direction === 'prev' ? 'animating-prev' : 'animating-next')

      if (animTimerRef.current) {
        window.clearTimeout(animTimerRef.current)
      }
      animTimerRef.current = window.setTimeout(() => {
        animTimerRef.current = null
        shiftWeek(direction === 'prev' ? -7 : 7)
      }, 220)
    },
    [slidePhase, shiftWeek]
  )

  const handleDragStart = (clientX: number, clientY: number) => {
    if (slidePhase === 'animating-prev' || slidePhase === 'animating-next') return
    if (animTimerRef.current) {
      window.clearTimeout(animTimerRef.current)
      animTimerRef.current = null
    }
    pointerStartRef.current = {
      x: clientX,
      y: clientY,
      time: Date.now(),
      active: true,
      isHorizontal: null,
    }
    suppressClickRef.current = false
  }

  const handleDragMove = (clientX: number, clientY: number) => {
    const state = pointerStartRef.current
    if (!state.active) return

    const dx = clientX - state.x
    const dy = clientY - state.y

    if (state.isHorizontal === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      state.isHorizontal = Math.abs(dx) > Math.abs(dy)
      if (!state.isHorizontal) {
        state.active = false
        return
      }
    }

    if (Math.abs(dx) > 8) {
      suppressClickRef.current = true
    }

    setSlidePhase('dragging')
    setDragX(dx)
  }

  const handleDragEnd = () => {
    const state = pointerStartRef.current
    if (!state.active) return
    state.active = false

    if (!state.isHorizontal) {
      setDragX(0)
      setSlidePhase('idle')
      return
    }

    const viewportWidth = viewportRef.current?.clientWidth || 320
    const elapsed = Math.max(Date.now() - state.time, 1)
    const velocity = dragX / elapsed

    const shouldGoPrev = dragX > viewportWidth * 0.16 || (dragX > 24 && velocity > 0.32)
    const shouldGoNext = dragX < -viewportWidth * 0.16 || (dragX < -24 && velocity < -0.32)

    if (shouldGoPrev) {
      animateToWeek('prev')
    } else if (shouldGoNext) {
      animateToWeek('next')
    } else if (Math.abs(dragX) > 0) {
      setDragX(0)
      setSlidePhase('snapping-back')
      animTimerRef.current = window.setTimeout(() => {
        animTimerRef.current = null
        setSlidePhase('idle')
      }, 220)
    } else {
      setSlidePhase('idle')
    }
  }

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 25) {
      const now = Date.now()
      if (now - wheelCooldownRef.current < 400) return
      wheelCooldownRef.current = now
      animateToWeek(e.deltaX < 0 ? 'prev' : 'next')
    }
  }

  const [selY, selM, selD] = selectedDate.split('-').map(Number)
  const selectedDateObj = new Date(selY, selM - 1, selD)
  const isToday = selectedDate === todayStr

  const formattedHeaderDate = selectedDateObj.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
  })

  const dayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

  let trackTransform = 'translate3d(-33.333333%, 0, 0)'
  if (slidePhase === 'dragging') {
    trackTransform = `translate3d(calc(-33.333333% + ${dragX}px), 0, 0)`
  } else if (slidePhase === 'animating-prev') {
    trackTransform = 'translate3d(0%, 0, 0)'
  } else if (slidePhase === 'animating-next') {
    trackTransform = 'translate3d(-66.666667%, 0, 0)'
  }

  const trackTransition =
    slidePhase === 'animating-prev' ||
    slidePhase === 'animating-next' ||
    slidePhase === 'snapping-back'
      ? 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)'
      : 'none'

  return (
    <div className="bg-[#1A1A1D] p-3.5 rounded-[22px] space-y-2.5">
      {/* Compact Header */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[13px] sm:text-sm font-semibold text-white tracking-tight capitalize truncate">
            {isToday ? `Сегодня, ${formattedHeaderDate}` : formattedHeaderDate}
          </span>
          {!isToday && (
            <button
              type="button"
              onClick={() => {
                haptics.release()
                onSelectDate(todayStr)
              }}
              className="text-[11px] font-medium text-[#E02424] hover:underline transition-colors cursor-pointer active:scale-95 shrink-0"
            >
              к сегодня
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => animateToWeek('prev')}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-[#242429] hover:bg-[#2E2E35] text-[#8E8E96] hover:text-white transition-colors cursor-pointer active:scale-95 touch-manipulation"
            title="Предыдущая неделя"
            aria-label="Предыдущая неделя"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => animateToWeek('next')}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-[#242429] hover:bg-[#2E2E35] text-[#8E8E96] hover:text-white transition-colors cursor-pointer active:scale-95 touch-manipulation"
            title="Следующая неделя"
            aria-label="Следующая неделя"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Swipeable 3-Week Carousel */}
      <div
        ref={viewportRef}
        data-no-tab-swipe="true"
        className="overflow-hidden touch-pan-y select-none cursor-grab active:cursor-grabbing"
        onTouchStart={(e) => {
          if (e.touches.length === 1) {
            handleDragStart(e.touches[0].clientX, e.touches[0].clientY)
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 1) {
            handleDragMove(e.touches[0].clientX, e.touches[0].clientY)
          }
        }}
        onTouchEnd={handleDragEnd}
        onTouchCancel={handleDragEnd}
        onMouseDown={(e) => {
          if (e.button === 0) {
            handleDragStart(e.clientX, e.clientY)
          }
        }}
        onMouseMove={(e) => {
          if (pointerStartRef.current.active) {
            handleDragMove(e.clientX, e.clientY)
          }
        }}
        onMouseUp={handleDragEnd}
        onMouseLeave={() => {
          if (pointerStartRef.current.active) {
            handleDragEnd()
          }
        }}
        onWheel={handleWheel}
      >
        <div
          className="flex w-[300%] will-change-transform"
          style={{
            transform: trackTransform,
            transition: trackTransition,
          }}
        >
          {threeWeeks.map((panelDays, panelIdx) => (
            <div
              key={panelDays[0].dateStr || panelIdx}
              className="w-1/3 grid grid-cols-7 gap-1 px-0.5"
            >
              {panelDays.map((day, idx) => {
                const isSelected = day.dateStr === selectedDate
                const isCurrentToday = day.dateStr === todayStr

                const calories =
                  day.dateStr === selectedDate
                    ? currentDayCalories
                    : weekCaloriesMap[day.dateStr] || 0

                const ratio = dailyGoalCalories > 0 ? calories / dailyGoalCalories : 0
                const fillPct = Math.min(100, Math.round(ratio * 100))

                const isOver = ratio > 1.1
                const isAchieved = ratio >= 0.85 && ratio <= 1.1
                const barColor = isOver
                  ? '#E02424'
                  : isAchieved
                  ? '#FFFFFF'
                  : '#7A7A82'

                return (
                  <button
                    key={day.dateStr}
                    type="button"
                    onClick={() => {
                      if (suppressClickRef.current) {
                        suppressClickRef.current = false
                        return
                      }
                      haptics.release()
                      onSelectDate(day.dateStr)
                    }}
                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-[16px] transition-all cursor-pointer focus:outline-none ${
                      isSelected
                        ? 'bg-[#26262C] ring-1 ring-inset ring-white/80 text-white'
                        : 'bg-transparent hover:bg-[#222227] text-[#7A7A82] hover:text-white'
                    }`}
                  >
                    <span
                      className={`text-[10px] font-medium leading-none flex items-center gap-1 ${
                        isSelected ? 'text-white' : 'text-[#7A7A82]'
                      }`}
                    >
                      {isCurrentToday && (
                        <span className="w-1 h-1 rounded-full bg-[#E02424] shrink-0" />
                      )}
                      <span>{dayLabels[idx]}</span>
                    </span>

                    <span
                      className={`font-ndot text-[17px] font-bold mt-1.5 leading-none ${
                        isSelected ? 'text-white' : 'text-[#D4D4D8]'
                      }`}
                    >
                      {day.dayNum}
                    </span>

                    {/* Micro Calorie Progress Bar */}
                    <div className="w-6 h-[3px] rounded-full bg-[#2C2C33] mt-2 overflow-hidden">
                      {calories > 0 && (
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.max(12, fillPct)}%`,
                            backgroundColor: barColor,
                          }}
                        />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Expandable Weekly Calorie Bank */}
      {weeklyBank && (
        <div className="pt-0.5 space-y-2">
          <div className="nothing-dotted-divider" />
          <button
            type="button"
            onClick={() => setShowBankDetails((v) => !v)}
            className="w-full flex items-center justify-between pt-1 text-xs hover:opacity-90 transition-opacity cursor-pointer"
            title="Детализация баланса калорий за неделю"
          >
            <span className="text-[#A1A1AA] flex items-center gap-1.5 font-medium">
              <Scale className="w-3.5 h-3.5 text-[#7A7A82] shrink-0" />
              <span>Баланс недели ({weeklyBank.trackedCount} дн.)</span>
            </span>
            <span className="flex items-center gap-1.5">
              {weeklyBank.balance > 0 ? (
                <span className="font-ndot text-xs font-bold text-white">
                  +{weeklyBank.balance} <span className="font-sans font-normal text-[#7A7A82]">ккал</span>
                </span>
              ) : weeklyBank.balance < 0 ? (
                <span className="font-ndot text-xs font-bold text-[#E02424]">
                  +{Math.abs(weeklyBank.balance)} <span className="font-sans font-normal">перебор</span>
                </span>
              ) : (
                <span className="font-ndot text-xs font-bold text-[#A1A1AA]">0</span>
              )}
              {showBankDetails ? (
                <ChevronUp className="w-3.5 h-3.5 text-[#7A7A82]" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-[#7A7A82]" />
              )}
            </span>
          </button>

          {showBankDetails && (
            <div className="pt-2 space-y-2 text-[11px] animate-in fade-in duration-150">
              <div className="flex items-center justify-between text-[#7A7A82]">
                <span>Съедено за {weeklyBank.trackedCount} дн.:</span>
                <span className="font-ndot font-bold text-white">
                  {weeklyBank.totalConsumed}/{weeklyBank.totalBudget}
                </span>
              </div>

              <div className="space-y-1">
                {weeklyBank.days.map((item) => {
                  const [y, m, d] = item.dateStr.split('-').map(Number)
                  const dt = new Date(y, m - 1, d)
                  const label = dt.toLocaleDateString('ru-RU', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })
                  return (
                    <div
                      key={item.dateStr}
                      className="flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-[#111113] text-[11px]"
                    >
                      <span className="text-[#D4D4D8] capitalize">{label}</span>
                      <div className="flex items-center gap-2.5 font-ndot">
                        <span className="text-[#7A7A82]">
                          {item.calories}/{item.goal}
                        </span>
                        <span
                          className={`font-bold ${
                            item.diff > 0
                              ? 'text-white'
                              : item.diff < 0
                              ? 'text-[#E02424]'
                              : 'text-[#7A7A82]'
                          }`}
                        >
                          {item.diff > 0
                            ? `+${item.diff}`
                            : item.diff < 0
                            ? `-${Math.abs(item.diff)}`
                            : '0'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              <p className="text-[11px] text-[#7A7A82] leading-relaxed m-0">
                Учитываются дни этой недели с записями. Остаток от нормы ({dailyGoalCalories} ккал) копится в запас недели.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
