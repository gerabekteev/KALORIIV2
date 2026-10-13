export type Gender = 'male' | 'female'

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'

export type GoalType = 'lose' | 'maintain' | 'gain'

export interface User {
  id: number
  email: string
  name: string
  height_cm?: number | null
  current_weight_kg?: number | null
  target_weight_kg?: number | null
  age?: number | null
  gender?: Gender | null
  activity_level?: ActivityLevel | null
  daily_calories_goal: number
  daily_protein_goal: number
  daily_fat_goal: number
  daily_carbs_goal: number
  created_at?: string
  updated_at?: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: User
}

export interface Meal {
  id: number
  user_id?: number
  name: string
  calories: number
  protein: number
  fat: number
  carbs: number
  weight_grams?: number | null
  photo_path?: string | null
  user_comment?: string | null
  ai_raw_response?: string | null
  is_manually_edited?: boolean
  meal_date: string // YYYY-MM-DD
  meal_time: string // HH:MM or HH:MM:SS
  created_at?: string
}

export interface CreateMealPayload {
  name: string
  calories: number
  protein: number
  fat: number
  carbs: number
  weight_grams?: number
  photo_path?: string
  user_comment?: string
  is_manually_edited?: boolean
  meal_date?: string
  meal_time?: string
}

export interface UpdateMealPayload extends Partial<CreateMealPayload> {}

export interface Product {
  id: number
  name: string
  calories_per_100g: number
  protein_per_100g: number
  fat_per_100g: number
  carbs_per_100g: number
  category?: string | null
  is_custom: boolean
  created_by_user_id?: number | null
}

export interface CreateProductPayload {
  name: string
  calories_per_100g: number
  protein_per_100g: number
  fat_per_100g: number
  carbs_per_100g: number
  category?: string
}

export interface RecipeItem {
  id?: number
  recipe_id?: number
  product_id: number
  weight_grams: number
  product?: Product
}

export interface Recipe {
  id: number
  user_id: number
  name: string
  description?: string | null
  total_calories: number
  total_protein: number
  total_fat: number
  total_carbs: number
  total_weight_grams: number
  is_favorite: boolean
  created_at?: string
  items?: RecipeItem[]
}

export interface WeightLog {
  id: number
  user_id: number
  weight_kg: number
  log_date: string // YYYY-MM-DD
}

export interface NutritionGoals {
  daily_calories_goal: number
  daily_protein_goal: number
  daily_fat_goal: number
  daily_carbs_goal: number
}

export interface CalculateGoalsParams {
  gender: Gender
  height_cm: number
  current_weight_kg: number
  target_weight_kg?: number
  age: number
  activity_level: ActivityLevel
  goal_type?: GoalType
}

export interface AIRecognitionResult {
  name: string
  weight_grams: number
  calories: number
  protein: number
  fat: number
  carbs: number
  confidence?: 'high' | 'medium' | 'low'
  photo_path?: string
  raw_response?: string
}

export interface DailySummary {
  date: string
  total_calories: number
  total_protein: number
  total_fat: number
  total_carbs: number
  goal_calories: number
  goal_protein: number
  goal_fat: number
  goal_carbs: number
  meals: Meal[]
}

export interface StatsDayData {
  date: string
  calories: number
  protein: number
  fat: number
  carbs: number
  target_calories: number
}

export interface StatsResponse {
  period: 'today' | 'week' | 'month' | 'year' | 'custom'
  days: StatsDayData[]
  total_calories: number
  avg_calories: number
  avg_protein: number
  avg_fat: number
  avg_carbs: number
  days_tracked: number
  target_met_percentage: number
}
