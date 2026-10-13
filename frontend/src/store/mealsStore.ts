import { create } from 'zustand'
import { Meal, CreateMealPayload, UpdateMealPayload } from '../types'
import { mealsApi } from '../api/meals'

export function getTodayDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface MealsState {
  meals: Meal[]
  selectedDate: string
  isLoading: boolean
  error: string | null
  setSelectedDate: (date: string) => void
  fetchMeals: (date?: string) => Promise<void>
  addMeal: (payload: CreateMealPayload) => Promise<Meal>
  updateMeal: (id: number, payload: UpdateMealPayload) => Promise<Meal>
  deleteMeal: (id: number) => Promise<void>
  getTotals: () => { calories: number; protein: number; fat: number; carbs: number }
}

export const useMealsStore = create<MealsState>((set, get) => ({
  meals: [],
  selectedDate: getTodayDateString(),
  isLoading: false,
  error: null,

  setSelectedDate: (date: string) => {
    set({ selectedDate: date })
    get().fetchMeals(date)
  },

  fetchMeals: async (date?: string) => {
    const targetDate = date || get().selectedDate
    set({ isLoading: true, error: null })
    try {
      const data = await mealsApi.getMeals(targetDate)
      set({ meals: data || [], isLoading: false })
    } catch (err: any) {
      set({
        error: err.message || 'Ошибка загрузки приемов пищи',
        isLoading: false,
      })
    }
  },

  addMeal: async (payload: CreateMealPayload) => {
    set({ isLoading: true, error: null })
    try {
      const targetDate = payload.meal_date || get().selectedDate
      const newMeal = await mealsApi.createMeal({
        ...payload,
        meal_date: targetDate,
      })
      
      // If the meal is added for the currently selected date, add to list
      if (newMeal.meal_date === get().selectedDate) {
        set((state) => ({
          meals: [newMeal, ...state.meals],
          isLoading: false,
        }))
      } else {
        set({ isLoading: false })
      }
      return newMeal
    } catch (err: any) {
      set({
        error: err.message || 'Ошибка добавления еды',
        isLoading: false,
      })
      throw err
    }
  },

  updateMeal: async (id: number, payload: UpdateMealPayload) => {
    set({ isLoading: true, error: null })
    try {
      const updated = await mealsApi.updateMeal(id, payload)
      set((state) => ({
        meals: state.meals.map((m) => (m.id === id ? updated : m)),
        isLoading: false,
      }))
      return updated
    } catch (err: any) {
      set({
        error: err.message || 'Ошибка обновления',
        isLoading: false,
      })
      throw err
    }
  },

  deleteMeal: async (id: number) => {
    set({ isLoading: true, error: null })
    try {
      await mealsApi.deleteMeal(id)
      set((state) => ({
        meals: state.meals.filter((m) => m.id !== id),
        isLoading: false,
      }))
    } catch (err: any) {
      set({
        error: err.message || 'Ошибка удаления',
        isLoading: false,
      })
      throw err
    }
  },

  getTotals: () => {
    const meals = get().meals
    return meals.reduce(
      (acc, meal) => ({
        calories: Math.round(acc.calories + (meal.calories || 0)),
        protein: Math.round((acc.protein + (meal.protein || 0)) * 10) / 10,
        fat: Math.round((acc.fat + (meal.fat || 0)) * 10) / 10,
        carbs: Math.round((acc.carbs + (meal.carbs || 0)) * 10) / 10,
      }),
      { calories: 0, protein: 0, fat: 0, carbs: 0 }
    )
  },
}))
