export interface WeeklyBankResult {
  balance: number
  isPositive: boolean
  trackedCount: number
}

export interface CalculateWeeklyBankParams {
  dailyGoalCalories: number
  weekDateStrings: string[]
  todayStr: string
  selectedDate: string
  currentDayCalories: number
  weekCaloriesMap: Record<string, number>
}

/**
 * Calculates elastic weekly calorie bank (GC-02).
 * Evaluates days up to today (or past days), summing daily budgets vs consumed calories.
 */
export function calculateWeeklyBank({
  dailyGoalCalories,
  weekDateStrings,
  todayStr,
  selectedDate,
  currentDayCalories,
  weekCaloriesMap,
}: CalculateWeeklyBankParams): WeeklyBankResult | null {
  if (!dailyGoalCalories || dailyGoalCalories <= 0) return null

  // Evaluate days up to today
  const activeDays = weekDateStrings.filter((d) => d <= todayStr)
  if (activeDays.length === 0) return null

  let totalBudget = 0
  let totalConsumed = 0
  let trackedCount = 0

  activeDays.forEach((dateStr) => {
    const cal = dateStr === selectedDate ? currentDayCalories : (weekCaloriesMap[dateStr] || 0)
    if (cal > 0 || dateStr === todayStr) {
      totalBudget += dailyGoalCalories
      totalConsumed += cal
      trackedCount++
    }
  })

  if (trackedCount === 0) return null
  const balance = Math.round(totalBudget - totalConsumed)
  return {
    balance,
    isPositive: balance >= 0,
    trackedCount,
  }
}
