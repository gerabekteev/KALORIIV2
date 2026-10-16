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
}
