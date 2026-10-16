export type Gender = 'male' | 'female'

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'

export type GoalType = 'lose' | 'maintain' | 'gain' | 'lose_weight' | 'gain_weight'

export interface User {
  id: number
  email: string
  name?: string | null
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

export interface Token {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface AuthResponse {
  user: User
  token: Token
  // Direct compatibility aliases
  access_token?: string
  token_type?: string
}

export interface MealIngredient {
  name: string
  weight_grams: number
  calories: number
  protein: number
  fat: number
  carbs: number
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
  ingredients?: MealIngredient[]
  is_manually_edited?: boolean
  meal_date: string // YYYY-MM-DD
  meal_time: string // HH:MM or HH:MM:SS
  created_at?: string
}

export interface PendingAIMeal {
  id: string
  type: 'photo' | 'text'
  photoFile?: File
  previewUrl?: string
  comment?: string
  textDescription?: string
  targetDate: string
  targetTime: string
  status: 'analyzing' | 'error'
  errorMessage?: string
  createdAt: number
}

export interface CreateMealPayload {
  name: string
  calories: number
  protein: number
  fat: number
  carbs: number
  weight_grams?: number
  photo_path?: string | null
  user_comment?: string | null
  ai_raw_response?: string | null
  ingredients?: MealIngredient[]
  is_manually_edited?: boolean
  meal_date?: string
  meal_time?: string
}

export interface UpdateMealPayload extends Partial<CreateMealPayload> {}

export interface DailyMealsSummary {
  date: string
  total_calories: number
  total_protein: number
  total_fat: number
  total_carbs: number
  target_calories: number
  target_protein: number
  target_fat: number
  target_carbs: number
  meals: Meal[]
  // Aliases for compatibility with earlier code
  goal_calories?: number
  goal_protein?: number
  goal_fat?: number
  goal_carbs?: number
}

export type DailySummary = DailyMealsSummary

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
  category?: string | null
}

export interface RecipeItem {
  id?: number
  recipe_id?: number
  product_id: number
  weight_grams: number
  product?: Product
}

export interface CreateRecipePayload {
  name: string
  description?: string | null
  items?: Array<{ product_id: number; weight_grams: number }>
  total_calories?: number
  total_protein?: number
  total_fat?: number
  total_carbs?: number
  total_weight_grams?: number
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
  id?: number
  user_id?: number
  weight_kg: number
  log_date: string // YYYY-MM-DD
  date?: string   // alias for backend WeightHistoryPoint compatibility
}

export interface WeightHistoryPoint {
  date: string
  weight_kg: number
  log_date?: string // compatibility alias
}

export interface WeightStatsResponse {
  current_weight?: number | null
  target_weight?: number | null
  start_weight?: number | null
  change_kg?: number | null
  history: WeightHistoryPoint[]
}

export interface NutritionGoals {
  daily_calories_goal: number
  daily_protein_goal: number
  daily_fat_goal: number
  daily_carbs_goal: number
  bmr?: number
  tdee?: number
}

export interface CalculateGoalsParams {
  height_cm: number
  weight_kg?: number
  current_weight_kg?: number
  target_weight_kg?: number
  age: number
  gender: Gender
  activity_level: ActivityLevel
  goal?: 'lose_weight' | 'maintain' | 'gain_weight'
  goal_type?: GoalType
}

export interface ProfileCalculateResponse {
  bmr: number
  tdee: number
  daily_calories_goal: number
  daily_protein_goal: number
  daily_fat_goal: number
  daily_carbs_goal: number
}

export interface AIRecognitionResult {
  name: string
  weight_grams: number
  calories: number
  protein: number
  fat: number
  carbs: number
  confidence: 'high' | 'medium' | 'low' | string
  photo_path?: string | null
  provider_used?: string | null
  model_used?: string | null
  raw_response?: string | null
  ingredients?: MealIngredient[]
}

export interface DayStats {
  date: string
  calories: number
  protein: number
  fat: number
  carbs: number
  meals_count: number
  goal_calories: number
  goal_protein: number
  goal_fat: number
  goal_carbs: number
  goal_achieved: boolean
  // Compatibility alias
  target_calories?: number
}

export type StatsDayData = DayStats

export interface MacroDistribution {
  protein_grams: number
  fat_grams: number
  carbs_grams: number
  protein_percent: number
  fat_percent: number
  carbs_percent: number
}

export interface StatsPeriodResponse {
  period: string
  start_date: string
  end_date: string
  total_days: number
  tracked_days: number
  goal_met_days: number
  goal_met_percentage: number
  average_calories: number
  average_protein: number
  average_fat: number
  average_carbs: number
  macro_distribution: MacroDistribution
  daily_stats: DayStats[]
  // Convenience aliases for frontend components
  days?: DayStats[]
  avg_calories?: number
  avg_protein?: number
  avg_fat?: number
  avg_carbs?: number
  total_calories?: number
  days_tracked?: number
  target_met_percentage?: number
}

export type StatsResponse = StatsPeriodResponse

export interface BarcodeProductResult {
  product_id?: number | null
  name: string
  brand?: string | null
  barcode: string
  calories_per_100g: number
  protein_per_100g: number
  fat_per_100g: number
  carbs_per_100g: number
  package_weight_grams: number
  image_url?: string | null
  source: 'local' | 'openfoodfacts' | 'ai_vision'
  is_honest_sign: boolean
}

export interface BarcodeProductUpdateRequest {
  name: string
  brand?: string | null
  calories_per_100g: number
  protein_per_100g: number
  fat_per_100g: number
  carbs_per_100g: number
  package_weight_grams?: number
  image_url?: string | null
}

export interface RecentScannedProductItem {
  id: number
  product_id: number
  name: string
  brand?: string | null
  barcode?: string | null
  calories_per_100g: number
  protein_per_100g: number
  fat_per_100g: number
  carbs_per_100g: number
  package_weight_grams: number
  image_url?: string | null
  last_scanned_at: string
  scan_count: number
}

export interface BarcodeScanImageResponse {
  detected_code?: string | null
  is_honest_sign: boolean
  product?: BarcodeProductResult | null
  message?: string | null
}
