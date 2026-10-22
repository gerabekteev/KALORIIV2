import { create } from 'zustand'
import { AuthResponse, User } from '../types'
import { authApi, LoginPayload, RegisterPayload } from '../api/auth'
import { useMealsStore, flushOrCancelPendingDeletes } from './mealsStore'
import { useMealPlanStore } from './mealPlanStore'

const CACHED_USER_KEY = 'kalorii_cached_user'

function saveCachedUser(user: User | null) {
  try {
    if (user) {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(CACHED_USER_KEY)
    }
  } catch {
    // ignore storage errors
  }
}

function loadCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

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
  updateSessionFromAuthResponse: (response: AuthResponse) => void
  setError: (error: string | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: loadCachedUser(),
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
      saveCachedUser(response.user)

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
      saveCachedUser(response.user)

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
    // Сначала отправляем отложенные удаления, пока токен ещё валиден на сервере
    flushOrCancelPendingDeletes()

    const token = localStorage.getItem('kalorii_token')
    if (token) {
      try {
        await authApi.logout()
      } catch {
        // ignore logout errors
      }
    }
    useMealsStore.getState().resetState()
    useMealPlanStore.setState({ plansByDate: {}, error: null })
    saveCachedUser(null)
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
      saveCachedUser(user)
      set({ user, isAuthenticated: true, isLoading: false })
    } catch (err: any) {
      const isAuthError = err?.status === 401 || err?.status === 403
      const cachedUser = loadCachedUser()
      if (!isAuthError && cachedUser) {
        // Офлайн-запуск или временный сбой сети: сохраняем сессию из кеша
        set({ user: cachedUser, isAuthenticated: true, isLoading: false })
        return
      }
      useMealsStore.getState().resetState()
      useMealPlanStore.setState({ plansByDate: {}, error: null })
      saveCachedUser(null)
      localStorage.removeItem('kalorii_token')
      localStorage.removeItem('kalorii_refresh_token')
      localStorage.removeItem('kalorii_ai_settings')
      localStorage.removeItem('kalorii_meal_plans_cache')
      set({ user: null, token: null, isAuthenticated: false, isLoading: false })
    }
  },

  setUser: (user) => {
    saveCachedUser(user)
    set({ user })
  },

  updateSessionFromAuthResponse: (response) => {
    const accessToken = response.token?.access_token || response.access_token
    const refreshToken = response.token?.refresh_token
    if (accessToken) {
      localStorage.setItem('kalorii_token', accessToken)
    }
    if (refreshToken) {
      localStorage.setItem('kalorii_refresh_token', refreshToken)
    }
    if (response.user) {
      saveCachedUser(response.user)
    }
    set((state) => ({
      token: accessToken || state.token,
      user: response.user || state.user,
      isAuthenticated: true,
    }))
  },

  setError: (error) => set({ error }),
}))

// Listen for unauthorized events from API client
if (typeof window !== 'undefined') {
  window.addEventListener('auth:unauthorized', () => {
    useAuthStore.getState().logout()
  })
}
