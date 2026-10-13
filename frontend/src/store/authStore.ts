import { create } from 'zustand'
import { User } from '../types'
import { authApi, LoginPayload, RegisterPayload } from '../api/auth'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (credentials: LoginPayload) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => void
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
    set({ isLoading: true, error: null })
    try {
      const response = await authApi.login(credentials)
      localStorage.setItem('kalorii_token', response.access_token)
      set({
        token: response.access_token,
        user: response.user,
        isAuthenticated: true,
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
    set({ isLoading: true, error: null })
    try {
      const response = await authApi.register(payload)
      localStorage.setItem('kalorii_token', response.access_token)
      set({
        token: response.access_token,
        user: response.user,
        isAuthenticated: true,
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

  logout: () => {
    localStorage.removeItem('kalorii_token')
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
      localStorage.removeItem('kalorii_token')
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
