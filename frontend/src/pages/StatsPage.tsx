import React, { useMemo, useState, useEffect, useRef } from 'react'
import { AlertCircle } from 'lucide-react'
import { useStats } from '../hooks/useStats'
import { useAuthStore } from '../store/authStore'
import { StatsResponse } from '../types'
import { PeriodSelector, PeriodType } from '../components/stats/PeriodSelector'
import { CaloriesBarChart } from '../components/stats/CaloriesBarChart'
import { CaloriesTrendChart } from '../components/stats/CaloriesTrendChart'
import { MacrosPieChart } from '../components/stats/MacrosPieChart'
import { WeightTrendChart } from '../components/stats/WeightTrendChart'
import { ProgressRings } from '../components/stats/ProgressRings'
import { CalorieHeatmap } from '../components/stats/CalorieHeatmap'
import { WeekdayRhythmChart } from '../components/stats/WeekdayRhythmChart'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { PageLoading } from '../components/ui/Loading'
import { pluralizeRu } from '../utils/pluralize'

interface StatsSnapshot {
  stats: StatsResponse
  period: PeriodType
}

function computeSnapshotMetrics(
  snap: StatsSnapshot | null,
  targetCalories: number
) {
  const s = snap?.stats
  const daysList = s?.days || []
  const tracked = daysList.filter((d) => (d.calories || 0) > 0)
  const sortedTracked = [...tracked].sort((a, b) => a.date.localeCompare(b.date))

  let bestStreak = 0
  let running = 0
  let prevDateMs: number | null = null

  sortedTracked.forEach((d) => {
    const goal = d.target_calories || targetCalories
    const ratio = goal > 0 ? d.calories / goal : 0
    const isGood = ratio >= 0.7 && ratio <= 1.1
    const [y, m, day] = d.date.split('-').map(Number)
    const curMs = new Date(y, m - 1, day).getTime()
    const isConsecutive = prevDateMs !== null && curMs - prevDateMs <= 86400000 * 1.5

    if (isGood) {
      running = isConsecutive ? running + 1 : 1
      if (running > bestStreak) bestStreak = running
    } else {
      running = 0
    }
    prevDateMs = curMs
  })

  let currentStreak = 0
  for (let i = sortedTracked.length - 1; i >= 0; i--) {
    const d = sortedTracked[i]
    const goal = d.target_calories || targetCalories
    const ratio = goal > 0 ? d.calories / goal : 0
    if (ratio >= 0.7 && ratio <= 1.1) {
      currentStreak++
    } else {
      break
    }
  }

  const daysTracked = s?.tracked_days ?? daysList.length
  const avgCalories =
    s?.average_calories ??
    s?.avg_calories ??
    (daysTracked > 0 ? Math.round((s?.total_calories || 0) / daysTracked) : 0)

  const totalProtein =
    s?.macro_distribution?.protein_grams ??
    daysList.reduce((acc, d) => acc + d.protein, 0)
  const totalFat =
    s?.macro_distribution?.fat_grams ??
    daysList.reduce((acc, d) => acc + d.fat, 0)
  const totalCarbs =
    s?.macro_distribution?.carbs_grams ??
    daysList.reduce((acc, d) => acc + d.carbs, 0)

  return {
    period: snap?.period || 'month',
    daysList,
    daysTracked,
    avgCalories,
    totalProtein,
    totalFat,
    totalCarbs,
    currentStreak,
    bestStreak,
  }
}

type ComputedMetrics = ReturnType<typeof computeSnapshotMetrics>

const STATS_WIPE_DURATION_MS = 800
const STATS_WIPE_CLEANUP_MS = 830

interface StatsPageProps {
  isActive?: boolean
}

