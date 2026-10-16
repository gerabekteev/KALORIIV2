import { create } from 'zustand'
import { Meal, AIRecognitionResult } from '../types'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: string
  message: string
  type: ToastType
  duration?: number
  action?: ToastAction
}

interface UIState {
  isAddMealOpen: boolean
  isEditMealOpen: boolean
  isAIResultOpen: boolean
  editingMeal: Meal | null
  aiResultData: AIRecognitionResult | null
  aiPhotoFile: File | null

  toasts: ToastItem[]

  openAddMeal: () => void
  closeAddMeal: () => void

  openEditMeal: (meal: Meal) => void
  closeEditMeal: () => void

  openAIResult: (result: AIRecognitionResult, photoFile?: File | null) => void
  closeAIResult: () => void

  addToast: (
    message: string,
    type?: ToastType,
    duration?: number,
    action?: ToastAction
  ) => void
  removeToast: (id: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  isAddMealOpen: false,
  isEditMealOpen: false,
  isAIResultOpen: false,
  editingMeal: null,
  aiResultData: null,
  aiPhotoFile: null,

  toasts: [],

  openAddMeal: () => set({ isAddMealOpen: true }),
  closeAddMeal: () => set({ isAddMealOpen: false }),

  openEditMeal: (meal: Meal) => set({ isEditMealOpen: true, editingMeal: meal }),
  closeEditMeal: () => set({ isEditMealOpen: false, editingMeal: null }),

  openAIResult: (result: AIRecognitionResult, photoFile: File | null = null) =>
    set({ isAIResultOpen: true, aiResultData: result, aiPhotoFile: photoFile }),
  closeAIResult: () =>
    set({ isAIResultOpen: false, aiResultData: null, aiPhotoFile: null }),

  addToast: (
    message: string,
    type: ToastType = 'info',
    duration = 3000,
    action?: ToastAction
  ) => {
    set((state) => {
      // 1. Deduplication: if an active toast with the same message exists, replace it if action is present, otherwise ignore
      let currentToasts = state.toasts
      if (action) {
        currentToasts = currentToasts.filter((t) => t.message !== message)
      } else if (currentToasts.some((t) => t.message === message)) {
        return state
      }

      // 2. Limit capacity: keep at most 2 existing toasts so there are never more than 3 on screen
      const current = currentToasts.length >= 3 ? currentToasts.slice(-2) : currentToasts
      const id = Math.random().toString(36).substring(2, 9)

      if (duration > 0) {
        setTimeout(() => {
          set((s) => ({
            toasts: s.toasts.filter((t) => t.id !== id),
          }))
        }, duration)
      }

      return {
        toasts: [...current, { id, message, type, duration, action }],
      }
    })
  },

  removeToast: (id: string) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}))
