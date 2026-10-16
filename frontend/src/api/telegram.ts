import { apiClient } from './client'
import { TelegramStatusResponse } from '../types'

export const telegramApi = {
  async getStatus(): Promise<TelegramStatusResponse> {
    return apiClient<TelegramStatusResponse>('/telegram/status', {
      method: 'GET',
    })
  },

  async generateLinkCode(): Promise<TelegramStatusResponse> {
    return apiClient<TelegramStatusResponse>('/telegram/link-code', {
      method: 'POST',
    })
  },

  async unlink(): Promise<TelegramStatusResponse> {
    return apiClient<TelegramStatusResponse>('/telegram/unlink', {
      method: 'DELETE',
    })
  },

  async sendShoppingList(payload: {
    items: Array<{
      name: string
      total_grams: number
      category?: string
      checked?: boolean
    }>
    notes?: string
  }): Promise<{ success: boolean; message: string }> {
    return apiClient<{ success: boolean; message: string }>('/telegram/send-shopping-list', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
}
