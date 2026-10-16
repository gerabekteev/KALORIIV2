import React, { useState } from 'react'
import { Flame, Target, Award, TrendingUp, BarChart2, PieChart, Scale } from 'lucide-react'
import { useStats } from '../hooks/useStats'
import { useAuthStore } from '../store/authStore'
import { PeriodSelector, PeriodType } from '../components/stats/PeriodSelector'
import { CaloriesBarChart } from '../components/stats/CaloriesBarChart'
import { CaloriesTrendChart } from '../components/stats/CaloriesTrendChart'
import { MacrosPieChart } from '../components/stats/MacrosPieChart'
import { WeightTrendChart } from '../components/stats/WeightTrendChart'
import { ProgressRings } from '../components/stats/ProgressRings'
import { Card } from '../components/ui/Card'
import { PageLoading } from '../components/ui/Loading'
import { pluralizeRu } from '../utils/pluralize'

export const StatsPage: React.FC = () => {
  const { user } = useAuthStore()
  const { period, setPeriod, stats, weightLogs, isLoading } = useStats('week')
  const [chartTab, setChartTab] = useState<'bar' | 'trend'>('bar')

  const targetCalories = user?.daily_calories_goal || 2000

  // Calculate averages & totals from backend StatsPeriodResponse
  const daysTracked = stats?.tracked_days ?? (stats?.days?.length || 0)
  const avgCalories = stats?.average_calories ?? stats?.avg_calories ?? (daysTracked > 0 ? Math.round((stats?.total_calories || 0) / daysTracked) : 0)
  const targetMetPct = stats?.goal_met_percentage ?? stats?.target_met_percentage ?? (daysTracked > 0 && stats?.days ? Math.round((stats.days.filter(d => d.calories >= targetCalories * 0.85 && d.calories <= targetCalories * 1.15).length / daysTracked) * 100) : 0)

  // Sum macros for pie chart
  const totalProtein = stats?.macro_distribution?.protein_grams ?? (stats?.days?.reduce((acc, d) => acc + d.protein, 0) || 0)
  const totalFat = stats?.macro_distribution?.fat_grams ?? (stats?.days?.reduce((acc, d) => acc + d.fat, 0) || 0)
  const totalCarbs = stats?.macro_distribution?.carbs_grams ?? (stats?.days?.reduce((acc, d) => acc + d.carbs, 0) || 0)

  const totalCal = Math.round(stats?.total_calories || 0)
  const formattedTotalCal = totalCal >= 10000
    ? `${(totalCal / 1000).toFixed(1)}k`
    : totalCal.toLocaleString('ru-RU')

  if (isLoading) {
    return <PageLoading message="Загрузка статистики..." />
  }

  return (
    <div className="space-y-4">
      {/* Header & Period Switcher */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-white my-0">
            Статистика питания
          </h1>
          <span className="text-xs text-neutral-400">
            {daysTracked} {pluralizeRu(daysTracked, ['день', 'дня', 'дней'])} в отчете
          </span>
        </div>

        <PeriodSelector
          selectedPeriod={period}
          onSelectPeriod={(p: PeriodType) => setPeriod(p)}
        />
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-3 gap-2.5">
        <Card variant="default" padding="sm" className="text-center">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-1">
            <Flame className="w-4 h-4" />
          </div>
          <span className="text-xs text-neutral-400 block">В среднем</span>
          <span className="text-sm font-bold text-white">
            {avgCalories} <span className="text-[10px] text-neutral-400 font-normal">ккал</span>
          </span>
        </Card>

        <Card variant="default" padding="sm" className="text-center">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto mb-1">
            <Target className="w-4 h-4" />
          </div>
          <span className="text-xs text-neutral-400 block">Цель выполнена</span>
          <span className="text-sm font-bold text-white">
            {targetMetPct}%
          </span>
        </Card>

        <Card variant="default" padding="sm" className="text-center">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto mb-1">
            <Award className="w-4 h-4" />
          </div>
          <span className="text-xs text-neutral-400 block">Всего</span>
          <span className="text-sm font-bold text-white">
            {formattedTotalCal} <span className="text-[10px] text-neutral-400 font-normal">ккал</span>
          </span>
        </Card>
      </div>

      {/* Calories Chart with Bar / Trend toggle */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">
              Калории по дням
            </h3>
          </div>

          <div className="flex bg-[#141418] p-0.5 rounded-lg border border-neutral-800 text-[11px]">
            <button
              onClick={() => setChartTab('bar')}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                chartTab === 'bar'
                  ? 'bg-neutral-700 text-white font-medium'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Столбцы
            </button>
            <button
              onClick={() => setChartTab('trend')}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                chartTab === 'trend'
                  ? 'bg-neutral-700 text-white font-medium'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Тренд
            </button>
          </div>
        </div>

        {chartTab === 'bar' ? (
          <CaloriesBarChart
            data={stats?.days || []}
            targetCalories={targetCalories}
          />
        ) : (
          <CaloriesTrendChart data={stats?.days || []} />
        )}
      </Card>

      {/* Apple Health Style Progress Rings */}
      <Card variant="default" padding="md" className="space-y-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white tracking-tight">
            Кольца баланса (среднее за период)
          </h3>
        </div>
        <ProgressRings
          calories={{
            current: avgCalories,
            target: targetCalories,
          }}
          protein={{
            current: daysTracked > 0 ? Math.round(totalProtein / daysTracked) : 0,
            target: user?.daily_protein_goal || 140,
          }}
          fat={{
            current: daysTracked > 0 ? Math.round(totalFat / daysTracked) : 0,
            target: user?.daily_fat_goal || 73,
          }}
          carbs={{
            current: daysTracked > 0 ? Math.round(totalCarbs / daysTracked) : 0,
            target: user?.daily_carbs_goal || 275,
          }}
        />
      </Card>

      {/* Macros Distribution */}
      <Card variant="default" padding="md" className="space-y-2">
        <div className="flex items-center gap-2">
          <PieChart className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-bold text-white tracking-tight">
            Соотношение Б / Ж / У
          </h3>
        </div>
        <MacrosPieChart
          protein={totalProtein}
          fat={totalFat}
          carbs={totalCarbs}
        />
      </Card>

      {/* Weight Trend Chart */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">
              Динамика веса
            </h3>
          </div>
          {user?.current_weight_kg ? (
            <span className="text-xs font-semibold text-emerald-400">
              Текущий: {user.current_weight_kg} кг
            </span>
          ) : null}
        </div>
        <WeightTrendChart
          logs={weightLogs}
          targetWeight={user?.target_weight_kg}
        />
      </Card>
    </div>
  )
}
