import { create } from 'zustand'
import {
  Meal,
  CreateMealPayload,
  UpdateMealPayload,
  DailyMealsSummary,
  PendingAIMeal,
} from '../types'
import { mealsApi } from '../api/meals'
import { aiApi } from '../api/ai'
import { useUIStore } from './uiStore'

export function getTodayDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function computeUpdatedSummary(
  summary: DailyMealsSummary | null,
  meals: Meal[]
): DailyMealsSummary | null {
  if (!summary) return null
  return {
    ...summary,
    total_calories: Math.round(meals.reduce((sum, m) => sum + (m.calories || 0), 0) * 10) / 10,
    total_protein: Math.round(meals.reduce((sum, m) => sum + (m.protein || 0), 0) * 10) / 10,
    total_fat: Math.round(meals.reduce((sum, m) => sum + (m.fat || 0), 0) * 10) / 10,
    total_carbs: Math.round(meals.reduce((sum, m) => sum + (m.carbs || 0), 0) * 10) / 10,
    meals,
  }
}

interface MealsState {
  meals: Meal[]
  dailySummary: DailyMealsSummary | null
  selectedDate: string
  isLoading: boolean
  error: string | null
  pendingMeals: PendingAIMeal[]

  setSelectedDate: (date: string) => void
  fetchMeals: (date?: string) => Promise<void>
  addMeal: (payload: CreateMealPayload) => Promise<Meal>
  updateMeal: (id: number, payload: UpdateMealPayload) => Promise<Meal>
  deleteMeal: (id: number) => Promise<void>
  recalculateMeal: (mealId: number, userComment?: string) => Promise<Meal>
  getTotals: () => { calories: number; protein: number; fat: number; carbs: number }

  startPhotoAIAnalysis: (
    photoFile: File,
    userComment?: string,
    targetDate?: string,
    targetTime?: string
  ) => void
  startTextAIAnalysis: (
    text: string,
    targetDate?: string,
    targetTime?: string
  ) => void
  retryPendingMeal: (id: string) => Promise<void>
  dismissPendingMeal: (id: string) => void
}

