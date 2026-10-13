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

      {/* Daily Progress Card */}
      <Card variant="default" padding="md" className="space-y-5">
        <div className="flex flex-col sm:flex-row items-center justify-around gap-5">
          {/* Circular Calorie Ring */}
          <div className="relative">
            <ProgressRing
              current={totals.calories}
              target={dailyGoalCalories}
              size={170}
              strokeWidth={13}
              label="ккал"
              sublabel={
                totals.calories > dailyGoalCalories
                  ? `+${totals.calories - dailyGoalCalories} сверх нормы`
                  : `осталось ${remainingCalories} ккал`
              }
              showPercentage
            />
          </div>

          {/* Macros Progress Bars */}
          <div className="w-full sm:w-1/2 space-y-3.5">
            <ProgressBar
              current={totals.protein}
              target={dailyGoalProtein}
              label="Белки"
              color="blue"
              unit="г"
            />
            <ProgressBar
              current={totals.fat}
              target={dailyGoalFat}
              label="Жиры"
              color="amber"
              unit="г"
            />
            <ProgressBar
              current={totals.carbs}
              target={dailyGoalCarbs}
              label="Углеводы"
              color="purple"
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

      {/* Floating Action Button (FAB) for quick meal addition */}
      <div className="fixed bottom-20 right-4 sm:right-auto sm:left-1/2 sm:translate-x-32 z-30">
        <button
          onClick={openAddMeal}
          className="flex items-center gap-2.5 px-5 py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 active:scale-95 text-white font-semibold text-sm rounded-full shadow-xl shadow-emerald-500/35 border border-emerald-400/30 transition-all duration-200 cursor-pointer"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          <span className="hidden xs:inline flex items-center gap-1.5 font-bold">
            <Sparkles className="w-4 h-4" /> Добавить еду
          </span>
        </button>
      </div>
    </div>
  )
}
