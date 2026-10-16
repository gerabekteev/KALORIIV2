import { apiClient } from './client'
import { getAIHeaders } from './ai'
import { MealPlanGeneratePayload, MealPlanResponse, PlannedMealItem } from '../types'

export const mealPlanApi = {
  async getPlan(date: string): Promise<MealPlanResponse | null> {
    return apiClient<MealPlanResponse | null>(`/meal-plan?date=${encodeURIComponent(date)}`, {
      method: 'GET',
    })
  },

  async generatePlan(payload: MealPlanGeneratePayload): Promise<MealPlanResponse> {
    return apiClient<MealPlanResponse>('/meal-plan/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: getAIHeaders(),
    })
  },

  async savePlanState(payload: {
    plan_date: string
    meals_count: number
    target_calories: number
    target_protein: number
    target_fat: number
    target_carbs: number
    user_preferences?: string | null
    meals: PlannedMealItem[]
  }): Promise<MealPlanResponse> {
    return apiClient<MealPlanResponse>('/meal-plan/save', {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },
}
