import React, { useMemo } from 'react'
import { StatsDayData } from '../../types'

interface WeekdayRhythmChartProps {
  days: StatsDayData[]
  targetCalories: number
}

const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export const WeekdayRhythmChart: React.FC<WeekdayRhythmChartProps> = ({
  days,
  targetCalories,
}) => {
  const buckets = useMemo(() => {
    const sums = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }))
    days.forEach((d) => {
      if (!d.calories || d.calories <= 0) return
      const parts = d.date.split('-').map(Number)
      const dt =
        parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(d.date)
      const jsDay = dt.getDay() // 0=Sun..6=Sat
      const idx = jsDay === 0 ? 6 : jsDay - 1 // 0=Mon..6=Sun
      sums[idx].total += d.calories
      sums[idx].count += 1
    })

    return sums.map((s, idx) => {
      const avg = s.count > 0 ? Math.round(s.total / s.count) : 0
      return {
        label: WEEKDAYS_RU[idx],
        avg,
        count: s.count,
        isOver: targetCalories > 0 && avg > targetCalories * 1.05,
      }
    })
  }, [days, targetCalories])

  const maxVal = useMemo(() => {
    const peak = Math.max(...buckets.map((b) => b.avg), targetCalories || 2000)
    return peak > 0 ? peak * 1.1 : 2200
  }, [buckets, targetCalories])

  const peakDay = useMemo(() => {
    const withData = buckets.filter((b) => b.avg > 0)
    if (withData.length === 0) return null
    return withData.reduce((best, cur) => (cur.avg > best.avg ? cur : best), withData[0])
  }, [buckets])

  const targetTopPct = targetCalories > 0 ? Math.max(8, Math.min(88, 100 - (targetCalories / maxVal) * 100)) : 25
  const peakDiffPct =
    peakDay && targetCalories > 0
      ? Math.round(((peakDay.avg - targetCalories) / targetCalories) * 100)
      : 0

  return (
    <div className="bg-[#1A1A1D] rounded-[22px] p-4 sm:p-5 flex flex-col justify-between space-y-3 h-full">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white tracking-tight my-0">
            Ритм по дням недели
          </h3>
          <p className="text-[11px] text-[#7A7A82] mt-0.5 my-0">
            Средние калории с Пн по Вс
          </p>
        </div>

        {peakDay && (
          <span
            className={`font-ndot text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
              peakDay.isOver
                ? 'bg-[#E02424]/15 text-[#E02424]'
                : 'bg-[#2A2A2F] text-white'
            }`}
          >
            {peakDay.label.toUpperCase()} {peakDiffPct >= 0 ? `+${peakDiffPct}%` : `${peakDiffPct}%`}
          </span>
        )}
      </div>

      {/* Vertical Nothing Pulse Bars */}
      <div className="relative h-32 flex items-end justify-between gap-2 pt-4 px-1">
        {/* Target Dotted Reference Line */}
        <div
          className="absolute left-0 right-0 nothing-dotted-divider pointer-events-none"
          style={{ top: `${targetTopPct}%` }}
        />

        {buckets.map((b) => {
          const heightPct = b.avg > 0 ? Math.max(10, Math.round((b.avg / maxVal) * 100)) : 6
          const isHot = b.isOver || (peakDay?.label === b.label && b.avg > targetCalories)
          return (
            <div
              key={b.label}
              className="flex-1 h-full flex flex-col items-center justify-end gap-1.5 relative z-10 group"
              title={b.avg > 0 ? `${b.label}: ср. ${b.avg} ккал (${b.count} дн.)` : `${b.label}: нет данных`}
            >
              {b.avg > 0 && (
                <span className="font-ndot text-[9px] text-[#7A7A82] opacity-0 group-hover:opacity-100 transition-opacity">
                  {b.avg}
                </span>
              )}
              <div
                className={`w-2.5 sm:w-3 rounded-full transition-all duration-500 ${
                  b.avg === 0
                    ? 'bg-[#2A2A2F]'
                    : isHot
                    ? 'bg-[#E02424]'
                    : 'bg-white'
                }`}
                style={{ height: `${heightPct}%` }}
              />
            </div>
          )
        })}
      </div>

      {/* Labels */}
      <div className="flex justify-between font-ndot text-[10px] px-1">
        {buckets.map((b) => (
          <span
            key={b.label}
            className={`flex-1 text-center uppercase ${
              b.isOver ? 'text-[#E02424] font-bold' : 'text-[#7A7A82]'
            }`}
          >
            {b.label}
          </span>
        ))}
      </div>
    </div>
  )
}
