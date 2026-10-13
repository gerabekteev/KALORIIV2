import { apiClient } from './client'
import { Recipe, Meal } from '../types'
import { productsApi } from './products'

export interface CreateRecipePayload {
  name: string
  description?: string | null
  items: Array<{
    product_id: number
    weight_grams: number
  }>
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
   * Helper to quickly create a recipe from arbitrary KBJU data
   * Creates an underlying product and creates a recipe linked to it
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
    const ratio = 100 / weight

    const calories = Math.max(0, Number(data.calories) || 0)
    const protein = Math.max(0, Number(data.protein) || 0)
    const fat = Math.max(0, Number(data.fat) || 0)
    const carbs = Math.max(0, Number(data.carbs) || 0)

    const product = await productsApi.createProduct({
      name: data.name,
      calories_per_100g: Math.round(calories * ratio * 10) / 10,
      protein_per_100g: Math.round(protein * ratio * 10) / 10,
      fat_per_100g: Math.round(fat * ratio * 10) / 10,
      carbs_per_100g: Math.round(carbs * ratio * 10) / 10,
      category: 'Рецепты',
    })

    return this.createRecipe({
      name: data.name,
      description: data.description || 'Быстрый рецепт',
      items: [
        {
          product_id: product.id,
          weight_grams: weight,
        },
      ],
    })
  },

  /**
   * Save a meal from the daily log into saved recipes
   */
  async saveMealAsRecipe(meal: Meal): Promise<Recipe> {
    const weight = meal.weight_grams && meal.weight_grams > 0 ? meal.weight_grams : 100
    return this.createQuickRecipe({
      name: meal.name,
      description: `Рецепт из дневника питания (${meal.meal_date})`,
      calories: meal.calories,
      protein: meal.protein,
      fat: meal.fat,
      carbs: meal.carbs,
      weight_grams: weight,
    })
  },
}

