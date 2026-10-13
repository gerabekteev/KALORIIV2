import React, { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useUIStore } from '../../store/uiStore'
import { useMealsStore } from '../../store/mealsStore'

export const EditMealModal: React.FC = () => {
  const { isEditMealOpen, closeEditMeal, editingMeal, addToast } = useUIStore()
  const { updateMeal } = useMealsStore()

  const [form, setForm] = useState({
    name: '',
    calories: '',
    protein: '',
    fat: '',
    carbs: '',
    weight_grams: '',
    meal_time: '',
    user_comment: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (editingMeal) {
      setForm({
        name: editingMeal.name || '',
        calories: editingMeal.calories?.toString() || '0',
        protein: editingMeal.protein?.toString() || '0',
        fat: editingMeal.fat?.toString() || '0',
        carbs: editingMeal.carbs?.toString() || '0',
        weight_grams: editingMeal.weight_grams?.toString() || '',
        meal_time: editingMeal.meal_time ? editingMeal.meal_time.slice(0, 5) : '',
        user_comment: editingMeal.user_comment || '',
      })
    }
  }, [editingMeal])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingMeal) return
    if (!form.name.trim()) {
      addToast('Введите название блюда', 'warning')
      return
    }

    setIsSubmitting(true)
    try {
      await updateMeal(editingMeal.id, {
        name: form.name.trim(),
        calories: Number(form.calories) || 0,
        protein: Number(form.protein) || 0,
        fat: Number(form.fat) || 0,
        carbs: Number(form.carbs) || 0,
        weight_grams: form.weight_grams ? Number(form.weight_grams) : undefined,
        meal_time: form.meal_time,
        user_comment: form.user_comment || undefined,
        is_manually_edited: true,
      })
      addToast('Блюдо успешно обновлено', 'success')
      closeEditMeal()
    } catch {
      addToast('Не удалось обновить запись', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isEditMealOpen}
      onClose={closeEditMeal}
      title="Редактировать блюдо"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <Input
          label="Название блюда *"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Калории (ккал) *"
            type="number"
            min="0"
            value={form.calories}
            onChange={(e) => setForm({ ...form, calories: e.target.value })}
            required
          />
          <Input
            label="Вес порции (г)"
            type="number"
            min="0"
            value={form.weight_grams}
            onChange={(e) => setForm({ ...form, weight_grams: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Input
            label="Белки (г)"
            type="number"
            step="0.1"
            min="0"
            value={form.protein}
            onChange={(e) => setForm({ ...form, protein: e.target.value })}
          />
          <Input
            label="Жиры (г)"
            type="number"
            step="0.1"
            min="0"
            value={form.fat}
            onChange={(e) => setForm({ ...form, fat: e.target.value })}
          />
          <Input
            label="Углеводы (г)"
            type="number"
            step="0.1"
            min="0"
            value={form.carbs}
            onChange={(e) => setForm({ ...form, carbs: e.target.value })}
          />
        </div>

        <Input
          label="Время приёма"
          type="time"
          value={form.meal_time}
          onChange={(e) => setForm({ ...form, meal_time: e.target.value })}
        />

        <Input
          label="Комментарий"
          value={form.user_comment}
          onChange={(e) => setForm({ ...form, user_comment: e.target.value })}
          placeholder="Примечание к блюду"
        />

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            className="w-1/2"
            onClick={closeEditMeal}
          >
            Отмена
          </Button>
          <Button
            type="submit"
            className="w-1/2"
            isLoading={isSubmitting}
          >
            Сохранить
          </Button>
        </div>
      </form>
    </Modal>
  )
}
