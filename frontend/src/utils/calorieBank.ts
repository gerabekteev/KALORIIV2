export interface WeeklyBankDayItem {
  dateStr: string
  calories: number
  goal: number
  diff: number // positive = saved (under goal), negative = over goal
}

export interface WeeklyBankResult {
  balance: number
  isPositive: boolean
  trackedCount: number
  totalBudget: number
  totalConsumed: number
  days: WeeklyBankDayItem[]
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
 * Calculates weekly calorie balance across days up to today where meals were actually logged (cal > 0).
 * Empty days (0 kcal, including an unstarted today) are never counted as artificial calorie savings.
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

  // Evaluate days of the selected week up to today
  const activeDays = weekDateStrings.filter((d) => d <= todayStr)
  if (activeDays.length === 0) return null

  let totalBudget = 0
  let totalConsumed = 0
  let trackedCount = 0
  const days: WeeklyBankDayItem[] = []

  activeDays.forEach((dateStr) => {
    const rawCal =
      dateStr === selectedDate ? currentDayCalories : weekCaloriesMap[dateStr] || 0
    const cal = Math.round(rawCal)
    if (cal > 0) {
      totalBudget += dailyGoalCalories
      totalConsumed += cal
      trackedCount++
      days.push({
        dateStr,
        calories: cal,
        goal: dailyGoalCalories,
        diff: Math.round(dailyGoalCalories - cal),
      })
    }
  })

  if (trackedCount === 0) return null
  const balance = Math.round(totalBudget - totalConsumed)
  return {
    balance,
    isPositive: balance >= 0,
    trackedCount,
    totalBudget: Math.round(totalBudget),
    totalConsumed: Math.round(totalConsumed),
    days,
  }
}
