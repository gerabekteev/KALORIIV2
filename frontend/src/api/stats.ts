import { apiClient } from './client'
import { StatsResponse, WeightLog } from '../types'

export const statsApi = {
  async getStats(
    period: 'today' | 'week' | 'month' | 'year' | 'custom' = 'week',
    startDate?: string,
    endDate?: string
  ): Promise<StatsResponse> {
    const params = new URLSearchParams()
    params.append('period', period)
    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)

    return apiClient<StatsResponse>(`/stats?${params.toString()}`, {
      method: 'GET',
    })
  },

  async getWeightLogs(): Promise<WeightLog[]> {
    return apiClient<WeightLog[]>('/stats/weight', {
      method: 'GET',
    })
  },
}
