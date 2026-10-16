import { describe, it, expect } from 'vitest'
import { calculateWeeklyBank } from '../calorieBank'

describe('calculateWeeklyBank (GC-02)', () => {
  const weekDays = [
    '2026-10-12', // Mon
    '2026-10-13', // Tue
    '2026-10-14', // Wed
    '2026-10-15', // Thu
    '2026-10-16', // Fri
    '2026-10-17', // Sat
    '2026-10-18', // Sun
  ]

  it('returns null if dailyGoalCalories is zero or negative', () => {
    expect(
      calculateWeeklyBank({
        dailyGoalCalories: 0,
        weekDateStrings: weekDays,
        todayStr: '2026-10-16',
        selectedDate: '2026-10-16',
        currentDayCalories: 1500,
        weekCaloriesMap: {},
      })
    ).toBeNull()
  })

  it('correctly calculates surplus (+balance) over tracked days', () => {
    // Daily goal = 2000 kcal
    // Mon: 1800 (-200 consumed vs budget)
    // Tue: 1700 (-300)
    // Wed: 1900 (-100)
    // Thu: 2000 (0)
    // Fri (today): 1600 (-400)
    // Total budget = 5 * 2000 = 10000
    // Total consumed = 1800 + 1700 + 1900 + 2000 + 1600 = 9000
    // Balance = +1000 kcal saved
    const res = calculateWeeklyBank({
      dailyGoalCalories: 2000,
      weekDateStrings: weekDays,
      todayStr: '2026-10-16',
      selectedDate: '2026-10-16',
      currentDayCalories: 1600,
      weekCaloriesMap: {
        '2026-10-12': 1800,
        '2026-10-13': 1700,
        '2026-10-14': 1900,
        '2026-10-15': 2000,
      },
    })

    expect(res).not.toBeNull()
    expect(res?.balance).toBe(1000)
    expect(res?.isPositive).toBe(true)
    expect(res?.trackedCount).toBe(5)
  })

  it('correctly calculates deficit (-balance) when overeating', () => {
    // Daily goal = 2000 kcal
    // Mon: 2400 (+400 over budget)
    // Tue (today): 2300 (+300 over budget)
    // Total budget = 4000
    // Total consumed = 4700
    // Balance = -700 kcal
    const res = calculateWeeklyBank({
      dailyGoalCalories: 2000,
      weekDateStrings: weekDays,
      todayStr: '2026-10-13',
      selectedDate: '2026-10-13',
      currentDayCalories: 2300,
      weekCaloriesMap: {
        '2026-10-12': 2400,
      },
    })

    expect(res).not.toBeNull()
    expect(res?.balance).toBe(-700)
    expect(res?.isPositive).toBe(false)
    expect(res?.trackedCount).toBe(2)
  })

  it('ignores future days in the week', () => {
    // If today is Wednesday (2026-10-14), days Thursday-Sunday should not count toward budget
    const res = calculateWeeklyBank({
      dailyGoalCalories: 2000,
      weekDateStrings: weekDays,
      todayStr: '2026-10-14',
      selectedDate: '2026-10-14',
      currentDayCalories: 2000,
      weekCaloriesMap: {
        '2026-10-12': 2000,
        '2026-10-13': 2000,
        '2026-10-15': 2000, // future day in map
      },
    })

    expect(res?.trackedCount).toBe(3)
    expect(res?.balance).toBe(0)
    expect(res?.isPositive).toBe(true)
  })
})
