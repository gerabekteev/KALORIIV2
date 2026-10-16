import { apiClient } from './client'
import { Recipe, Meal } from '../types'
import { productsApi } from './products'

export interface CreateRecipePayload {
  name: string
  description?: string | null
  items?: Array<{
    product_id: number
    weight_grams: number
  }>
  total_calories?: number
  total_protein?: number
  total_fat?: number
  total_carbs?: number
  total_weight_grams?: number
}

export const recipesApi = {
  async getRecipes(favoriteOnly?: boolean): Promise<Recipe[]> {
    const query = favoriteOnly ? '?favorite_only=true' : ''
    return apiClient<Recipe[]>(`/recipes${query}`, {
      method: 'GET',
    })
  },

  async createRecipe(payload: CreateRecipePayload): Promise<Recipe> {
    return apiClient<Recipe>('/recipes', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async toggleFavorite(id: number): Promise<Recipe> {
    return apiClient<Recipe>(`/recipes/${id}/favorite`, {
      method: 'PUT',
    })
  },

  async deleteRecipe(id: number): Promise<void> {
    return apiClient<void>(`/recipes/${id}`, {
      method: 'DELETE',
    })
  },

  /**
   * Helper to quickly create a recipe from arbitrary KBJU data directly without cluttering products table
   */
  async createQuickRecipe(data: {
    name: string
    description?: string
    calories: number
    protein: number
    fat: number
    carbs: number
    weight_grams?: number
  }): Promise<Recipe> {
    const weight = data.weight_grams && data.weight_grams > 0 ? Number(data.weight_grams) : 100
    const calories = Math.max(0, Number(data.calories) || 0)
    const protein = Math.max(0, Number(data.protein) || 0)
    const fat = Math.max(0, Number(data.fat) || 0)
    const carbs = Math.max(0, Number(data.carbs) || 0)

    return this.createRecipe({
      name: data.name,
      description: data.description || 'Быстрый рецепт',
      items: [],
      total_calories: calories,
      total_protein: protein,
      total_fat: fat,
      total_carbs: carbs,
      total_weight_grams: weight,
    })
  },

  /**
   * Save a meal from the daily log into saved recipes
   */
  async saveMealAsRecipe(meal: Meal): Promise<Recipe> {
    const weight = meal.weight_grams && meal.weight_grams > 0 ? meal.weight_grams : 100
    const ingSummary =
      Array.isArray(meal.ingredients) && meal.ingredients.length > 0
        ? `Состав: ${meal.ingredients.map((i) => `${i.name} (${Math.round(i.weight_grams)}г)`).join(', ')}`
        : `Рецепт из дневника питания (${meal.meal_date})`

    return this.createQuickRecipe({
      name: meal.name,
      description: ingSummary,
      calories: meal.calories,
      protein: meal.protein,
      fat: meal.fat,
      carbs: meal.carbs,
      weight_grams: weight,
    })
  },
}

