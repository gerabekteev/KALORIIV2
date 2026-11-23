import React, { useMemo } from 'react'
import { Plus, Utensils } from 'lucide-react'
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
      <div className="space-y-2.5">
        <Skeleton className="h-[88px] w-full" />
        <Skeleton className="h-[88px] w-full" />
        <Skeleton className="h-[88px] w-full" />
      </div>
    )
  }

  const hasItems = pendingMealsForDate.length > 0 || sortedMeals.length > 0

  if (!hasItems) {
    return (
      <div className="text-center py-10 px-5 rounded-[22px] bg-[#1A1A1D] space-y-3.5">
        <div className="w-12 h-12 rounded-full bg-[#2A2A2F] text-white flex items-center justify-center mx-auto">
          <Utensils className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white my-0">
            Дневник питания пуст
          </p>
          <p className="text-xs text-[#7A7A82] max-w-xs mx-auto my-0">
            Сфотографируйте блюдо, отсканируйте штрихкод или надиктуйте голосом
          </p>
        </div>
        <button
          type="button"
          onClick={() => openAddMeal()}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-black bg-white hover:bg-neutral-200 px-4 py-2.5 rounded-full transition-colors cursor-pointer active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Добавить</span>
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
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

      <div className="space-y-2.5">
        {sortedMeals.map((meal) => (
          <MealCard key={meal.id} meal={meal} />
        ))}
      </div>

      <div className="pt-1 flex justify-center">
        <button
          type="button"
          onClick={() => openAddMeal()}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-black bg-white hover:bg-neutral-200 px-4 py-2.5 rounded-full transition-colors cursor-pointer active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Добавить</span>
        </button>
      </div>
    </div>
  )
}
