import { apiClient } from './client'
import { Meal, CreateMealPayload, UpdateMealPayload, DailyMealsSummary } from '../types'
import { getAIHeaders } from './ai'

export const mealsApi = {
  async getMeals(date?: string): Promise<DailyMealsSummary> {
    const query = date ? `?date=${encodeURIComponent(date)}` : ''
    return apiClient<DailyMealsSummary>(`/meals${query}`, {
      method: 'GET',
    })
  },

  async createMeal(payload: CreateMealPayload): Promise<Meal> {
    return apiClient<Meal>('/meals', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async updateMeal(id: number, payload: UpdateMealPayload): Promise<Meal> {
    return apiClient<Meal>(`/meals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  async deleteMeal(id: number): Promise<void> {
    return apiClient<void>(`/meals/${id}`, {
      method: 'DELETE',
    })
  },

  async recalculateMeal(mealId: number, userComment?: string): Promise<Meal> {
    const headers = getAIHeaders()
    return apiClient<Meal>(`/meals/${mealId}/recalculate`, {
      method: 'POST',
      body: JSON.stringify({ user_comment: userComment }),
      headers,
    })
  },
}
