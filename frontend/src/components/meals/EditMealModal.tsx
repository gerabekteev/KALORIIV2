import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Layers, RefreshCw } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useUIStore } from '../../store/uiStore'
import { useMealsStore } from '../../store/mealsStore'
import { MealIngredient } from '../../types'

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
    meal_date: '',
    meal_time: '',
    user_comment: '',
  })
  const [ingredients, setIngredients] = useState<MealIngredient[]>([])
  const [scaleProportionally, setScaleProportionally] = useState(true)
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
        meal_date: editingMeal.meal_date || '',
        meal_time: editingMeal.meal_time ? editingMeal.meal_time.slice(0, 5) : '',
        user_comment: editingMeal.user_comment || '',
      })
      setIngredients(
        Array.isArray(editingMeal.ingredients) ? [...editingMeal.ingredients] : []
      )
    }
  }, [editingMeal])

  // Handle total weight change with optional proportional scaling
  const handleWeightChange = (newWeightStr: string) => {
    const oldWeight = Number(form.weight_grams) || 0
    const newWeight = Number(newWeightStr) || 0

    if (scaleProportionally && oldWeight > 0 && newWeight > 0) {
      const factor = newWeight / oldWeight
      const newCal = Math.round((Number(form.calories) || 0) * factor)
      const newProt = Math.round((Number(form.protein) || 0) * factor * 10) / 10
      const newFat = Math.round((Number(form.fat) || 0) * factor * 10) / 10
      const newCarb = Math.round((Number(form.carbs) || 0) * factor * 10) / 10

      setForm((prev) => ({
        ...prev,
        weight_grams: newWeightStr,
        calories: newCal.toString(),
        protein: newProt.toString(),
        fat: newFat.toString(),
        carbs: newCarb.toString(),
      }))

      // Also scale individual ingredients if present
      if (ingredients.length > 0) {
        setIngredients((prev) =>
          prev.map((ing) => ({
            ...ing,
            weight_grams: Math.round((ing.weight_grams || 0) * factor),
            calories: Math.round(ing.calories * factor * 10) / 10,
            protein: Math.round(ing.protein * factor * 10) / 10,
            fat: Math.round(ing.fat * factor * 10) / 10,
            carbs: Math.round(ing.carbs * factor * 10) / 10,
          }))
        )
      }
    } else {
      setForm((prev) => ({ ...prev, weight_grams: newWeightStr }))
    }
  }

  // Update ingredient field
  const handleIngredientChange = (
    idx: number,
    field: keyof MealIngredient,
    value: string | number
  ) => {
    setIngredients((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  // Remove ingredient
  const handleRemoveIngredient = (idx: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== idx))
  }

  // Add new blank ingredient
  const handleAddIngredient = () => {
    setIngredients((prev) => [
      ...prev,
      {
        name: '',
        weight_grams: 50,
        calories: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
      },
    ])
  }

  // Sync totals from ingredients sum
  const handleSyncFromIngredients = () => {
    if (ingredients.length === 0) return
    const sumCal = Math.round(ingredients.reduce((s, i) => s + (Number(i.calories) || 0), 0))
    const sumProt =
      Math.round(ingredients.reduce((s, i) => s + (Number(i.protein) || 0), 0) * 10) / 10
    const sumFat =
      Math.round(ingredients.reduce((s, i) => s + (Number(i.fat) || 0), 0) * 10) / 10
    const sumCarb =
      Math.round(ingredients.reduce((s, i) => s + (Number(i.carbs) || 0), 0) * 10) / 10
    const sumWeight = Math.round(
      ingredients.reduce((s, i) => s + (Number(i.weight_grams) || 0), 0)
    )

    setForm((prev) => ({
      ...prev,
      calories: sumCal.toString(),
      protein: sumProt.toString(),
      fat: sumFat.toString(),
      carbs: sumCarb.toString(),
      weight_grams: sumWeight > 0 ? sumWeight.toString() : prev.weight_grams,
    }))
    addToast('КБЖУ пересчитано по сумме состава', 'info', 2000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingMeal) return
    if (!form.name.trim()) {
      addToast('Введите название блюда', 'warning')
      return
    }

    setIsSubmitting(true)
    try {
      const validIngredients = ingredients
        .filter((ing) => ing.name.trim().length > 0)
        .map((ing) => ({
          ...ing,
          name: ing.name.trim(),
          weight_grams: Number(ing.weight_grams) || 0,
          calories: Number(ing.calories) || 0,
          protein: Number(ing.protein) || 0,
          fat: Number(ing.fat) || 0,
          carbs: Number(ing.carbs) || 0,
        }))

      await updateMeal(editingMeal.id, {
        name: form.name.trim(),
        calories: Number(form.calories) || 0,
        protein: Number(form.protein) || 0,
        fat: Number(form.fat) || 0,
        carbs: Number(form.carbs) || 0,
        weight_grams: form.weight_grams ? Number(form.weight_grams) : undefined,
        meal_date: form.meal_date || undefined,
        meal_time: form.meal_time || undefined,
        user_comment: form.user_comment.trim() ? form.user_comment.trim() : null,
        ingredients: validIngredients,
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
      <form onSubmit={handleSubmit} className="space-y-4">
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
            onChange={(e) => handleWeightChange(e.target.value)}
          />
        </div>

        {/* Proportional recalculation toggle */}
        <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-300 select-none">
          <input
            type="checkbox"
            checked={scaleProportionally}
            onChange={(e) => setScaleProportionally(e.target.checked)}
            className="w-4 h-4 rounded text-emerald-500 bg-neutral-900 border-neutral-700 focus:ring-emerald-500 cursor-pointer"
          />
          <span>Пересчитывать КБЖУ пропорционально изменению веса</span>
        </label>

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

        {/* Ingredients Editor Section (FEAT-01) */}
        <div className="pt-2 border-t border-neutral-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span>Состав блюда ({ingredients.length})</span>
            </span>
            <div className="flex items-center gap-2">
              {ingredients.length > 0 && (
                <button
                  type="button"
                  onClick={handleSyncFromIngredients}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Рассчитать итоговые КБЖУ из суммы ингредиентов"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Суммировать КБЖУ</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleAddIngredient}
                className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Добавить</span>
              </button>
            </div>
          </div>

          {ingredients.length > 0 ? (
            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {ingredients.map((ing, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 bg-[#141417] p-2 rounded-xl border border-neutral-800 text-xs"
                >
                  <input
                    type="text"
                    value={ing.name}
                    onChange={(e) => handleIngredientChange(idx, 'name', e.target.value)}
                    placeholder="Ингредиент"
                    className="flex-1 min-w-0 bg-transparent text-white placeholder-neutral-500 outline-none"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      min="0"
                      value={ing.weight_grams || ''}
                      onChange={(e) =>
                        handleIngredientChange(idx, 'weight_grams', Number(e.target.value) || 0)
                      }
                      placeholder="г"
                      className="w-12 text-center bg-neutral-800 text-white rounded px-1 py-0.5 outline-none font-mono text-[11px]"
                    />
                    <span className="text-neutral-500 text-[10px]">г</span>
                    <input
                      type="number"
                      min="0"
                      value={ing.calories || ''}
                      onChange={(e) =>
                        handleIngredientChange(idx, 'calories', Number(e.target.value) || 0)
                      }
                      placeholder="ккал"
                      className="w-12 text-center bg-neutral-800 text-emerald-400 rounded px-1 py-0.5 outline-none font-mono text-[11px]"
                    />
                    <span className="text-neutral-500 text-[10px]">ккал</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveIngredient(idx)}
                      className="p-1 text-neutral-500 hover:text-rose-400 rounded transition-colors cursor-pointer ml-1"
                      title="Удалить"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-neutral-500 italic">
              Ингредиенты не добавлены. Вы можете добавить компоненты вручную.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Дата приёма"
            type="date"
            value={form.meal_date}
            onChange={(e) => setForm({ ...form, meal_date: e.target.value })}
          />
          <Input
            label="Время приёма"
            type="time"
            value={form.meal_time}
            onChange={(e) => setForm({ ...form, meal_time: e.target.value })}
          />
        </div>

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
