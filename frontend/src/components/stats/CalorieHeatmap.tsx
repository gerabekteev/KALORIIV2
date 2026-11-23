import React, { useMemo, useState, useEffect } from 'react'
import { StatsDayData } from '../../types'
import { PeriodType } from './PeriodSelector'

interface CalorieHeatmapProps {
  days: StatsDayData[]
  period: PeriodType
  targetCalories: number
  currentStreak?: number
  bestStreak?: number
}

type DayStatus = 'empty' | 'under' | 'ok' | 'over'

interface TileEntry {
  dateStr: string
  dayNum: number
  shortWeekday: string
  fullLabel: string
  calories: number
  goal: number
  status: DayStatus
}

function formatISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function resolveStatus(calories: number, goal: number): DayStatus {
  if (!calories || calories <= 0) return 'empty'
  const safeGoal = goal > 0 ? goal : 2000
  const ratio = calories / safeGoal
  if (ratio > 1.1) return 'over'
  if (ratio >= 0.85) return 'ok'
  return 'under'
}

export const CalorieHeatmap: React.FC<CalorieHeatmapProps> = ({
  days,
  period,
  targetCalories,
  currentStreak = 0,
  bestStreak = 0,
}) => {
  const tiles = useMemo<TileEntry[]>(() => {
    const map = new Map<string, StatsDayData>()
    days.forEach((d) => map.set(d.date, d))

    const today = new Date()

    // Week (7 = 7×1), Month (30 = 6×5 mobile / 10×3 desktop), Year (364 = 26×14 exact full-year day matrix)
    const span = period === 'week' ? 7 : period === 'month' ? 30 : 364
    const result: TileEntry[] = []
    for (let i = span - 1; i >= 0; i--) {
      const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
      const iso = formatISO(dt)
      const rec = map.get(iso)
      const cal = Math.round(rec?.calories || 0)
      const goal = rec?.target_calories || targetCalories
      result.push({
        dateStr: iso,
        dayNum: dt.getDate(),
        shortWeekday: dt.toLocaleDateString('ru-RU', { weekday: 'short' }),
        fullLabel: dt.toLocaleDateString('ru-RU', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }),
        calories: cal,
        goal,
        status: resolveStatus(cal, goal),
      })
    }
    return result
  }, [days, period, targetCalories])

  const [selectedTile, setSelectedTile] = useState<TileEntry | null>(null)

  useEffect(() => {
    const lastTracked = [...tiles].reverse().find((t) => t.calories > 0)
    setSelectedTile(lastTracked || tiles[tiles.length - 1] || null)
  }, [tiles])

  const counts = useMemo(() => {
    return tiles.reduce(
      (acc, t) => {
        acc[t.status] += 1
        return acc
      },
      { empty: 0, under: 0, ok: 0, over: 0 }
    )
  }, [tiles])

  // Strict Nothing X tile styles: White=ok, Gray=under, Red=over, Graphite=empty
  const tileStyle = (st: DayStatus) => {
    switch (st) {
      case 'ok':
        return 'bg-white text-black'
      case 'over':
        return 'bg-[#E02424] text-white'
      case 'under':
        return 'bg-[#6B6B73] text-white'
      default:
        return 'bg-[#242428] text-[#6E6E75]'
    }
  }

  const statusMeta: Record<DayStatus, { label: string; colorClass: string }> = {
    ok: { label: 'В ЦЕЛИ', colorClass: 'text-white' },
    over: { label: 'ПЕРЕБОР', colorClass: 'text-[#E02424]' },
    under: { label: 'НЕДОБОР', colorClass: 'text-[#A1A1AA]' },
    empty: { label: 'НЕТ ЗАПИСЕЙ', colorClass: 'text-[#6E6E75]' },
  }

  const isWeekView = period === 'week'
  const isYearView = period === 'year'

  return (
    <div className="bg-[#1A1A1D] rounded-[22px] p-4 sm:p-5 flex flex-col justify-between space-y-3.5 h-full">
      {/* Adaptive Rectangular Tiles Matrix — stabilized height prevents vertical jumps between Week/Month/Year */}
      <div className="min-h-[186px] flex flex-col justify-center">
        {isWeekView ? (
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {tiles.map((t) => {
              const isSelected = selectedTile?.dateStr === t.dateStr
              return (
                <button
                  key={t.dateStr}
                  type="button"
                  onClick={() => setSelectedTile(t)}
                  onMouseEnter={() => setSelectedTile(t)}
                  className={`rounded-2xl py-2.5 px-1 text-center transition-transform duration-150 cursor-pointer active:scale-95 ${tileStyle(
                    t.status
                  )} ${isSelected ? 'ring-2 ring-white/50 ring-offset-2 ring-offset-[#1A1A1D]' : ''}`}
                >
                  <div className="text-[10px] font-semibold uppercase opacity-80">
                    {t.shortWeekday}
                  </div>
                  <div className="font-ndot text-xs sm:text-sm font-bold mt-1 leading-none">
                    {t.calories > 0 ? t.calories : '—'}
                  </div>
                  <div className="font-ndot text-[9px] opacity-70 mt-1">{t.dayNum}</div>
                </button>
              )
            })}
          </div>
        ) : !isYearView ? (
          /* Month: 30 days -> exact 6×5 rectangle on mobile, 10×3 rectangle on desktop */
          <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5">
            {tiles.map((t) => {
              const isSelected = selectedTile?.dateStr === t.dateStr
              return (
                <button
                  key={t.dateStr}
                  type="button"
                  onClick={() => setSelectedTile(t)}
                  onMouseEnter={() => setSelectedTile(t)}
                  className={`h-8 sm:h-9 rounded-lg flex items-center justify-center font-ndot text-[11px] font-bold transition-transform duration-150 cursor-pointer hover:scale-105 ${tileStyle(
                    t.status
                  )} ${isSelected ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-[#1A1A1D]' : ''}`}
                  title={`${t.fullLabel}: ${t.calories} ккал`}
                >
                  {t.dayNum}
                </button>
              )
            })}
          </div>
        ) : (
          /* Year: 364 individual days -> exact 26×14 rectangle, fits width with zero scroll */
          <div
            className="grid gap-[2px] sm:gap-[3px]"
            style={{ gridTemplateColumns: 'repeat(26, minmax(0, 1fr))' }}
            role="grid"
            aria-label="Годовая матрица калорий по дням"
          >
            {tiles.map((t) => {
              const isSelected = selectedTile?.dateStr === t.dateStr
              return (
                <button
                  key={t.dateStr}
                  type="button"
                  onClick={() => setSelectedTile(t)}
                  onMouseEnter={() => setSelectedTile(t)}
                  className={`aspect-square w-full rounded-[2.5px] sm:rounded-[3px] transition-transform duration-100 cursor-pointer hover:scale-125 ${tileStyle(
                    t.status
                  )} ${isSelected ? 'ring-1 ring-white scale-125 z-10' : ''}`}
                  title={`${t.fullLabel}: ${t.calories} ккал`}
                  aria-label={`${t.fullLabel}: ${t.calories} ккал`}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom Inspector + Streak/Record + Legend inside the same card */}
      <div className="space-y-2.5">
        <div className="nothing-dotted-divider" />

        {selectedTile ? (
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0 truncate">
              <span className="capitalize text-[#A1A1AA] mr-2">{selectedTile.fullLabel}</span>
              <span className="font-ndot font-bold text-white">
                {selectedTile.calories > 0
                  ? `${selectedTile.calories}/${selectedTile.goal}`
                  : '—'}
              </span>
              {selectedTile.calories > 0 && (
                <span className="text-[11px] text-[#7A7A82] ml-1">ккал</span>
              )}
            </div>
            <span
              className={`font-ndot text-[10px] font-bold shrink-0 ${
                statusMeta[selectedTile.status].colorClass
              }`}
            >
              {statusMeta[selectedTile.status].label}
            </span>
          </div>
        ) : null}

        {/* Streak & Record + Color Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px] text-[#7A7A82]">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-baseline gap-1">
              <span>Серия</span>
              <span className="font-ndot text-xs font-bold text-white">{currentStreak}</span>
              <span>дн</span>
              {currentStreak > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#E02424] self-center ml-0.5" />
              )}
            </span>
            <span className="text-[#3F3F46]">·</span>
            <span className="inline-flex items-baseline gap-1">
              <span>Рекорд</span>
              <span className="font-ndot text-xs font-bold text-[#D4D4D8]">{bestStreak}</span>
              <span>дн</span>
            </span>
          </div>

          <div className="flex items-center gap-2.5 text-[10px] text-[#8E8E96]">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-[3px] bg-white" />
              <span>Ок ({counts.ok})</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-[3px] bg-[#6B6B73]" />
              <span>Мало ({counts.under})</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-[3px] bg-[#E02424]" />
              <span>Перебор ({counts.over})</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
