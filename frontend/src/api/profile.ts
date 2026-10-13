import { apiClient } from './client'
import { User, CalculateGoalsParams, NutritionGoals, WeightLog, ProfileCalculateResponse } from '../types'
import { getTodayDateString } from '../store/mealsStore'

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
    const goalMap: Record<string, 'lose_weight' | 'maintain' | 'gain_weight'> = {
      lose: 'lose_weight',
      lose_weight: 'lose_weight',
      maintain: 'maintain',
      gain: 'gain_weight',
      gain_weight: 'gain_weight',
    }

    const payload = {
      height_cm: params.height_cm,
      weight_kg: params.weight_kg ?? params.current_weight_kg ?? 70,
      age: params.age,
      gender: params.gender,
      activity_level: params.activity_level,
      goal: (params.goal || (params.goal_type ? goalMap[params.goal_type] : undefined) || 'maintain'),
    }

    const response = await apiClient<ProfileCalculateResponse>('/profile/calculate', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    return {
      daily_calories_goal: response.daily_calories_goal,
      daily_protein_goal: response.daily_protein_goal,
      daily_fat_goal: response.daily_fat_goal,
      daily_carbs_goal: response.daily_carbs_goal,
      bmr: response.bmr,
      tdee: response.tdee,
    }
  },

  async logWeight(weight_kg: number, log_date?: string): Promise<WeightLog> {
    return apiClient<WeightLog>('/profile/weight', {
      method: 'POST',
      body: JSON.stringify({
        weight_kg,
        log_date: log_date || getTodayDateString(),
      }),
    })
  },

  async getAISettings(): Promise<UserAISettings> {
    return apiClient<UserAISettings>('/profile/ai-settings', {
      method: 'GET',
    })
  },

  async updateAISettings(data: UserAISettingsUpdate): Promise<UserAISettings> {
    return apiClient<UserAISettings>('/profile/ai-settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },
}

export interface AIModelItem {
  id: string
  name: string
  provider: 'gemini' | 'openrouter'
  description: string
  enabled: boolean
}

export interface UserAISettings {
  models?: AIModelItem[]
  gemini_api_key?: string | null
  openrouter_api_key?: string | null
  geminiApiKey?: string | null
  openrouterApiKey?: string | null
  updated_at?: string
  updatedAt?: string
}

export interface UserAISettingsUpdate {
  models?: AIModelItem[]
  gemini_api_key?: string | null
  openrouter_api_key?: string | null
  geminiApiKey?: string | null
  openrouterApiKey?: string | null
}
