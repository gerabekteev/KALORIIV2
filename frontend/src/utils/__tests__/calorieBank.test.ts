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
    expect(res?.totalBudget).toBe(10000)
    expect(res?.totalConsumed).toBe(9000)
  })

  it('correctly calculates overeating (-balance) when exceeding goal', () => {
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

  it('does not count today as +goal saved when today has 0 kcal eaten', () => {
    const res = calculateWeeklyBank({
      dailyGoalCalories: 1850,
      weekDateStrings: weekDays,
      todayStr: '2026-10-14',
      selectedDate: '2026-10-14',
      currentDayCalories: 0,
      weekCaloriesMap: {
        '2026-10-12': 2100,
        '2026-10-13': 2000,
      },
    })

    expect(res).not.toBeNull()
    expect(res?.trackedCount).toBe(2)
    expect(res?.totalBudget).toBe(3700)
    expect(res?.totalConsumed).toBe(4100)
    expect(res?.balance).toBe(-400)
    expect(res?.isPositive).toBe(false)
  })
})
