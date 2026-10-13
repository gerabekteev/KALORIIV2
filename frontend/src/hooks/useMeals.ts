import { useEffect } from 'react'
import { useMealsStore } from '../store/mealsStore'

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
  }, [date, selectedDate])

  const totals = getTotals()

  const goToPreviousDay = () => {
    const current = new Date(selectedDate)
    current.setDate(current.getDate() - 1)
    const newDate = current.toISOString().split('T')[0]
    setSelectedDate(newDate)
  }

  const goToNextDay = () => {
    const current = new Date(selectedDate)
    current.setDate(current.getDate() + 1)
    const newDate = current.toISOString().split('T')[0]
    setSelectedDate(newDate)
  }

  const goToToday = () => {
    const today = new Date().toISOString().split('T')[0]
    setSelectedDate(today)
  }

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