export const StatsPage: React.FC<StatsPageProps> = ({ isActive = true }) => {
  const { user } = useAuthStore()
  const {
    period,
    setPeriod,
    stats,
    statsPeriod,
    weightLogs,
    isLoading,
    error,
    refetch,
  } = useStats('month')

  // Silently refresh stats in background when swiping/navigating back to Stats tab
  const wasActiveRef = useRef(isActive)
  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      refetch()
    }
    wasActiveRef.current = isActive
  }, [isActive, refetch])

  const [chartTab, setChartTab] = useState<'bar' | 'trend'>('bar')
  const [macroMode, setMacroMode] = useState<'grams' | 'calories'>('grams')

  const targetCalories = user?.daily_calories_goal || 2000
  const targetProtein = user?.daily_protein_goal || 140
  const targetFat = user?.daily_fat_goal || 70
  const targetCarbs = user?.daily_carbs_goal || 250

  // Continuous zero-jitter top-to-bottom Wipe state
  const [wipe, setWipe] = useState<{
    id: number
    active: boolean
    prev: StatsSnapshot | null
    next: StatsSnapshot | null
  }>({
    id: 0,
    active: false,
    prev: null,
    next: null,
  })

  const committedRef = useRef<StatsSnapshot | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!stats) return
    const incoming: StatsSnapshot = { stats, period: statsPeriod }
    const previous = committedRef.current

    if (!previous) {
      committedRef.current = incoming
      return
    }

    if (previous.period !== incoming.period) {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      committedRef.current = incoming

      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

      if (prefersReduced) {
        setWipe((w) => ({ id: w.id + 1, active: false, prev: null, next: incoming }))
        return
      }

      setWipe((w) => ({
        id: w.id + 1,
        active: true,
        prev: previous,
        next: incoming,
      }))

      timerRef.current = window.setTimeout(() => {
        setWipe((w) => ({ ...w, active: false, prev: null }))
        timerRef.current = null
      }, STATS_WIPE_CLEANUP_MS)
    } else {
      committedRef.current = incoming
      setWipe((w) => ({ ...w, next: incoming }))
    }
  }, [stats, statsPeriod])

  const liveSnapshot: StatsSnapshot | null = stats
    ? { stats, period: statsPeriod }
    : wipe.next

  const prevMetrics = useMemo(
    () => computeSnapshotMetrics(wipe.prev, targetCalories),
    [wipe.prev, targetCalories]
  )

  const nextMetrics = useMemo(
    () => computeSnapshotMetrics(wipe.active ? wipe.next : liveSnapshot, targetCalories),
    [wipe.active, wipe.next, liveSnapshot, targetCalories]
  )

  const isWipeActive = wipe.active && !!wipe.prev && !!wipe.next

  if (isLoading && !stats) {
    return <PageLoading message="Загрузка статистики..." />
  }

  if (error && !stats) {
    return (
      <div className="space-y-4">
        <h1 className="hidden lg:block text-2xl font-semibold tracking-tight text-white my-0">
          Статистика
        </h1>
        <Card variant="default" padding="lg" className="text-center space-y-3 py-10">
          <div className="w-11 h-11 rounded-full bg-[#E02424]/15 text-[#E02424] flex items-center justify-center mx-auto">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white my-0">Не удалось загрузить статистику</p>
            <p className="text-xs text-[#7A7A82] mt-1 my-0">{error}</p>
          </div>
          <Button size="sm" variant="primary" onClick={() => refetch()} className="mx-auto">
            Повторить
          </Button>
        </Card>
      </div>
    )
  }

  const renderStatsStack = (m: ComputedMetrics, interactive: boolean) => {
    const avgPct = targetCalories > 0 ? Math.round((m.avgCalories / targetCalories) * 100) : 0
    const avgBarPct = Math.min(100, Math.max(0, avgPct))
    const isAvgOver = avgPct > 105

    return (
      <div className="space-y-4">
        {/* Flagship Hero Summary Card (Variant A — clean hierarchy, zero duplicated KPIs) */}
        <div className="bg-[#1A1A1D] rounded-[22px] p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#A1A1AA]">В среднем в день</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[#8E8E96] bg-[#111113] px-2.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E02424]" />
              <span>
                <span className="font-ndot text-white font-bold">{m.daysTracked}</span>{' '}
                {pluralizeRu(m.daysTracked, ['день', 'дня', 'дней'])} с записями
              </span>
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              <span
                className={`font-ndot text-[34px] sm:text-[38px] font-bold leading-none ${
                  isAvgOver ? 'text-[#E02424]' : 'text-white'
                }`}
              >
                {m.avgCalories}
              </span>
              <span className="text-xs text-[#7A7A82]">
                / <span className="font-ndot">{targetCalories}</span> ккал
              </span>
            </div>
            <span
              className={`font-ndot text-xs font-bold ${
                isAvgOver ? 'text-[#E02424]' : 'text-white'
              }`}
            >
              {avgPct}%
            </span>
          </div>

          <div className="w-full h-1.5 rounded-full bg-[#2A2A2F] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#E02424] transition-all duration-500 ease-out"
              style={{ width: `${avgBarPct}%` }}
            />
          </div>
        </div>

        {/* Row 2: Discipline Matrix (with Streak & Record inside) + Weekday Rhythm */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
          <div className="lg:col-span-7">
            <CalorieHeatmap
              days={m.daysList}
              period={m.period}
              targetCalories={targetCalories}
              currentStreak={m.currentStreak}
              bestStreak={m.bestStreak}
            />
          </div>
          <div className="lg:col-span-5">
            <WeekdayRhythmChart
              days={m.daysList}
              targetCalories={targetCalories}
            />
          </div>
        </div>

      {/* Row 4: Calories Bar / Trend Chart */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight my-0">
              Калории по дням
            </h3>
            <p className="text-[11px] text-[#7A7A82] mt-0.5 my-0">
              Пунктир — дневная цель ({targetCalories} ккал)
            </p>
          </div>

          <div className="flex bg-[#111113] p-1 rounded-full text-[11px] gap-0.5">
            <button
              type="button"
              onClick={() => interactive && setChartTab('bar')}
              className={`px-3 py-1 rounded-full transition-colors cursor-pointer font-semibold ${
                chartTab === 'bar'
                  ? 'bg-white text-black'
                  : 'text-[#8E8E96] hover:text-white'
              }`}
            >
              Столбцы
            </button>
            <button
              type="button"
              onClick={() => interactive && setChartTab('trend')}
              className={`px-3 py-1 rounded-full transition-colors cursor-pointer font-semibold ${
                chartTab === 'trend'
                  ? 'bg-white text-black'
                  : 'text-[#8E8E96] hover:text-white'
              }`}
            >
              Тренд
            </button>
          </div>
        </div>

        {chartTab === 'bar' ? (
          <CaloriesBarChart data={m.daysList} targetCalories={targetCalories} />
        ) : (
          <CaloriesTrendChart data={m.daysList} />
        )}
      </Card>

      {/* Row 5: Concentric Rings + Macros Ratio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        <Card variant="default" padding="md" className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight my-0">
              Кольца баланса
            </h3>
            <p className="text-[11px] text-[#7A7A82] mt-0.5 my-0">
              Средние показатели за период
            </p>
          </div>
          <ProgressRings
            calories={{ current: m.avgCalories, target: targetCalories }}
            protein={{
              current: m.daysTracked > 0 ? Math.round(m.totalProtein / m.daysTracked) : 0,
              target: targetProtein,
            }}
            fat={{
              current: m.daysTracked > 0 ? Math.round(m.totalFat / m.daysTracked) : 0,
              target: targetFat,
            }}
            carbs={{
              current: m.daysTracked > 0 ? Math.round(m.totalCarbs / m.daysTracked) : 0,
              target: targetCarbs,
            }}
          />
        </Card>

        <Card variant="default" padding="md" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white tracking-tight my-0">
                Соотношение Б / Ж / У
              </h3>
              <p className="text-[11px] text-[#7A7A82] mt-0.5 my-0">
                Распределение за период
              </p>
            </div>

            <div className="flex bg-[#111113] p-1 rounded-full text-[11px] gap-0.5">
              <button
                type="button"
                onClick={() => interactive && setMacroMode('grams')}
                className={`px-2.5 py-1 rounded-full transition-colors cursor-pointer font-semibold ${
                  macroMode === 'grams'
                    ? 'bg-white text-black'
                    : 'text-[#8E8E96] hover:text-white'
                }`}
              >
                Граммы
              </button>
              <button
                type="button"
                onClick={() => interactive && setMacroMode('calories')}
                className={`px-2.5 py-1 rounded-full transition-colors cursor-pointer font-semibold ${
                  macroMode === 'calories'
                    ? 'bg-white text-black'
                    : 'text-[#8E8E96] hover:text-white'
                }`}
              >
                Ккал
              </button>
            </div>
          </div>

          <MacrosPieChart
            protein={m.totalProtein}
            fat={m.totalFat}
            carbs={m.totalCarbs}
            mode={macroMode}
          />
        </Card>
      </div>

      {/* Row 6: Weight Trend Chart */}
      <Card variant="default" padding="md" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight my-0">
              Динамика веса
            </h3>
            <p className="text-[11px] text-[#7A7A82] mt-0.5 my-0">
              История замеров и целевой вес
            </p>
          </div>
          {user?.current_weight_kg ? (
            <span className="font-ndot text-sm font-bold text-white bg-[#111113] px-3 py-1 rounded-full">
              {user.current_weight_kg} кг
            </span>
          ) : null}
        </div>
        <WeightTrendChart logs={weightLogs} targetWeight={user?.target_weight_kg} />
      </Card>
    </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header & Sliding 3-Period Switcher (Неделя / Месяц / Год) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <h1 className="hidden lg:block text-2xl font-semibold tracking-tight text-white my-0">
          Статистика
        </h1>

        <div className="w-full lg:w-auto lg:min-w-[300px]">
          <PeriodSelector
            selectedPeriod={period}
            onSelectPeriod={(p: PeriodType) => setPeriod(p)}
          />
        </div>
      </div>

      {/* Top-to-Bottom Zero-Jitter Wipe Container (starts cleanly at top edge right under PeriodSelector) */}
      <div
        className="relative overflow-hidden rounded-[22px]"
        style={{ '--wipe-duration': `${STATS_WIPE_DURATION_MS}ms` } as React.CSSProperties}
      >
        {isWipeActive
          ? renderStatsStack(prevMetrics, false)
          : renderStatsStack(nextMetrics, true)}

        {isWipeActive && (
          <>
            <div
              key={`wipe-layer-${wipe.id}`}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-20 bg-black wave-mode-wipe-reveal"
            >
              {renderStatsStack(nextMetrics, false)}
            </div>
            <div
              key={`wipe-line-${wipe.id}`}
              aria-hidden="true"
              className="wave-mode-wipe-line"
            />
          </>
        )}
      </div>
    </div>
  )
}
