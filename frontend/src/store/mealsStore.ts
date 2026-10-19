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
import { API_BASE_URL } from '../utils/platform'

export function getTodayDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getPreviousDayString(dateStr: string): string {
  const parts = dateStr.split('-').map(Number)
  if (parts.length !== 3) return dateStr
  const d = new Date(parts[0], parts[1] - 1, parts[2] - 1)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function sortMealsByTime(meals: Meal[]): Meal[] {
  return [...meals].sort((a, b) => (a.meal_time || '').localeCompare(b.meal_time || ''))
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

const MEALS_CACHE_KEY = 'kalorii_meals_cache_v1'
const OFFLINE_QUEUE_KEY = 'kalorii_offline_meals_queue'

function loadCachedDayMeals(dateStr: string): DailyMealsSummary | null {
  try {
    const raw = localStorage.getItem(MEALS_CACHE_KEY)
    if (!raw) return null
    const map = JSON.parse(raw)
    return map?.[dateStr] || null
  } catch {
    return null
  }
}

function saveCachedDayMeals(dateStr: string, summary: DailyMealsSummary): void {
  try {
    const raw = localStorage.getItem(MEALS_CACHE_KEY)
    const map = raw ? JSON.parse(raw) : {}
    map[dateStr] = summary
    // Храним не более 14 последних дат для экономии места
    const keys = Object.keys(map).sort()
    while (keys.length > 14) {
      const oldest = keys.shift()
      if (oldest) delete map[oldest]
    }
    localStorage.setItem(MEALS_CACHE_KEY, JSON.stringify(map))
  } catch {
    // ignore storage errors
  }
}

function getOfflineQueue(): CreateMealPayload[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function setOfflineQueue(queue: CreateMealPayload[]): void {
  try {
    if (queue.length === 0) {
      localStorage.removeItem(OFFLINE_QUEUE_KEY)
    } else {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue))
    }
  } catch {
    // ignore
  }
}

// In-memory timers for undo delete
const pendingDeletes = new Map<number, ReturnType<typeof setTimeout>>()

export function flushOrCancelPendingDeletes(): void {
  for (const [mealId, timer] of pendingDeletes.entries()) {
    clearTimeout(timer)
    pendingDeletes.delete(mealId)
    const token = localStorage.getItem('kalorii_token')
    if (token && mealId > 0) {
      fetch(`${API_BASE_URL}/meals/${mealId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      }).catch(() => {})
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    flushOrCancelPendingDeletes()
  })
}

let latestFetchRequestId = 0

interface MealsState {
  meals: Meal[]
  dailySummary: DailyMealsSummary | null
  previousDayMeals: Meal[]
  selectedDate: string
  isLoading: boolean
  error: string | null
  pendingMeals: PendingAIMeal[]

  setSelectedDate: (date: string) => void
  fetchMeals: (date?: string) => Promise<void>
  fetchPreviousDayMeals: (date?: string) => Promise<void>
  addMeal: (payload: CreateMealPayload) => Promise<Meal>
  updateMeal: (id: number, payload: UpdateMealPayload) => Promise<Meal>
  deleteMeal: (id: number) => Promise<void>
  deleteMealWithUndo: (id: number) => Promise<void>
  copyMealToDate: (mealId: number, targetDate?: string, targetTime?: string) => Promise<Meal>
  copyMultipleMealsToDate: (mealIds: number[], targetDate?: string) => Promise<void>
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
  startVoiceAIAnalysis: (
    audioBlob: Blob,
    targetDate?: string,
    targetTime?: string
  ) => void
  retryPendingMeal: (id: string) => Promise<void>
  dismissPendingMeal: (id: string) => void
  syncOfflineMeals: () => Promise<void>
  resetState: () => void
}

export const useMealsStore = create<MealsState>((set, get) => ({
  meals: [],
  dailySummary: null,
  previousDayMeals: [],
  pendingMeals: [],
  selectedDate: getTodayDateString(),
  isLoading: false,
  error: null,

  resetState: () => {
    flushOrCancelPendingDeletes()
    set({
      meals: [],
      dailySummary: null,
      previousDayMeals: [],
      pendingMeals: [],
      isLoading: false,
      error: null,
    })
  },

  syncOfflineMeals: async () => {
    const queue = getOfflineQueue()
    const token = localStorage.getItem('kalorii_token')
    if (!queue.length || !token) return

    const remaining: CreateMealPayload[] = []
    for (const item of queue) {
      try {
        await mealsApi.createMeal(item)
      } catch {
        remaining.push(item)
      }
    }
    setOfflineQueue(remaining)
    if (remaining.length < queue.length) {
      await get().fetchMeals()
    }
  },

  setSelectedDate: (date: string) => {
    set({ selectedDate: date })
    get().fetchMeals(date)
    get().fetchPreviousDayMeals(date)
  },

  fetchMeals: async (date?: string) => {
    const targetDate = date || get().selectedDate
    const requestId = ++latestFetchRequestId
    set({ isLoading: true, error: null })
    try {
      const data = await mealsApi.getMeals(targetDate)
      if (requestId !== latestFetchRequestId) return

      const rawList = Array.isArray(data) ? data : (data?.meals || [])
      const filteredList = rawList.filter((m) => !pendingDeletes.has(m.id))
      const mealList = sortMealsByTime(filteredList)
      const summaryObj: DailyMealsSummary | null = data && !Array.isArray(data)
        ? (filteredList.length !== rawList.length ? computeUpdatedSummary(data, mealList) : data)
        : null
      set({
        meals: mealList,
        dailySummary: summaryObj,
        isLoading: false,
      })
      if (summaryObj) {
        saveCachedDayMeals(targetDate, summaryObj)
      }
      get().fetchPreviousDayMeals(targetDate)
    } catch (err: any) {
      if (requestId !== latestFetchRequestId) return
      const cached = loadCachedDayMeals(targetDate)
      if (cached && get().meals.length === 0) {
        const cachedMeals = sortMealsByTime(cached.meals || [])
        set({
          meals: cachedMeals,
          dailySummary: cached,
          error: null,
          isLoading: false,
        })
        return
      }
      set({
        error: err.message || 'Ошибка загрузки приемов пищи',
        isLoading: false,
      })
    }
  },

  fetchPreviousDayMeals: async (date?: string) => {
    const baseDate = date || get().selectedDate
    const prevDate = getPreviousDayString(baseDate)
    try {
      const data = await mealsApi.getMeals(prevDate)
      const list = sortMealsByTime(Array.isArray(data) ? data : (data?.meals || []))
      set({ previousDayMeals: list })
    } catch {
      set({ previousDayMeals: [] })
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
          const updatedMeals = sortMealsByTime([newMeal, ...state.meals])
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
      const isNetworkError =
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        err?.name === 'TypeError' ||
        String(err?.message || '').toLowerCase().includes('failed to fetch') ||
        String(err?.message || '').toLowerCase().includes('network')

      if (isNetworkError) {
        const targetDate = payload.meal_date || get().selectedDate
        const tempId = -Date.now()
        const offlineMeal: Meal = {
          id: tempId,
          user_id: 0,
          name: payload.name,
          calories: payload.calories,
          protein: payload.protein,
          fat: payload.fat,
          carbs: payload.carbs,
          weight_grams: payload.weight_grams,
          meal_date: targetDate,
          meal_time: payload.meal_time || new Date().toTimeString().slice(0, 5),
          photo_path: null,
          ai_raw_response: null,
          is_manually_edited: true,
          created_at: new Date().toISOString(),
        }

        setOfflineQueue([...getOfflineQueue(), { ...payload, meal_date: targetDate }])

        if (targetDate === get().selectedDate) {
          set((state) => {
            const updatedMeals = sortMealsByTime([offlineMeal, ...state.meals])
            return {
              meals: updatedMeals,
              dailySummary: computeUpdatedSummary(state.dailySummary, updatedMeals),
              isLoading: false,
              error: null,
            }
          })
        } else {
          set({ isLoading: false, error: null })
        }

        useUIStore.getState().addToast('Сохранено локально (синхронизируется при появлении сети)', 'info')
        return offlineMeal
      }

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
        let updatedMeals: Meal[]
        if (updated.meal_date && updated.meal_date !== state.selectedDate) {
          updatedMeals = state.meals.filter((m) => m.id !== id)
        } else {
          updatedMeals = sortMealsByTime(state.meals.map((m) => (m.id === id ? updated : m)))
        }
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

  deleteMealWithUndo: async (id: number) => {
    const mealToDelete = get().meals.find((m) => m.id === id)
    if (!mealToDelete) return

    // Immediately remove from UI
    set((state) => {
      const updatedMeals = state.meals.filter((m) => m.id !== id)
      return {
        meals: updatedMeals,
        dailySummary: computeUpdatedSummary(state.dailySummary, updatedMeals),
      }
    })

    const existing = pendingDeletes.get(id)
    if (existing) {
      clearTimeout(existing)
    }

    const timer = setTimeout(async () => {
      pendingDeletes.delete(id)
      try {
        await mealsApi.deleteMeal(id)
      } catch (err: any) {
        // Rollback
        set((state) => {
          if (mealToDelete.meal_date !== state.selectedDate) return state
          const exists = state.meals.some((m) => m.id === id)
          if (exists) return state
          const updatedMeals = sortMealsByTime([...state.meals, mealToDelete])
          return {
            meals: updatedMeals,
            dailySummary: computeUpdatedSummary(state.dailySummary, updatedMeals),
          }
        })
        useUIStore.getState().addToast('Не удалось удалить блюдо на сервере', 'error')
      }
    }, 5000)

    pendingDeletes.set(id, timer)

    useUIStore.getState().addToast(
      `"${mealToDelete.name}" удалено`,
      'info',
      5000,
      {
        label: 'Отменить',
        onClick: () => {
          const activeTimer = pendingDeletes.get(id)
          if (activeTimer) {
            clearTimeout(activeTimer)
            pendingDeletes.delete(id)
          }
          set((state) => {
            if (mealToDelete.meal_date !== state.selectedDate) return state
            const exists = state.meals.some((m) => m.id === id)
            if (exists) return state
            const updatedMeals = sortMealsByTime([...state.meals, mealToDelete])
            return {
              meals: updatedMeals,
              dailySummary: computeUpdatedSummary(state.dailySummary, updatedMeals),
            }
          })
          useUIStore.getState().addToast('Удаление отменено', 'success', 2000)
        },
      }
    )
  },

  copyMealToDate: async (mealId: number, targetDate?: string, targetTime?: string) => {
    set({ isLoading: true, error: null })
    try {
      const destDate = targetDate || get().selectedDate
      const copied = await mealsApi.copyMeal(mealId, destDate, targetTime)
      if (copied.meal_date === get().selectedDate) {
        set((state) => {
          const updatedMeals = sortMealsByTime([copied, ...state.meals])
          return {
            meals: updatedMeals,
            dailySummary: computeUpdatedSummary(state.dailySummary, updatedMeals),
            isLoading: false,
          }
        })
      } else {
        set({ isLoading: false })
      }
      useUIStore.getState().addToast(`"${copied.name}" скопировано в дневник!`, 'success', 3000)
      return copied
    } catch (err: any) {
      set({ isLoading: false, error: err.message || 'Ошибка копирования блюда' })
      useUIStore.getState().addToast(err.message || 'Ошибка копирования блюда', 'error')
      throw err
    }
  },

  copyMultipleMealsToDate: async (mealIds: number[], targetDate?: string) => {
    set({ isLoading: true, error: null })
    try {
      const destDate = targetDate || get().selectedDate
      const prevMap = new Map(get().previousDayMeals.map((m) => [m.id, m]))
      const results: Meal[] = []
      for (const id of mealIds) {
        const sourceMeal = prevMap.get(id)
        const preserveTime = sourceMeal?.meal_time ? sourceMeal.meal_time.slice(0, 5) : undefined
        const copied = await mealsApi.copyMeal(id, destDate, preserveTime)
        results.push(copied)
      }
      if (destDate === get().selectedDate) {
        set((state) => {
          const updatedMeals = sortMealsByTime([...results, ...state.meals])
          return {
            meals: updatedMeals,
            dailySummary: computeUpdatedSummary(state.dailySummary, updatedMeals),
            isLoading: false,
          }
        })
      } else {
        set({ isLoading: false })
      }
      useUIStore.getState().addToast(`Скопировано блюд: ${results.length}`, 'success', 3000)
    } catch (err: any) {
      set({ isLoading: false, error: err.message || 'Ошибка копирования блюд' })
      useUIStore.getState().addToast(err.message || 'Ошибка копирования блюд', 'error')
      throw err
    }
  },

  recalculateMeal: async (mealId: number, userComment?: string) => {
    set({ isLoading: true, error: null })
    try {
      const updated = await mealsApi.recalculateMeal(mealId, userComment)
      set((state) => {
        const updatedMeals = sortMealsByTime(state.meals.map((m) => (m.id === mealId ? updated : m)))
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
          ingredients: result.ingredients || [],
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
            const updatedMeals = sortMealsByTime(exists ? state.meals : [newMeal, ...state.meals])
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
          ingredients: result.ingredients || [],
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
            const updatedMeals = sortMealsByTime(exists ? state.meals : [newMeal, ...state.meals])
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

  startVoiceAIAnalysis: (
    audioBlob: Blob,
    targetDate?: string,
    targetTime?: string
  ) => {
    const id = `pending-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    const date = targetDate || get().selectedDate
    const time = targetTime || new Date().toTimeString().slice(0, 5)

    const pendingItem: PendingAIMeal = {
      id,
      type: 'voice',
      audioBlob,
      textDescription: '🎤 Расшифровка голосового описания...',
      targetDate: date,
      targetTime: time,
      status: 'analyzing',
      createdAt: Date.now(),
    }

    set((state) => ({
      pendingMeals: [pendingItem, ...state.pendingMeals],
    }))

    ;(async () => {
      try {
        const result = await aiApi.recognizeVoice(audioBlob)
        // Помещаем расшифрованный текст речи в user_comment (описание продукта),
        // чтобы пользователь на сайте мог свободно его редактировать и пересчитывать через AI!
        const transcriptionComment = (result.transcription || result.name || '').trim()

        const newMeal = await mealsApi.createMeal({
          name: result.name || 'Блюдо (голос)',
          calories: Math.round(result.calories || 0),
          protein: Math.round((result.protein || 0) * 10) / 10,
          fat: Math.round((result.fat || 0) * 10) / 10,
          carbs: Math.round((result.carbs || 0) * 10) / 10,
          weight_grams: result.weight_grams ? Math.round(result.weight_grams) : undefined,
          photo_path: null,
          user_comment: transcriptionComment || null,
          ai_raw_response:
            result.raw_response || (result.model_used ? `Model: ${result.model_used}` : 'AI Voice'),
          ingredients: result.ingredients || [],
          meal_date: date,
          meal_time: time,
          is_manually_edited: false,
        })

        set((state) => ({
          pendingMeals: state.pendingMeals.filter((p) => p.id !== id),
        }))

        if (newMeal.meal_date === get().selectedDate) {
          set((state) => {
            const exists = state.meals.some((m) => m.id === newMeal.id)
            const updatedMeals = sortMealsByTime(exists ? state.meals : [newMeal, ...state.meals])
            return {
              meals: updatedMeals,
              dailySummary: computeUpdatedSummary(state.dailySummary, updatedMeals),
            }
          })
        }

        useUIStore
          .getState()
          .addToast(
            `🎤 "${newMeal.name}" (${Math.round(newMeal.calories)} ккал) распознано и добавлено!`,
            'success',
            4500
          )
      } catch (err: any) {
        const errMsg = err.message || 'Ошибка распознавания голосового сообщения'
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
      } else if (item.type === 'voice' && item.audioBlob) {
        result = await aiApi.recognizeVoice(item.audioBlob)
      } else {
        throw new Error('Недостаточно данных для повтора анализа')
      }

      const mealName =
        result.name ||
        (item.type === 'photo'
          ? 'Распознанное блюдо'
          : item.type === 'voice'
          ? 'Блюдо (голос)'
          : item.textDescription?.slice(0, 30) || 'Блюдо')

      const userComment =
        item.type === 'voice'
          ? (result.transcription || result.name || item.textDescription || '').trim() || null
          : item.comment || item.textDescription || null

      const newMeal = await mealsApi.createMeal({
        name: mealName,
        calories: Math.round(result.calories || 0),
        protein: Math.round((result.protein || 0) * 10) / 10,
        fat: Math.round((result.fat || 0) * 10) / 10,
        carbs: Math.round((result.carbs || 0) * 10) / 10,
        weight_grams: result.weight_grams ? Math.round(result.weight_grams) : undefined,
        photo_path: result.photo_path || null,
        user_comment: userComment,
        ai_raw_response:
          result.raw_response ||
          (result.model_used
            ? `Model: ${result.model_used}`
            : item.type === 'voice'
            ? 'AI Voice'
            : 'AI'),
        ingredients: result.ingredients || [],
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
          const updatedMeals = sortMealsByTime(exists ? state.meals : [newMeal, ...state.meals])
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
        pendingMeals: state.pendingMeals.filter((p) => p.id !== id),
      }
    })
  },
}))
