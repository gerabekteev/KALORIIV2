import React from 'react'
import { UtensilsCrossed, Plus } from 'lucide-react'
import { Meal } from '../../types'
import { MealCard } from './MealCard'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Loading'
import { useUIStore } from '../../store/uiStore'

interface MealListProps {
  meals: Meal[]
  isLoading: boolean
}

export const MealList: React.FC<MealListProps> = ({ meals, isLoading }) => {
  const { openAddMeal } = useUIStore()

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    )
  }

  if (meals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-[#18181b]/50 border border-neutral-800/80 rounded-2xl text-center">
        <div className="w-14 h-14 rounded-2xl bg-neutral-800/80 flex items-center justify-center text-neutral-500 mb-3 border border-neutral-700/40">
          <UtensilsCrossed className="w-7 h-7" />
        </div>
        <h4 className="text-base font-semibold text-white">
          Пока нет приемов пищи
        </h4>
        <p className="text-xs text-neutral-400 mt-1 max-w-[240px]">
          Сфотографируйте блюдо для AI распознавания или запишите вручную
        </p>
        <Button
          variant="primary"
          size="sm"
          className="mt-4 gap-1.5"
          onClick={openAddMeal}
        >
          <Plus className="w-4 h-4" /> Добавить блюдо
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {meals.map((meal) => (
        <MealCard key={meal.id} meal={meal} />
      ))}
    </div>
  )
}
