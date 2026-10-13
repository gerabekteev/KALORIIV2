import { useEffect } from 'react'
import { useMealsStore, getTodayDateString } from '../store/mealsStore'

export const useMeals = (date?: string) => {
  const {
    meals,
    selectedDate,
    isLoading,
    error,
    setSelectedDate,
    fetchMeals,
    addMeal,
    updateMeal,
    deleteMeal,
    getTotals,
  } = useMealsStore()

  useEffect(() => {
    if (date && date !== selectedDate) {
      setSelectedDate(date)
    } else {
      fetchMeals(selectedDate)
    }
  }, [date])

  const totals = getTotals()

  const shiftDate = (days: number) => {
    const parts = selectedDate.split('-').map(Number)
    const d = new Date(parts[0], parts[1] - 1, parts[2] + days)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    setSelectedDate(`${y}-${m}-${day}`)
  }

  const goToPreviousDay = () => shiftDate(-1)
  const goToNextDay = () => shiftDate(1)
  const goToToday = () => setSelectedDate(getTodayDateString())

  return {
    meals,
    selectedDate,
    isLoading,
    error,
    totals,
    setSelectedDate,
    fetchMeals,
    addMeal,
    updateMeal,
    deleteMeal,
    goToPreviousDay,
    goToNextDay,
    goToToday,
  }
}
