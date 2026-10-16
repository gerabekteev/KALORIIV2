import React, { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { statsApi } from '../../api/stats'
import { getTodayDateString } from '../../store/mealsStore'
import { calculateWeeklyBank } from '../../utils/calorieBank'

interface WeekStripCalendarProps {
  selectedDate: string
  onSelectDate: (date: string) => void
  currentDayCalories: number
  dailyGoalCalories: number
  onWeeklyBankChange?: (
    bank: { balance: number; isPositive: boolean; trackedCount: number } | null
  ) => void
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

export const WeekStripCalendar: React.FC<WeekStripCalendarProps> = ({
  selectedDate,
  onSelectDate,
  currentDayCalories,
  dailyGoalCalories,
  onWeeklyBankChange,
}) => {
  const todayStr = useMemo(() => getTodayDateString(), [])
  const [weekCaloriesMap, setWeekCaloriesMap] = useState<Record<string, number>>({})

  // Compute 7 days of the week for selectedDate (Monday -> Sunday)
  const monday = useMemo(() => getMonday(selectedDate), [selectedDate])
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
      return {
        dateStr: formatDateISO(d),
        dayNum: d.getDate(),
        dateObj: d,
      }
    })
  }, [monday])

  const mondayStr = weekDays[0].dateStr
  const sundayStr = weekDays[6].dateStr

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

  // Fetch stats for the 7 days when week changes
  useEffect(() => {
    let isCancelled = false
    const fetchWeekStats = async () => {
      try {
        const res = await statsApi.getStats('custom', mondayStr, sundayStr)
        if (isCancelled) return
        const map: Record<string, number> = {}
        ;(res.daily_stats || []).forEach((item) => {
          map[item.date] = item.calories || 0
        })
        setWeekCaloriesMap(map)
      } catch {
        // Safe fallback if offline or request fails
      }
    }
    fetchWeekStats()
    return () => {
      isCancelled = true
    }
  }, [mondayStr, sundayStr])

  // Week navigation (-7 days or +7 days from selectedDate)
  const shiftWeek = (daysDelta: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number)
    const nextDate = new Date(y, m - 1, d + daysDelta)
    onSelectDate(formatDateISO(nextDate))
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

  return (
    <div className="bg-[#19191d] p-3 rounded-2xl border border-neutral-800/80 shadow-md space-y-2.5">
      {/* Header bar: Navigation & Selected Date */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftWeek(-7)}
          className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer active:scale-95"
          title="Предыдущая неделя"
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
              onClick={() => onSelectDate(todayStr)}
              className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 transition-all cursor-pointer active:scale-95 shrink-0"
            >
              Сегодня
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => shiftWeek(7)}
          className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer active:scale-95"
          title="Следующая неделя"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 7-Days Grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {weekDays.map((day, idx) => {
          const isSelected = day.dateStr === selectedDate
          const isCurrentToday = day.dateStr === todayStr

          // If this is the currently active selected date, use real-time calories from store
          const calories =
            day.dateStr === selectedDate
              ? currentDayCalories
              : weekCaloriesMap[day.dateStr] || 0

          const ratio = dailyGoalCalories > 0 ? calories / dailyGoalCalories : 0
          const progressPercent = Math.min(ratio, 1)
          const strokeDashoffset = circumference - progressPercent * circumference

          // Threshold colors per spec:
          // 0% -> #27272a (gray)
          // > 1.15 -> #f59e0b (amber)
          // 0.85 .. 1.15 -> #10b981 (emerald with center dot)
          // < 0.85 -> #34d399 (teal-emerald progress)
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
              onClick={() => onSelectDate(day.dateStr)}
              className={`flex flex-col items-center justify-between py-2 px-1 rounded-xl transition-all cursor-pointer border ${
                isSelected
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-white shadow-sm scale-[1.02]'
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

      {/* Elastic Weekly Calorie Bank Badge (GC-02) */}
      {weeklyBank && (
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-[#141417] border border-neutral-800/80 text-[11px]">
          <span className="text-neutral-400 flex items-center gap-1.5 font-medium">
            <span>🏦</span>
            <span>Банк недели ({weeklyBank.trackedCount} дн.):</span>
          </span>
          {weeklyBank.isPositive ? (
            <span className="font-semibold text-emerald-400">
              +{weeklyBank.balance} ккал в запасе
            </span>
          ) : (
            <span className="font-semibold text-amber-400">
              {weeklyBank.balance} ккал (дефицит)
            </span>
          )}
        </div>
      )}
    </div>
  )
}
