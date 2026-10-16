import { create } from 'zustand'
import { MealPlanResponse, PlannedMealItem } from '../types'
import { mealPlanApi } from '../api/mealPlan'
import { getTodayDateString } from './mealsStore'
import { useUIStore } from './uiStore'

const CACHE_KEY = 'kalorii_meal_plans_cache'

function loadLocalPlansCache(): Record<string, MealPlanResponse> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed
    }
  } catch {}
  return {}
}

function saveLocalPlansCache(plans: Record<string, MealPlanResponse>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(plans))
  } catch {}
}

interface MealPlanState {
  planDate: string
  plansByDate: Record<string, MealPlanResponse>
  isLoading: boolean
  isGenerating: boolean
  error: string | null

  setPlanDate: (date: string) => void
  fetchPlanForDate: (date: string) => Promise<MealPlanResponse | null>
  generatePlan: (params: {
    planDate: string
    mealsCount: number
    targetCalories: number
    targetProtein: number
    targetFat: number
    targetCarbs: number
    userPreferences?: string
    onlyUnlocked?: boolean
  }) => Promise<MealPlanResponse>
  toggleLockMeal: (planDate: string, mealId: string) => Promise<void>
  markMealAddedToDiary: (planDate: string, mealId: string) => Promise<void>
}

export const useMealPlanStore = create<MealPlanState>((set, get) => ({
  planDate: getTodayDateString(),
  plansByDate: loadLocalPlansCache(),
  isLoading: false,
  isGenerating: false,
  error: null,

  setPlanDate: (date: string) => {
    set({ planDate: date })
    get().fetchPlanForDate(date)
  },

  fetchPlanForDate: async (date: string) => {
    set({ isLoading: true, error: null })
    try {
      const serverPlan = await mealPlanApi.getPlan(date)
      if (serverPlan) {
        set((state) => {
          const next = { ...state.plansByDate, [date]: serverPlan }
          saveLocalPlansCache(next)
          return { plansByDate: next, isLoading: false }
        })
        return serverPlan
      }
      set({ isLoading: false })
      return get().plansByDate[date] || null
    } catch {
      set({ isLoading: false })
      return get().plansByDate[date] || null
    }
  },

  generatePlan: async ({
    planDate,
    mealsCount,
    targetCalories,
    targetProtein,
    targetFat,
    targetCarbs,
    userPreferences,
    onlyUnlocked = false,
  }) => {
    set({ isGenerating: true, error: null })
    try {
      const existingPlan = get().plansByDate[planDate]
      const lockedMeals =
        onlyUnlocked && existingPlan
          ? existingPlan.meals.filter((m) => m.locked)
          : []

      const generated = await mealPlanApi.generatePlan({
        plan_date: planDate,
        meals_count: mealsCount,
        target_calories: targetCalories,
        target_protein: targetProtein,
        target_fat: targetFat,
        target_carbs: targetCarbs,
        user_preferences: userPreferences?.trim() || null,
        locked_meals: lockedMeals,
      })

      set((state) => {
        const next = { ...state.plansByDate, [planDate]: generated }
        saveLocalPlansCache(next)
        return { plansByDate: next, isGenerating: false }
      })

      useUIStore
        .getState()
        .addToast('✨ Меню успешно сгенерировано и сохранено!', 'success', 3500)
      return generated
    } catch (err: any) {
      const msg = err.message || 'Ошибка генерации меню через AI'
      set({ error: msg, isGenerating: false })
      useUIStore.getState().addToast(msg, 'error', 4500)
      throw err
    }
  },

  toggleLockMeal: async (planDate: string, mealId: string) => {
    const plan = get().plansByDate[planDate]
    if (!plan) return

    const updatedMeals = plan.meals.map((m) =>
      m.id === mealId ? { ...m, locked: !m.locked } : m
    )
    const optimistic: MealPlanResponse = { ...plan, meals: updatedMeals }

    set((state) => {
      const next = { ...state.plansByDate, [planDate]: optimistic }
      saveLocalPlansCache(next)
      return { plansByDate: next }
    })

    try {
      await mealPlanApi.savePlanState({
        plan_date: planDate,
        meals_count: plan.meals_count,
        target_calories: plan.target_calories,
        target_protein: plan.target_protein,
        target_fat: plan.target_fat,
        target_carbs: plan.target_carbs,
        user_preferences: plan.user_preferences,
        meals: updatedMeals,
      })
    } catch {}
  },

  markMealAddedToDiary: async (planDate: string, mealId: string) => {
    const plan = get().plansByDate[planDate]
    if (!plan) return

    const updatedMeals = plan.meals.map((m) =>
      m.id === mealId ? { ...m, added_to_diary: true } : m
    )
    const optimistic: MealPlanResponse = { ...plan, meals: updatedMeals }

    set((state) => {
      const next = { ...state.plansByDate, [planDate]: optimistic }
      saveLocalPlansCache(next)
      return { plansByDate: next }
    })

    try {
      await mealPlanApi.savePlanState({
        plan_date: planDate,
        meals_count: plan.meals_count,
        target_calories: plan.target_calories,
        target_protein: plan.target_protein,
        target_fat: plan.target_fat,
        target_carbs: plan.target_carbs,
        user_preferences: plan.user_preferences,
        meals: updatedMeals,
      })
    } catch {}
  },
}))
