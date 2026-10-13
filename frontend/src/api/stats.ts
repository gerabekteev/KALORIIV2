import { apiClient } from './client'
import { StatsResponse, StatsPeriodResponse, WeightLog, WeightStatsResponse } from '../types'

export const statsApi = {
  async getStats(
    period: 'today' | 'day' | 'week' | 'month' | 'year' | 'custom' = 'week',
    startDate?: string,
    endDate?: string
  ): Promise<StatsResponse> {
    // Backend expects 'day' instead of 'today'
    const apiPeriod = period === 'today' ? 'day' : period

    const params = new URLSearchParams()
    params.append('period', apiPeriod)
    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)

    const raw = await apiClient<StatsPeriodResponse>(`/stats?${params.toString()}`, {
      method: 'GET',
    })

    const days = (raw.daily_stats || []).map((d) => ({
      ...d,
      target_calories: d.goal_calories,
    }))

    const totalCal = days.reduce((acc, d) => acc + (d.calories || 0), 0)

    return {
      ...raw,
      days,
      avg_calories: raw.average_calories,
      avg_protein: raw.average_protein,
      avg_fat: raw.average_fat,
      avg_carbs: raw.average_carbs,
      total_calories: totalCal,
      days_tracked: raw.tracked_days,
      target_met_percentage: raw.goal_met_percentage,
    }
  },

  async getWeightStats(): Promise<WeightStatsResponse> {
    return apiClient<WeightStatsResponse>('/stats/weight', {
      method: 'GET',
    })
  },

  async getWeightLogs(): Promise<WeightLog[]> {
    const res = await apiClient<WeightStatsResponse>('/stats/weight', {
      method: 'GET',
    })
    return (res.history || []).map((h) => ({
      ...h,
      log_date: h.date,
      date: h.date,
    }))
  },
}
