import { create } from 'zustand'
import { Meal, AIRecognitionResult } from '../types'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
  duration?: number
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

  addToast: (message: string, type?: ToastType, duration?: number) => void
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

  addToast: (message: string, type: ToastType = 'info', duration = 3000) => {
    const id = Math.random().toString(36).substring(2, 9)
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, duration }],
    }))

    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }))
      }, duration)
    }
  },

  removeToast: (id: string) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}))
