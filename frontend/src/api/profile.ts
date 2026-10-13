import { apiClient } from './client'
import { User, CalculateGoalsParams, NutritionGoals, WeightLog } from '../types'

export const profileApi = {
  async getProfile(): Promise<User> {
    return apiClient<User>('/profile', {
      method: 'GET',
    })
  },

  async updateProfile(profileData: Partial<User>): Promise<User> {
    return apiClient<User>('/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    })
  },

  async calculateGoals(params: CalculateGoalsParams): Promise<NutritionGoals> {
    return apiClient<NutritionGoals>('/profile/calculate', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },

  async logWeight(weight_kg: number, log_date?: string): Promise<WeightLog> {
    return apiClient<WeightLog>('/profile/weight', {
      method: 'POST',
      body: JSON.stringify({
        weight_kg,
        log_date: log_date || new Date().toISOString().split('T')[0],
      }),
    })
  },
}
