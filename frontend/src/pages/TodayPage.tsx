import React from 'react'
import { Plus, Camera, Sparkles, RotateCcw } from 'lucide-react'
import { useMeals } from '../hooks/useMeals'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { useMealsStore } from '../store/mealsStore'
import { ProgressRing } from '../components/ui/ProgressRing'
import { ProgressBar } from '../components/ui/ProgressBar'
import { Card } from '../components/ui/Card'
import { MealList } from '../components/meals/MealList'
import { WeekStripCalendar } from '../components/meals/WeekStripCalendar'
import { pluralizeRu } from '../utils/pluralize'

export const TodayPage: React.FC = () => {
  const { user } = useAuthStore()
  const { openAddMeal } = useUIStore()
  const {
    meals,
    selectedDate,
    setSelectedDate,
    isLoading,
    totals,
    pendingMeals,
    goToToday,
  } = useMeals()

  const { previousDayMeals, copyMealToDate, copyMultipleMealsToDate } = useMealsStore()

  const dailyGoalCalories = user?.daily_calories_goal || 2000
  const dailyGoalProtein = user?.daily_protein_goal || 140
  const dailyGoalFat = user?.daily_fat_goal || 70
  const dailyGoalCarbs = user?.daily_carbs_goal || 250

  const remainingCalories = Math.max(dailyGoalCalories - totals.calories, 0)

  // Pending AI meals calculations
  const pendingForCurrentDate = pendingMeals.filter((p) => p.targetDate === selectedDate)
  const pendingAnalyzingCount = pendingForCurrentDate.filter((p) => p.status === 'analyzing').length
  const totalDisplayCount = meals.length + pendingForCurrentDate.length
  const otherDatePendingCount = pendingMeals.filter(
    (p) => p.targetDate !== selectedDate && p.status === 'analyzing'
  ).length

  // Yesterday breakfast calculation for quick repeat banner (FEAT-02)
  const breakfastMeals = previousDayMeals.filter(
    (m) => m.meal_time && m.meal_time >= '05:00' && m.meal_time < '12:00'
  )
  const breakfastCalories = Math.round(
    breakfastMeals.reduce((s, m) => s + (m.calories || 0), 0)
  )

  return (
    <div className="space-y-4">
      {/* 7-Days Week Strip Calendar (FEAT-04) */}
      <WeekStripCalendar
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        currentDayCalories={totals.calories}
        dailyGoalCalories={dailyGoalCalories}
      />

      {/* Other date pending AI indicator */}
      {otherDatePendingCount > 0 && (
        <div className="flex items-center justify-between bg-emerald-950/40 border border-emerald-500/30 rounded-xl px-3.5 py-2 text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
            <span>
              AI в фоне анализирует {otherDatePendingCount}{' '}
              {pluralizeRu(otherDatePendingCount, ['блюдо', 'блюда', 'блюд'])}...
            </span>
          </div>
          <button
            onClick={goToToday}
            className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-200 underline cursor-pointer"
          >
            К сегодня
          </button>
        </div>
      )}

      {/* Daily Progress Card — Compact side-by-side layout */}
      <Card
        variant="default"
        padding="sm"
        className="bg-[#18181c]/90 border border-neutral-800/80 rounded-2xl shadow-md p-3 sm:p-4"
      >
        <div className="flex items-center justify-between gap-3 sm:gap-6">
          {/* Compact Circular Calorie Ring */}
          <div className="shrink-0 flex items-center justify-center pl-1 sm:pl-2">
            <ProgressRing
              current={totals.calories}
              target={dailyGoalCalories}
              size={114}
              strokeWidth={9}
            >
              <div className="flex flex-col items-center justify-center text-center">
                <span className="text-xl font-extrabold text-white tracking-tight leading-none">
                  {totals.calories}
                </span>
                <span className="text-[10px] text-neutral-400 font-medium mt-0.5">
                  ккал
                </span>
                <span
                  className={`text-[9px] font-semibold mt-1 px-1.5 py-0.5 rounded-full ${
                    totals.calories > dailyGoalCalories
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'bg-emerald-500/15 text-emerald-400'
                  }`}
                >
                  {totals.calories > dailyGoalCalories
                    ? `+${totals.calories - dailyGoalCalories}`
                    : `ост. ${remainingCalories}`}
                </span>
              </div>
            </ProgressRing>
          </div>

          {/* Macros Progress Bars */}
          <div className="flex-1 min-w-0 space-y-2 sm:space-y-2.5 pr-1">
            <ProgressBar
              current={totals.protein}
              target={dailyGoalProtein}
              label="Белки"
              color="blue"
              size="sm"
              unit="г"
            />
            <ProgressBar
              current={totals.fat}
              target={dailyGoalFat}
              label="Жиры"
              color="amber"
              size="sm"
              unit="г"
            />
            <ProgressBar
              current={totals.carbs}
              target={dailyGoalCarbs}
              label="Углеводы"
              color="purple"
              size="sm"
              unit="г"
            />
          </div>
        </div>
      </Card>

      {/* Quick Repeat Widget from Previous Day (FEAT-02) */}
      {previousDayMeals.length > 0 && (
        <div className="bg-[#18181c] border border-neutral-800/80 rounded-2xl p-3 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-300">
              <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
              <span>Повторить со вчерашнего дня</span>
            </div>
            {breakfastMeals.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  copyMultipleMealsToDate(breakfastMeals.map((m) => m.id))
                }
                className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 rounded-xl transition-all cursor-pointer active:scale-95"
              >
                Вчерашний завтрак ({breakfastMeals.length} • {breakfastCalories} ккал)
              </button>
            )}
          </div>

          {/* Horizontal scroll chips strip */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
            {previousDayMeals.map((meal) => (
              <button
                key={meal.id}
                type="button"
                onClick={() => copyMealToDate(meal.id)}
                className="inline-flex items-center gap-1.5 bg-[#141417] hover:bg-neutral-800 border border-neutral-800 hover:border-emerald-500/40 text-neutral-300 hover:text-white px-2.5 py-1.5 rounded-xl text-xs shrink-0 transition-colors cursor-pointer active:scale-95 group"
                title={`Добавить "${meal.name}" в дневник`}
              >
                <Plus className="w-3 h-3 text-emerald-400 group-hover:scale-110 transition-transform" />
                <span className="font-medium max-w-[130px] truncate">{meal.name}</span>
                <span className="text-[10px] text-neutral-500 font-mono">
                  {Math.round(meal.calories)} ккал
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Meals List Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight my-0">
            Приёмы пищи
          </h2>
          <p className="text-xs text-neutral-400">
            {pendingAnalyzingCount > 0 ? (
              <span className="text-emerald-400 font-medium inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3 animate-spin" />
                {pendingAnalyzingCount} на AI анализе...
                {meals.length > 0 && ` (${meals.length} сохранено)`}
              </span>
            ) : totalDisplayCount > 0 ? (
              `${totalDisplayCount} ${pluralizeRu(totalDisplayCount, ['запись', 'записи', 'записей'])} за день`
            ) : (
              'Дневник питания пуст'
            )}
          </p>
        </div>

        <button
          onClick={openAddMeal}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-3.5 py-2 rounded-xl border border-emerald-500/30 transition-all cursor-pointer active:scale-95 min-h-[40px]"
        >
          <Camera className="w-4 h-4" />
          <span>Добавить</span>
        </button>
      </div>

      {/* Meals List */}
      <MealList meals={meals} isLoading={isLoading} />
    </div>
  )
}
