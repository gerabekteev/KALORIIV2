import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Calendar, Scale, ChevronDown, ChevronUp } from 'lucide-react'
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

// Helper to compute Monday (start of week) from any YYYY-MM-DD
function getMonday(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const day = date.getDay() // 0 = Sun, 1 = Mon, ..., 6 = Sat
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

  // Interactive swipe/drag carousel state
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

  // Compute Monday for the currently selected date and build 3 adjacent weeks (Prev, Current, Next)
  const monday = useMemo(() => getMonday(selectedDate), [selectedDate])
  const prevWeekDays = useMemo(() => buildWeekDays(monday, -7), [monday])
  const weekDays = useMemo(() => buildWeekDays(monday, 0), [monday])
  const nextWeekDays = useMemo(() => buildWeekDays(monday, 7), [monday])
  const threeWeeks = useMemo(
    () => [prevWeekDays, weekDays, nextWeekDays],
    [prevWeekDays, weekDays, nextWeekDays]
  )

  const mondayStr = weekDays[0].dateStr

  // Reset carousel offset synchronously before paint when monday changes so there is zero flicker
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

  // Elastic Weekly Calorie Bank calculation (GC-02)
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

  // Prefetch stats for a wide window (-21 days to +13 days) so adjacent weeks already have live circles while swiping
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
        // Safe fallback if offline or request fails
      }
    }
    fetchWeekStats()
    return () => {
      isCancelled = true
    }
  }, [fetchStartStr, fetchEndStr])

  // Week navigation (-7 days or +7 days from selectedDate)
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
    const velocity = dragX / elapsed // px per ms

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

  // Formatting header date (e.g., "Сегодня, 16 октября, пт")
  const [selY, selM, selD] = selectedDate.split('-').map(Number)
  const selectedDateObj = new Date(selY, selM - 1, selD)
  const isToday = selectedDate === todayStr

  const formattedHeaderDate = selectedDateObj.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
  })

  const dayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

  // SVG mini-circle constants (22x22px, radius 8.5, strokeWidth 2.5)
  const radius = 8.5
  const circumference = 2 * Math.PI * radius // ~53.4

  // Compute CSS transform and transition for the 3-week track
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
    <div className="bg-[#19191d] p-3 rounded-2xl border border-neutral-800/80 shadow-md space-y-2.5">
      {/* Header bar: Navigation & Selected Date */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => animateToWeek('prev')}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer active:scale-95 touch-manipulation shrink-0"
          title="Предыдущая неделя (или свайп вправо)"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-xs sm:text-sm font-semibold text-white capitalize truncate">
            {isToday ? `Сегодня, ${formattedHeaderDate}` : formattedHeaderDate}
          </span>
          {!isToday && (
            <button
              type="button"
              onClick={() => {
                haptics.release()
                onSelectDate(todayStr)
              }}
              className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 transition-all cursor-pointer active:scale-95 shrink-0"
            >
              Сегодня
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => animateToWeek('next')}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer active:scale-95 touch-manipulation shrink-0"
          title="Следующая неделя (или свайп влево)"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Interactive Swipeable 3-Week Carousel Viewport */}
      <div
        ref={viewportRef}
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
              className="w-1/3 grid grid-cols-7 gap-1 sm:gap-1.5 px-0.5"
            >
              {panelDays.map((day, idx) => {
                const isSelected = day.dateStr === selectedDate
                const isCurrentToday = day.dateStr === todayStr

                const calories =
                  day.dateStr === selectedDate
                    ? currentDayCalories
                    : weekCaloriesMap[day.dateStr] || 0

                const ratio = dailyGoalCalories > 0 ? calories / dailyGoalCalories : 0
                const progressPercent = Math.min(ratio, 1)
                const strokeDashoffset = circumference - progressPercent * circumference

                const isOver = ratio > 1.15
                const isAchieved = ratio >= 0.85 && ratio <= 1.15
                const inProgress = calories > 0 && ratio < 0.85

                let progressStrokeColor = '#27272a'
                if (isOver) progressStrokeColor = '#f59e0b'
                else if (isAchieved) progressStrokeColor = '#10b981'
                else if (inProgress) progressStrokeColor = '#34d399'

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
                    className={`flex flex-col items-center justify-between py-2 px-1 rounded-xl transition-colors cursor-pointer border ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-white shadow-sm'
                        : 'bg-[#151518]/70 hover:bg-neutral-800/60 border-neutral-800/80 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {/* Day of Week Label (Пн..Вс) */}
                    <span
                      className={`text-[10px] font-medium leading-none ${
                        isSelected ? 'text-emerald-300' : 'text-neutral-400'
                      }`}
                    >
                      {dayLabels[idx]}
                    </span>

                    {/* Day of Month Number */}
                    <span
                      className={`text-xs font-bold my-1 leading-none ${
                        isSelected
                          ? 'text-white'
                          : isCurrentToday
                          ? 'text-emerald-400'
                          : 'text-neutral-200'
                      }`}
                    >
                      {day.dayNum}
                    </span>

                    {/* Mini SVG Progress Ring (22x22px) */}
                    <div className="relative w-[22px] h-[22px] flex items-center justify-center">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 22 22">
                        {/* Background Track */}
                        <circle
                          cx="11"
                          cy="11"
                          r={radius}
                          stroke="#27272a"
                          strokeWidth="2.5"
                          fill="none"
                        />
                        {/* Animated Progress Ring */}
                        {calories > 0 && (
                          <circle
                            cx="11"
                            cy="11"
                            r={radius}
                            stroke={progressStrokeColor}
                            strokeWidth="2.5"
                            fill="none"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            className="transition-all duration-300"
                          />
                        )}
                      </svg>

                      {/* Achieved Center Dot */}
                      {isAchieved && (
                        <div className="absolute w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-sm" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Elastic Weekly Calorie Bank Badge (GC-02) */}
      {weeklyBank && (
        <div className="rounded-xl bg-[#131317] border border-white/[0.06] overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => setShowBankDetails((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-[11px] hover:bg-white/[0.02] transition-colors cursor-pointer"
            title="Нажмите, чтобы посмотреть расчёт баланса по дням недели"
          >
            <span className="text-neutral-300 flex items-center gap-1.5 font-medium">
              <Scale className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                Баланс недели ({weeklyBank.trackedCount} дн.):
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              {weeklyBank.balance > 0 ? (
                <span className="font-semibold text-emerald-400">
                  В запасе +{weeklyBank.balance} ккал
                </span>
              ) : weeklyBank.balance < 0 ? (
                <span className="font-semibold text-amber-400">
                  Перебор +{Math.abs(weeklyBank.balance)} ккал
                </span>
              ) : (
                <span className="font-semibold text-neutral-300">
                  Ровно по норме
                </span>
              )}
              {showBankDetails ? (
                <ChevronUp className="w-3.5 h-3.5 text-neutral-500" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
              )}
            </span>
          </button>

          {showBankDetails && (
            <div className="px-3 pb-2.5 pt-1.5 border-t border-white/[0.05] space-y-2 text-[11px] animate-in fade-in duration-150">
              <div className="flex items-center justify-between text-neutral-400">
                <span>Съедено за {weeklyBank.trackedCount} дн. с записями:</span>
                <span className="font-mono font-semibold text-white">
                  {weeklyBank.totalConsumed} / {weeklyBank.totalBudget} ккал
                </span>
              </div>

              <div className="grid grid-cols-1 gap-1">
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
                      className="flex items-center justify-between py-1 px-2 rounded-lg bg-[#191920] text-[10.5px]"
                    >
                      <span className="text-neutral-300 capitalize">{label}</span>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-neutral-400">
                          {item.calories} / {item.goal} ккал
                        </span>
                        <span
                          className={`font-semibold ${
                            item.diff > 0
                              ? 'text-emerald-400'
                              : item.diff < 0
                              ? 'text-amber-400'
                              : 'text-neutral-400'
                          }`}
                        >
                          {item.diff > 0
                            ? `в запас +${item.diff}`
                            : item.diff < 0
                            ? `перебор +${Math.abs(item.diff)}`
                            : '0'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              <p className="text-[10px] text-neutral-500 leading-relaxed m-0">
                Учитываются только дни этой недели, где записана еда. Если за день съедено меньше вашей нормы ({dailyGoalCalories} ккал), остаток копится в запас недели.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
