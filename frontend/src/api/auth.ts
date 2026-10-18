import { apiClient } from './client'
import { AuthResponse, Token, User } from '../types'

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  password: string
  name: string
}

export interface PasswordChangePayload {
  current_password: string
  new_password: string
}

export const authApi = {
  async login(payload: LoginPayload): Promise<AuthResponse> {
    return apiClient<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async register(payload: RegisterPayload): Promise<AuthResponse> {
    return apiClient<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async refresh(refreshToken?: string): Promise<Token> {
    const token = refreshToken || localStorage.getItem('kalorii_refresh_token') || ''
    return apiClient<Token>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: token }),
    })
  },

  async getMe(): Promise<User> {
    return apiClient<User>('/auth/me', {
      method: 'GET',
    })
  },

  async logout(): Promise<void> {
    await apiClient<{ message: string }>('/auth/logout', {
      method: 'POST',
    })
  },

  async changePassword(payload: PasswordChangePayload): Promise<AuthResponse> {
    return apiClient<AuthResponse>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
}
