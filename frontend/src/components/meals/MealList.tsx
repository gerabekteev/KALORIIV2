import React, { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { Meal } from '../../types'
import { MealCard } from './MealCard'
import { PendingMealCard } from './PendingMealCard'
import { Skeleton } from '../ui/Loading'
import { useUIStore } from '../../store/uiStore'
import { useMealsStore } from '../../store/mealsStore'

interface MealListProps {
  meals: Meal[]
  isLoading: boolean
}

export const MealList: React.FC<MealListProps> = ({ meals, isLoading }) => {
  const { openAddMeal } = useUIStore()
  const { pendingMeals, selectedDate, retryPendingMeal, dismissPendingMeal } = useMealsStore()

  const pendingMealsForDate = pendingMeals.filter(
    (item) => item.targetDate === selectedDate
  )

  // Reverse chronological sort: newest meals first (dinner/evening at the top, morning at bottom)
  const sortedMeals = useMemo(() => {
    return [...meals].sort((a, b) => {
      const timeA = a.meal_time || ''
      const timeB = b.meal_time || ''
      if (timeA !== timeB) {
        return timeB.localeCompare(timeA)
      }
      return (b.id || 0) - (a.id || 0)
    })
  }, [meals])

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    )
  }

  const hasItems = pendingMealsForDate.length > 0 || sortedMeals.length > 0

  if (!hasItems) {
    return (
      <div className="text-center py-8 px-4 rounded-2xl border border-dashed border-neutral-800/80 bg-[#161619]/40 space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-neutral-800/60 text-neutral-400 flex items-center justify-center mx-auto text-xl">
          🍽️
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-neutral-300">
            Дневник питания пуст
          </p>
          <p className="text-xs text-neutral-500 max-w-xs mx-auto">
            Нажмите «Добавить», чтобы сфотографировать еду или записать приём пищи
          </p>
        </div>
        <button
          type="button"
          onClick={() => openAddMeal()}
          className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-3.5 py-2 rounded-xl border border-emerald-500/30 transition-all cursor-pointer active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Записать блюдо</span>
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Pending meals currently being processed by AI */}
      {pendingMealsForDate.length > 0 && (
        <div className="space-y-2.5">
          {pendingMealsForDate.map((pending) => (
            <PendingMealCard
              key={pending.id}
              pendingMeal={pending}
              onRetry={retryPendingMeal}
              onDismiss={dismissPendingMeal}
            />
          ))}
        </div>
      )}

      {/* Sequential Meals List (Newest first) */}
      <div className="space-y-2.5">
        {sortedMeals.map((meal) => (
          <MealCard key={meal.id} meal={meal} />
        ))}
      </div>
    </div>
  )
}
