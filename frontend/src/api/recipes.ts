import { apiClient } from './client'
import { Recipe } from '../types'

export const recipesApi = {
  async getRecipes(): Promise<Recipe[]> {
    return apiClient<Recipe[]>('/recipes', {
      method: 'GET',
    })
  },

  async createRecipe(recipe: Partial<Recipe>): Promise<Recipe> {
    return apiClient<Recipe>('/recipes', {
      method: 'POST',
      body: JSON.stringify(recipe),
    })
  },

  async toggleFavorite(id: number): Promise<Recipe> {
    return apiClient<Recipe>(`/recipes/${id}/favorite`, {
      method: 'PUT',
    })
  },
}
