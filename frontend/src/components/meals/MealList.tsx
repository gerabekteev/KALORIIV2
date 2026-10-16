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

interface SlotConfig {
  id: string
  title: string
  icon: string
  timeRange: string
  presetTime: string
}

const SLOTS_CONFIG: SlotConfig[] = [
  {
    id: 'breakfast',
    title: 'Завтрак',
    icon: '☀️',
    timeRange: '05:00 – 11:29',
    presetTime: '09:00',
  },
  {
    id: 'lunch',
    title: 'Обед',
    icon: '🍲',
    timeRange: '11:30 – 16:29',
    presetTime: '13:30',
  },
  {
    id: 'snack',
    title: 'Перекус',
    icon: '🍏',
    timeRange: '16:30 – 18:29',
    presetTime: '17:00',
  },
  {
    id: 'dinner',
    title: 'Ужин',
    icon: '🌙',
    timeRange: '18:30 – 04:59',
    presetTime: '19:30',
  },
]

function getSlotForTime(timeStr?: string): string {
  if (!timeStr) return 'snack'
  const t = timeStr.slice(0, 5)
  if (t >= '05:00' && t <= '11:29') return 'breakfast'
  if (t >= '11:30' && t <= '16:29') return 'lunch'
  if (t >= '16:30' && t <= '18:29') return 'snack'
  return 'dinner'
}

export const MealList: React.FC<MealListProps> = ({ meals, isLoading }) => {
  const { openAddMeal } = useUIStore()
  const { pendingMeals, selectedDate, retryPendingMeal, dismissPendingMeal } = useMealsStore()

  const pendingMealsForDate = pendingMeals.filter(
    (item) => item.targetDate === selectedDate
  )

  const groupedSlots = useMemo(() => {
    return SLOTS_CONFIG.map((config) => {
      const slotMeals = meals.filter((m) => getSlotForTime(m.meal_time) === config.id)
      const totalCal = slotMeals.reduce((sum, m) => sum + (m.calories || 0), 0)
      const totalProtein = slotMeals.reduce((sum, m) => sum + (m.protein || 0), 0)
      const totalFat = slotMeals.reduce((sum, m) => sum + (m.fat || 0), 0)
      const totalCarbs = slotMeals.reduce((sum, m) => sum + (m.carbs || 0), 0)

      return {
        ...config,
        meals: slotMeals,
        totalCal: Math.round(totalCal),
        totalProtein: Math.round(totalProtein * 10) / 10,
        totalFat: Math.round(totalFat * 10) / 10,
        totalCarbs: Math.round(totalCarbs * 10) / 10,
      }
    })
  }, [meals])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
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

      {/* 4 Diary Slots: Breakfast, Lunch, Snack, Dinner */}
      {groupedSlots.map((slot) => (
        <div key={slot.id} className="space-y-2">
          {/* Slot Header */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm select-none">{slot.icon}</span>
              <h3 className="text-xs font-bold text-white tracking-wide uppercase">
                {slot.title}
              </h3>
              <span className="text-[10px] text-neutral-500 font-medium ml-1">
                {slot.timeRange}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {slot.meals.length > 0 && (
                <span className="text-[11px] font-semibold text-emerald-400">
                  {slot.totalCal} ккал
                  <span className="text-[10px] text-neutral-400 font-normal ml-1 hidden sm:inline">
                    (Б:{slot.totalProtein} Ж:{slot.totalFat} У:{slot.totalCarbs})
                  </span>
                </span>
              )}
              <button
                type="button"
                onClick={() => openAddMeal(slot.presetTime)}
                className="w-6 h-6 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 hover:text-emerald-400 flex items-center justify-center transition-colors cursor-pointer"
                title={`Добавить в ${slot.title.toLowerCase()}`}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Slot Meals or Add Prompt */}
          {slot.meals.length > 0 ? (
            <div className="space-y-2.5">
              {slot.meals.map((meal) => (
                <MealCard key={meal.id} meal={meal} />
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => openAddMeal(slot.presetTime)}
              className="w-full py-2.5 px-3 rounded-xl border border-dashed border-neutral-800/70 hover:border-emerald-500/30 bg-[#161619]/40 hover:bg-[#1a1a1f] text-neutral-400 hover:text-emerald-300 text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer group"
            >
              <Plus className="w-3.5 h-3.5 text-neutral-400 group-hover:text-emerald-400" />
              <span>Записать {slot.title.toLowerCase()}</span>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
