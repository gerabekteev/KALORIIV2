import React from 'react'
import { ChevronLeft, ChevronRight, Calendar, Plus, Camera, Sparkles } from 'lucide-react'
import { useMeals } from '../hooks/useMeals'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { getTodayDateString } from '../store/mealsStore'
import { ProgressRing } from '../components/ui/ProgressRing'
import { ProgressBar } from '../components/ui/ProgressBar'
import { Card } from '../components/ui/Card'
import { MealList } from '../components/meals/MealList'

export const TodayPage: React.FC = () => {
  const { user } = useAuthStore()
  const { openAddMeal } = useUIStore()
  const {
    meals,
    selectedDate,
    isLoading,
    totals,
    pendingMeals,
    goToPreviousDay,
    goToNextDay,
    goToToday,
  } = useMeals()

  const dailyGoalCalories = user?.daily_calories_goal || 2200
  const dailyGoalProtein = user?.daily_protein_goal || 140
  const dailyGoalFat = user?.daily_fat_goal || 73
  const dailyGoalCarbs = user?.daily_carbs_goal || 275

  // Date formatting
  const todayStr = getTodayDateString()
  const isToday = selectedDate === todayStr

  const [year, month, day] = selectedDate.split('-').map(Number)
  const dateObj = new Date(year, month - 1, day)
  const formattedDate = dateObj.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
  })

  const remainingCalories = Math.max(dailyGoalCalories - totals.calories, 0)

  // Pending AI meals calculations
  const pendingForCurrentDate = pendingMeals.filter((p) => p.targetDate === selectedDate)
  const pendingAnalyzingCount = pendingForCurrentDate.filter((p) => p.status === 'analyzing').length
  const totalDisplayCount = meals.length + pendingForCurrentDate.length
  const otherDatePendingCount = pendingMeals.filter(
    (p) => p.targetDate !== selectedDate && p.status === 'analyzing'
  ).length

  return (
    <div className="space-y-4">
      {/* Date Navigation Bar */}
      <div className="flex items-center justify-between bg-[#19191d] px-3 py-2 rounded-2xl border border-neutral-800/80 shadow-md">
        <button
          onClick={goToPreviousDay}
          className="p-2 sm:p-1.5 min-w-[42px] min-h-[42px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition-colors cursor-pointer active:scale-95"
          title="Предыдущий день"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-white capitalize">
            {isToday ? `Сегодня, ${formattedDate}` : formattedDate}
          </span>
          {!isToday && (
            <button
              onClick={goToToday}
              className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 ml-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 transition-all cursor-pointer active:scale-95"
            >
              Сегодня
            </button>
          )}
        </div>

        <button
          onClick={goToNextDay}
          className="p-2 sm:p-1.5 min-w-[42px] min-h-[42px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition-colors cursor-pointer active:scale-95"
          title="Следующий день"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Other date pending AI indicator */}
      {otherDatePendingCount > 0 && (
        <div className="flex items-center justify-between bg-emerald-950/40 border border-emerald-500/30 rounded-xl px-3.5 py-2 text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
            <span>
              AI в фоне анализирует {otherDatePendingCount}{' '}
              {otherDatePendingCount === 1 ? 'блюдо' : 'блюда'}...
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

      {/* Daily Progress Card — Compact, space-efficient side-by-side layout */}
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
              `${totalDisplayCount} ${totalDisplayCount === 1 ? 'запись' : 'записи'} за день`
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