export const useMealsStore = create<MealsState>((set, get) => ({
  meals: [],
  dailySummary: null,
  pendingMeals: [],
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
      const mealList = Array.isArray(data) ? data : (data?.meals || [])
      set({
        meals: mealList,
        dailySummary: data && !Array.isArray(data) ? data : null,
        isLoading: false,
      })
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
        set((state) => {
          const updatedMeals = [newMeal, ...state.meals]
          return {
            meals: updatedMeals,
            dailySummary: computeUpdatedSummary(state.dailySummary, updatedMeals),
            isLoading: false,
          }
        })
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
      set((state) => {
        const updatedMeals = state.meals.map((m) => (m.id === id ? updated : m))
        return {
          meals: updatedMeals,
          dailySummary: computeUpdatedSummary(state.dailySummary, updatedMeals),
          isLoading: false,
        }
      })
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
      set((state) => {
        const updatedMeals = state.meals.filter((m) => m.id !== id)
        return {
          meals: updatedMeals,
          dailySummary: computeUpdatedSummary(state.dailySummary, updatedMeals),
          isLoading: false,
        }
      })
    } catch (err: any) {
      set({
        error: err.message || 'Ошибка удаления',
        isLoading: false,
      })
      throw err
    }
  },

  recalculateMeal: async (mealId: number, userComment?: string) => {
    set({ isLoading: true, error: null })
    try {
      const updated = await mealsApi.recalculateMeal(mealId, userComment)
      set((state) => {
        const updatedMeals = state.meals.map((m) => (m.id === mealId ? updated : m))
        return {
          meals: updatedMeals,
          dailySummary: computeUpdatedSummary(state.dailySummary, updatedMeals),
          isLoading: false,
        }
      })
      return updated
    } catch (err: any) {
      set({
        error: err.message || 'Ошибка пересчёта блюда через AI',
        isLoading: false,
      })
      throw err
    }
  },

  getTotals: () => {
    const meals = get().meals
    if (!Array.isArray(meals)) {
      return { calories: 0, protein: 0, fat: 0, carbs: 0 }
    }
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

  startPhotoAIAnalysis: (
    photoFile: File,
    userComment?: string,
    targetDate?: string,
    targetTime?: string
  ) => {
    const id = `pending-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    let previewUrl: string | undefined = undefined
    try {
      previewUrl = URL.createObjectURL(photoFile)
    } catch {
      // ignore
    }
    const date = targetDate || get().selectedDate
    const time = targetTime || new Date().toTimeString().slice(0, 5)

    const pendingItem: PendingAIMeal = {
      id,
      type: 'photo',
      photoFile,
      previewUrl,
      comment: userComment,
      targetDate: date,
      targetTime: time,
      status: 'analyzing',
      createdAt: Date.now(),
    }

    set((state) => ({
      pendingMeals: [pendingItem, ...state.pendingMeals],
    }))

    // Background asynchronous execution
    ;(async () => {
      try {
        const result = await aiApi.recognizeFood(photoFile, userComment)

        const newMeal = await mealsApi.createMeal({
          name: result.name || 'Распознанное блюдо',
          calories: Math.round(result.calories || 0),
          protein: Math.round((result.protein || 0) * 10) / 10,
          fat: Math.round((result.fat || 0) * 10) / 10,
          carbs: Math.round((result.carbs || 0) * 10) / 10,
          weight_grams: result.weight_grams ? Math.round(result.weight_grams) : undefined,
          photo_path: result.photo_path || null,
          user_comment: userComment?.trim() || null,
          ai_raw_response:
            result.raw_response || (result.model_used ? `Model: ${result.model_used}` : 'AI'),
          meal_date: date,
          meal_time: time,
          is_manually_edited: false,
        })

        // Clean up pending item and its object URL
        set((state) => {
          const item = state.pendingMeals.find((p) => p.id === id)
          if (item?.previewUrl) {
            try {
              URL.revokeObjectURL(item.previewUrl)
            } catch {}
          }
          return {
            pendingMeals: state.pendingMeals.filter((p) => p.id !== id),
          }
        })

        // Add to active meals list if currently viewed date matches
        if (newMeal.meal_date === get().selectedDate) {
          set((state) => {
            const exists = state.meals.some((m) => m.id === newMeal.id)
            const updatedMeals = exists ? state.meals : [newMeal, ...state.meals]
            return {
              meals: updatedMeals,
              dailySummary: computeUpdatedSummary(state.dailySummary, updatedMeals),
            }
          })
        }

        useUIStore
          .getState()
          .addToast(
            `✨ "${newMeal.name}" (${Math.round(newMeal.calories)} ккал) добавлено в дневник!`,
            'success',
            4500
          )
      } catch (err: any) {
        const errMsg = err.message || 'Ошибка распознавания блюда через AI'
        set((state) => ({
          pendingMeals: state.pendingMeals.map((p) =>
            p.id === id ? { ...p, status: 'error', errorMessage: errMsg } : p
          ),
        }))
        useUIStore.getState().addToast(errMsg, 'error', 5000)
      }
    })()
  },

  startTextAIAnalysis: (
    text: string,
    targetDate?: string,
    targetTime?: string
  ) => {
    const id = `pending-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    const date = targetDate || get().selectedDate
    const time = targetTime || new Date().toTimeString().slice(0, 5)

    const pendingItem: PendingAIMeal = {
      id,
      type: 'text',
      textDescription: text,
      targetDate: date,
      targetTime: time,
      status: 'analyzing',
      createdAt: Date.now(),
    }

    set((state) => ({
      pendingMeals: [pendingItem, ...state.pendingMeals],
    }))

    // Background asynchronous execution
    ;(async () => {
      try {
        const result = await aiApi.analyzeText(text)

        const newMeal = await mealsApi.createMeal({
          name: result.name || text.slice(0, 30),
          calories: Math.round(result.calories || 0),
          protein: Math.round((result.protein || 0) * 10) / 10,
          fat: Math.round((result.fat || 0) * 10) / 10,
          carbs: Math.round((result.carbs || 0) * 10) / 10,
          weight_grams: result.weight_grams ? Math.round(result.weight_grams) : undefined,
          photo_path: null,
          user_comment: text.trim(),
          ai_raw_response:
            result.raw_response || (result.model_used ? `Model: ${result.model_used}` : 'AI'),
          meal_date: date,
          meal_time: time,
          is_manually_edited: false,
        })

        // Clean up pending item
        set((state) => ({
          pendingMeals: state.pendingMeals.filter((p) => p.id !== id),
        }))

        // Add to active meals list if currently viewed date matches
        if (newMeal.meal_date === get().selectedDate) {
          set((state) => {
            const exists = state.meals.some((m) => m.id === newMeal.id)
            const updatedMeals = exists ? state.meals : [newMeal, ...state.meals]
            return {
              meals: updatedMeals,
              dailySummary: computeUpdatedSummary(state.dailySummary, updatedMeals),
            }
          })
        }

        useUIStore
          .getState()
          .addToast(
            `✨ "${newMeal.name}" (${Math.round(newMeal.calories)} ккал) добавлено в дневник!`,
            'success',
            4500
          )
      } catch (err: any) {
        const errMsg = err.message || 'Ошибка расчёта КБЖУ по тексту через AI'
        set((state) => ({
          pendingMeals: state.pendingMeals.map((p) =>
            p.id === id ? { ...p, status: 'error', errorMessage: errMsg } : p
          ),
        }))
        useUIStore.getState().addToast(errMsg, 'error', 5000)
      }
    })()
  },

  retryPendingMeal: async (id: string) => {
    const item = get().pendingMeals.find((p) => p.id === id)
    if (!item) return

    set((state) => ({
      pendingMeals: state.pendingMeals.map((p) =>
        p.id === id ? { ...p, status: 'analyzing', errorMessage: undefined } : p
      ),
    }))

    try {
      let result: any
      if (item.type === 'photo' && item.photoFile) {
        result = await aiApi.recognizeFood(item.photoFile, item.comment)
      } else if (item.type === 'text' && item.textDescription) {
        result = await aiApi.analyzeText(item.textDescription)
      } else {
        throw new Error('Недостаточно данных для повтора анализа')
      }

      const newMeal = await mealsApi.createMeal({
        name:
          result.name ||
          (item.type === 'photo'
            ? 'Распознанное блюдо'
            : item.textDescription?.slice(0, 30) || 'Блюдо'),
        calories: Math.round(result.calories || 0),
        protein: Math.round((result.protein || 0) * 10) / 10,
        fat: Math.round((result.fat || 0) * 10) / 10,
        carbs: Math.round((result.carbs || 0) * 10) / 10,
        weight_grams: result.weight_grams ? Math.round(result.weight_grams) : undefined,
        photo_path: result.photo_path || null,
        user_comment: item.comment || item.textDescription || null,
        ai_raw_response:
          result.raw_response || (result.model_used ? `Model: ${result.model_used}` : 'AI'),
        meal_date: item.targetDate,
        meal_time: item.targetTime,
        is_manually_edited: false,
      })

      // Clean up pending item and its preview URL
      set((state) => {
        const p = state.pendingMeals.find((m) => m.id === id)
        if (p?.previewUrl) {
          try {
            URL.revokeObjectURL(p.previewUrl)
          } catch {}
        }
        return {
          pendingMeals: state.pendingMeals.filter((m) => m.id !== id),
        }
      })

      if (newMeal.meal_date === get().selectedDate) {
        set((state) => {
          const exists = state.meals.some((m) => m.id === newMeal.id)
          const updatedMeals = exists ? state.meals : [newMeal, ...state.meals]
          return {
            meals: updatedMeals,
            dailySummary: computeUpdatedSummary(state.dailySummary, updatedMeals),
          }
        })
      }

      useUIStore
        .getState()
        .addToast(
          `✨ "${newMeal.name}" (${Math.round(newMeal.calories)} ккал) добавлено в дневник!`,
          'success',
          4500
        )
    } catch (err: any) {
      const errMsg = err.message || 'Ошибка повторного анализа AI'
      set((state) => ({
        pendingMeals: state.pendingMeals.map((p) =>
          p.id === id ? { ...p, status: 'error', errorMessage: errMsg } : p
        ),
      }))
      useUIStore.getState().addToast(errMsg, 'error', 5000)
    }
  },

  dismissPendingMeal: (id: string) => {
    set((state) => {
      const p = state.pendingMeals.find((m) => m.id === id)
      if (p?.previewUrl) {
        try {
          URL.revokeObjectURL(p.previewUrl)
        } catch {}
      }
      return {
        pendingMeals: state.pendingMeals.filter((m) => m.id !== id),
      }
    })
  },
}))
