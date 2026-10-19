import { create } from 'zustand'
import { User } from '../types'
import { authApi, LoginPayload, RegisterPayload } from '../api/auth'
import { useMealsStore } from './mealsStore'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (credentials: LoginPayload) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  setUser: (user: User | null) => void
  setError: (error: string | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('kalorii_token'),
  isAuthenticated: !!localStorage.getItem('kalorii_token'),
  isLoading: true,
  error: null,

  login: async (credentials) => {
    set({ error: null })
    try {
      const response = await authApi.login(credentials)
      const accessToken = response.token?.access_token || response.access_token
      const refreshToken = response.token?.refresh_token

      if (accessToken) {
        localStorage.setItem('kalorii_token', accessToken)
      }
      if (refreshToken) {
        localStorage.setItem('kalorii_refresh_token', refreshToken)
      }

      set({
        token: accessToken || null,
        user: response.user,
        isAuthenticated: !!accessToken,
        isLoading: false,
      })
    } catch (err: any) {
      set({
        error: err.message || 'Ошибка авторизации',
        isLoading: false,
      })
      throw err
    }
  },

  register: async (payload) => {
    set({ error: null })
    try {
      const response = await authApi.register(payload)
      const accessToken = response.token?.access_token || response.access_token
      const refreshToken = response.token?.refresh_token

      if (accessToken) {
        localStorage.setItem('kalorii_token', accessToken)
      }
      if (refreshToken) {
        localStorage.setItem('kalorii_refresh_token', refreshToken)
      }

      set({
        token: accessToken || null,
        user: response.user,
        isAuthenticated: !!accessToken,
        isLoading: false,
      })
    } catch (err: any) {
      set({
        error: err.message || 'Ошибка регистрации',
        isLoading: false,
      })
      throw err
    }
  },

  logout: async () => {
    const token = localStorage.getItem('kalorii_token')
    if (token) {
      try {
        await authApi.logout()
      } catch {
        // ignore logout errors
      }
    }
    useMealsStore.getState().resetState()
    localStorage.removeItem('kalorii_token')
    localStorage.removeItem('kalorii_refresh_token')
    localStorage.removeItem('kalorii_ai_settings')
    localStorage.removeItem('kalorii_meal_plans_cache')
    localStorage.removeItem('kalorii_meals_cache_v1')
    localStorage.removeItem('kalorii_offline_meals_queue')
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    })
  },

  checkAuth: async () => {
    const token = localStorage.getItem('kalorii_token')
    if (!token) {
      set({ user: null, isAuthenticated: false, isLoading: false })
      return
    }

    try {
      const user = await authApi.getMe()
      set({ user, isAuthenticated: true, isLoading: false })
    } catch (err) {
      useMealsStore.getState().resetState()
      localStorage.removeItem('kalorii_token')
      localStorage.removeItem('kalorii_refresh_token')
      localStorage.removeItem('kalorii_ai_settings')
      localStorage.removeItem('kalorii_meal_plans_cache')
      set({ user: null, token: null, isAuthenticated: false, isLoading: false })
    }
  },

  setUser: (user) => set({ user }),
  setError: (error) => set({ error }),
}))

// Listen for unauthorized events from API client
if (typeof window !== 'undefined') {
  window.addEventListener('auth:unauthorized', () => {
    useAuthStore.getState().logout()
  })
}
