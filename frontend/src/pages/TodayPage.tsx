import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Camera, Sparkles, RotateCcw, ChevronDown, ChevronUp, ChefHat } from 'lucide-react'
import { useMeals } from '../hooks/useMeals'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { useMealsStore } from '../store/mealsStore'
import { useMealPlanStore } from '../store/mealPlanStore'
import { ProgressRing } from '../components/ui/ProgressRing'
import { ProgressBar } from '../components/ui/ProgressBar'
import { Card } from '../components/ui/Card'
import { MealList } from '../components/meals/MealList'
import { WeekStripCalendar } from '../components/meals/WeekStripCalendar'
import { pluralizeRu } from '../utils/pluralize'

export const TodayPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { openAddMeal } = useUIStore()
  const { setPlanDate } = useMealPlanStore()
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

  const [weeklyBank, setWeeklyBank] = useState<{
    balance: number
    isPositive: boolean
    trackedCount: number
  } | null>(null)
  const [showAllRepeats, setShowAllRepeats] = useState(false)

  const dailyGoalCalories = user?.daily_calories_goal || 2000
  const dailyGoalProtein = user?.daily_protein_goal || 140
  const dailyGoalFat = user?.daily_fat_goal || 70
  const dailyGoalCarbs = user?.daily_carbs_goal || 250

  const remainingCalories = Math.max(dailyGoalCalories - totals.calories, 0)
  const remainingProtein = Math.max(Math.round(dailyGoalProtein - totals.protein), 0)
  const remainingFat = Math.max(Math.round(dailyGoalFat - totals.fat), 0)
  const remainingCarbs = Math.max(Math.round(dailyGoalCarbs - totals.carbs), 0)

  const handleOpenSmartMealAssistant = (preset: 'single' | 'protein' | 'remaining') => {
    setPlanDate(selectedDate)
    navigate(`/meal-plan?preset=${preset}&date=${selectedDate}`)
  }

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
        onWeeklyBankChange={setWeeklyBank}
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

      {/* Daily Progress Card — Elevated Glass & Gradient Surface */}
      <Card
        variant="default"
        padding="sm"
        className="relative overflow-hidden bg-gradient-to-b from-[#1b1c22]/95 to-[#14151a]/95 border border-white/[0.08] rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-3.5 sm:p-4"
      >
        <div className="pointer-events-none absolute -top-16 -left-16 w-44 h-44 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex items-center justify-between gap-3 sm:gap-6">
          {/* Compact Circular Calorie Ring */}
          <div className="shrink-0 flex items-center justify-center pl-1 sm:pl-2">
            <ProgressRing
              current={totals.calories}
              target={dailyGoalCalories}
              size={116}
              strokeWidth={9}
            >
              <div className="flex flex-col items-center justify-center text-center">
                <span className="text-xl font-extrabold text-white tracking-tight leading-none">
                  {totals.calories}
                </span>
                <span className="text-[10px] text-neutral-400 font-medium mt-0.5">
                  из {dailyGoalCalories}
                </span>
                <span
                  className={`text-[9px] font-bold mt-1 px-1.5 py-0.5 rounded-full ${
                    totals.calories > dailyGoalCalories
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/20'
                      : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
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
          <div className="flex-1 min-w-0 space-y-2.5 pr-1">
            <ProgressBar
              current={totals.protein}
              target={dailyGoalProtein}
              label={`Белки (ост. ${remainingProtein}г)`}
              color="blue"
              size="sm"
              unit="г"
            />
            <ProgressBar
              current={totals.fat}
              target={dailyGoalFat}
              label={`Жиры (ост. ${remainingFat}г)`}
              color="amber"
              size="sm"
              unit="г"
            />
            <ProgressBar
              current={totals.carbs}
              target={dailyGoalCarbs}
              label={`Углеводы (ост. ${remainingCarbs}г)`}
              color="purple"
              size="sm"
              unit="г"
            />
          </div>
        </div>

        {/* Smart AI Assistant Bar: "What to eat for remaining macros?" */}
        {remainingCalories >= 120 && (
          <div className="mt-3.5 pt-3 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <ChefHat className="w-3.5 h-3.5" />
              </div>
              <span className="text-[11.5px] font-medium text-neutral-300 truncate">
                Что съесть на остаток <b className="text-emerald-400">{remainingCalories} ккал</b>?
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleOpenSmartMealAssistant('single')}
                className="flex-1 sm:flex-initial px-2.5 py-1 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300 transition-all cursor-pointer active:scale-95"
              >
                🍳 1 блюдо
              </button>
              {remainingProtein >= 20 && (
                <button
                  type="button"
                  onClick={() => handleOpenSmartMealAssistant('protein')}
                  className="flex-1 sm:flex-initial px-2.5 py-1 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-[11px] font-semibold text-blue-300 transition-all cursor-pointer active:scale-95"
                >
                  💪 Добрать {remainingProtein}г белка
                </button>
              )}
              <button
                type="button"
                onClick={() => handleOpenSmartMealAssistant('remaining')}
                className="flex-1 sm:flex-initial px-2.5 py-1 rounded-xl bg-neutral-800/80 hover:bg-neutral-700/80 border border-neutral-700/60 text-[11px] font-medium text-neutral-300 hover:text-white transition-all cursor-pointer active:scale-95"
              >
                Рацион
              </button>
            </div>
          </div>
        )}

        {/* Weekly Bank Supportive Status (GC-02) */}
        {totals.calories > dailyGoalCalories && weeklyBank && weeklyBank.isPositive && (
          <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-xs text-emerald-400">
            <span className="flex items-center gap-1.5 font-medium">
              <span>🛡️</span>
              <span>Превышение покрыто банком недели</span>
            </span>
            <span className="font-semibold text-emerald-300">
              +{weeklyBank.balance} ккал в запасе
            </span>
          </div>
        )}
      </Card>

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
          onClick={() => openAddMeal()}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-3.5 py-2 rounded-xl border border-emerald-500/30 transition-all cursor-pointer active:scale-95 min-h-[40px]"
        >
          <Camera className="w-4 h-4" />
          <span>Добавить</span>
        </button>
      </div>

      {/* Meals List */}
      <MealList meals={meals} isLoading={isLoading} />

      {/* Compact Quick Repeat Widget from Previous Day (FEAT-02) - moved to bottom */}
      {previousDayMeals.length > 0 && (
        <div className="bg-[#161619] border border-neutral-800/80 rounded-2xl p-3 space-y-2 mt-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-300">
              <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
              <span>Повторить со вчерашнего дня</span>
              <span className="text-[10px] text-neutral-500 font-mono">
                ({previousDayMeals.length})
              </span>
            </div>
            {previousDayMeals.length > 4 && (
              <button
                type="button"
                onClick={() => setShowAllRepeats((prev) => !prev)}
                className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>{showAllRepeats ? 'Свернуть' : `Все (${previousDayMeals.length})`}</span>
                {showAllRepeats ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            )}
          </div>

          {/* Featured: Yesterday Breakfast Button */}
          {breakfastMeals.length > 0 && (
            <button
              type="button"
              onClick={() =>
                copyMultipleMealsToDate(breakfastMeals.map((m) => m.id))
              }
              className="w-full flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-left transition-all cursor-pointer active:scale-[0.98] group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <RotateCcw className="w-3 h-3 text-emerald-400 group-hover:-rotate-45 transition-transform shrink-0" />
                <span className="text-xs font-medium text-white truncate">
                  Повторить вчерашний завтрак ({breakfastMeals.length} блюд, {breakfastCalories} ккал)
                </span>
              </div>
              <span className="shrink-0 text-[10px] font-semibold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-lg group-hover:bg-emerald-500 group-hover:text-white transition-all ml-2">
                + В дневник
              </span>
            </button>
          )}

          {/* Compact responsive grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {(showAllRepeats ? previousDayMeals : previousDayMeals.slice(0, 4)).map((meal) => (
              <button
                key={meal.id}
                type="button"
                onClick={() => copyMealToDate(meal.id)}
                className="w-full flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-[#131316] hover:bg-[#1a1a1e] border border-neutral-800 hover:border-emerald-500/40 text-neutral-300 hover:text-white transition-all cursor-pointer active:scale-[0.98] group text-left min-w-0"
                title={`Добавить "${meal.name}" в дневник`}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
                  <Plus className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="text-xs font-medium truncate">
                    {meal.name}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-neutral-400 group-hover:text-emerald-400 font-mono shrink-0">
                  {Math.round(meal.calories)} ккал
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
