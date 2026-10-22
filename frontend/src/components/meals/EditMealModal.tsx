import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Layers, RefreshCw, Scale, Minus } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useUIStore } from '../../store/uiStore'
import { useMealsStore } from '../../store/mealsStore'
import { MealIngredient } from '../../types'

interface BaselineMealState {
  weight_grams: number
  calories: number
  protein: number
  fat: number
  carbs: number
  ingredients: MealIngredient[]
}

const SCALE_MULTIPLIERS = [
  { label: '½ (×0.5)', value: 0.5 },
  { label: '¾ (×0.75)', value: 0.75 },
  { label: '100% (×1)', value: 1 },
  { label: '×1.25', value: 1.25 },
  { label: '×1.5', value: 1.5 },
  { label: '×2', value: 2 },
]

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
  const [baseline, setBaseline] = useState<BaselineMealState | null>(null)
  const [scaleMultiplier, setScaleMultiplier] = useState<number>(1)
  const [scaleProportionally, setScaleProportionally] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (editingMeal) {
      const initialIngredients = Array.isArray(editingMeal.ingredients)
        ? editingMeal.ingredients.map((ing) => ({ ...ing }))
        : []
      const sumIngWeight = initialIngredients.reduce(
        (s, i) => s + (Number(i.weight_grams) || 0),
        0
      )
      const initialWeight =
        editingMeal.weight_grams && editingMeal.weight_grams > 0
          ? editingMeal.weight_grams
          : sumIngWeight > 0
          ? sumIngWeight
          : 100

      setForm({
        name: editingMeal.name || '',
        calories: editingMeal.calories?.toString() || '0',
        protein: editingMeal.protein?.toString() || '0',
        fat: editingMeal.fat?.toString() || '0',
        carbs: editingMeal.carbs?.toString() || '0',
        weight_grams: initialWeight.toString(),
        meal_date: editingMeal.meal_date || '',
        meal_time: editingMeal.meal_time ? editingMeal.meal_time.slice(0, 5) : '',
        user_comment: editingMeal.user_comment || '',
      })
      setIngredients(initialIngredients)
      setBaseline({
        weight_grams: initialWeight,
        calories: Number(editingMeal.calories) || 0,
        protein: Number(editingMeal.protein) || 0,
        fat: Number(editingMeal.fat) || 0,
        carbs: Number(editingMeal.carbs) || 0,
        ingredients: initialIngredients.map((ing) => ({ ...ing })),
      })
      setScaleMultiplier(1)
    }
  }, [editingMeal])

  // Apply a scale factor relative to the baseline meal state
  const applyScaleFactor = (factor: number, customWeightStr?: string) => {
    if (!baseline || factor <= 0) return
    const clampedFactor = Math.max(0.05, Math.min(10, factor))
    setScaleMultiplier(Math.round(clampedFactor * 100) / 100)

    const newWeight = Math.max(1, Math.round(baseline.weight_grams * clampedFactor))
    const newCal = Math.round(baseline.calories * clampedFactor)
    const newProt = Math.round(baseline.protein * clampedFactor * 10) / 10
    const newFat = Math.round(baseline.fat * clampedFactor * 10) / 10
    const newCarb = Math.round(baseline.carbs * clampedFactor * 10) / 10

    setForm((prev) => ({
      ...prev,
      weight_grams: customWeightStr !== undefined ? customWeightStr : String(newWeight),
      calories: String(newCal),
      protein: String(newProt),
      fat: String(newFat),
      carbs: String(newCarb),
    }))

    if (baseline.ingredients.length > 0) {
      setIngredients(
        baseline.ingredients.map((ing) => ({
          ...ing,
          weight_grams: Math.max(1, Math.round((ing.weight_grams || 0) * clampedFactor)),
          calories: Math.round(ing.calories * clampedFactor * 10) / 10,
          protein: Math.round(ing.protein * clampedFactor * 10) / 10,
          fat: Math.round(ing.fat * clampedFactor * 10) / 10,
          carbs: Math.round(ing.carbs * clampedFactor * 10) / 10,
        }))
      )
    }
  }

  // Handle total weight change with optional proportional scaling
  const handleWeightChange = (newWeightStr: string) => {
    const newWeight = Number(newWeightStr)
    if (
      scaleProportionally &&
      baseline &&
      baseline.weight_grams > 0 &&
      Number.isFinite(newWeight) &&
      newWeight > 0
    ) {
      const factor = newWeight / baseline.weight_grams
      applyScaleFactor(factor, newWeightStr)
    } else {
      setForm((prev) => ({ ...prev, weight_grams: newWeightStr }))
    }
  }

  const handleStepWeight = (deltaGrams: number) => {
    const currentW = Number(form.weight_grams) || baseline?.weight_grams || 100
    const nextW = Math.max(10, Math.round(currentW + deltaGrams))
    handleWeightChange(String(nextW))
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

        {/* Portion Scaling Slider & Multipliers Block */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-b from-[#181c22] to-[#131519] border border-emerald-500/30 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs font-bold text-white">
                Масштаб порции и общий вес
              </span>
            </div>
            <span className="text-xs font-extrabold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-lg border border-emerald-500/30">
              {Math.round(scaleMultiplier * 100)}% ({form.weight_grams || 0} г • {form.calories || 0} ккал)
            </span>
          </div>

          {/* Multiplier Quick Pills */}
          <div className="flex flex-wrap gap-1.5">
            {SCALE_MULTIPLIERS.map((m) => {
              const isSelected = Math.abs(scaleMultiplier - m.value) < 0.03
              return (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => applyScaleFactor(m.value)}
                  className={`flex-1 min-w-[64px] py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                      : 'bg-[#111317] text-neutral-300 hover:text-white border border-neutral-800 hover:border-emerald-500/40'
                  }`}
                >
                  {m.label}
                </button>
              )
            })}
          </div>

          {/* Smooth Range Slider (0.25x .. 2.5x) */}
          <div className="space-y-1 pt-0.5">
            <input
              type="range"
              min="0.25"
              max="2.5"
              step="0.05"
              value={Math.min(2.5, Math.max(0.25, scaleMultiplier))}
              onChange={(e) => applyScaleFactor(parseFloat(e.target.value))}
              className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex justify-between text-[10px] text-neutral-500 font-medium px-0.5">
              <span>¼ порции</span>
              <span>Половина</span>
              <span>Исходная (100%)</span>
              <span>×1.5</span>
              <span>×2.5</span>
            </div>
          </div>

          {/* Exact Weight Input with Steppers */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs text-neutral-300 font-medium">
              Точный вес съеденного:
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleStepWeight(-50)}
                className="px-2 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold cursor-pointer active:scale-95"
              >
                -50
              </button>
              <button
                type="button"
                onClick={() => handleStepWeight(-25)}
                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 cursor-pointer active:scale-95"
                title="-25 г"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <div className="relative w-24">
                <input
                  type="number"
                  min="1"
                  value={form.weight_grams}
                  onChange={(e) => handleWeightChange(e.target.value)}
                  className="w-full bg-[#0f1115] border border-emerald-500/40 focus:border-emerald-400 rounded-xl pl-2.5 pr-6 py-1.5 text-center text-sm font-extrabold text-white outline-none"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-emerald-400 font-semibold pointer-events-none">
                  г
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleStepWeight(25)}
                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 cursor-pointer active:scale-95"
                title="+25 г"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleStepWeight(50)}
                className="px-2 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold cursor-pointer active:scale-95"
              >
                +50
              </button>
            </div>
          </div>

          {/* Proportional recalculation toggle */}
          <label className="flex items-center gap-2 cursor-pointer text-[11px] text-neutral-400 hover:text-neutral-200 select-none pt-0.5">
            <input
              type="checkbox"
              checked={scaleProportionally}
              onChange={(e) => setScaleProportionally(e.target.checked)}
              className="w-4 h-4 rounded accent-emerald-500 bg-neutral-900 border-neutral-700 cursor-pointer"
            />
            <span>Пересчитывать КБЖУ и ингредиенты пропорционально весу</span>
          </label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Input
            label="Калории (ккал) *"
            type="number"
            min="0"
            value={form.calories}
            onChange={(e) => setForm({ ...form, calories: e.target.value })}
            required
          />
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
            <div className="space-y-2">
              {ingredients.map((ing, idx) => (
                <div
                  key={idx}
                  className="bg-[#141417] p-2.5 rounded-xl border border-neutral-800 text-xs space-y-2"
                >
                  {/* Row 1: Ingredient name + delete button */}
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={ing.name}
                      onChange={(e) => handleIngredientChange(idx, 'name', e.target.value)}
                      placeholder="Название ингредиента"
                      className="flex-1 min-w-0 bg-transparent text-white placeholder-neutral-500 outline-none text-xs font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveIngredient(idx)}
                      className="p-1 text-neutral-500 hover:text-rose-400 rounded transition-colors cursor-pointer shrink-0"
                      title="Удалить ингредиент"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Row 2: 5 columns grid (Вес, Ккал, Б, Ж, У) */}
                  <div className="grid grid-cols-5 gap-1.5 pt-1.5 border-t border-neutral-850/70 text-[10px]">
                    <div className="flex flex-col">
                      <span className="text-neutral-400 font-medium text-[10px] mb-0.5 truncate">Вес (г)</span>
                      <input
                        type="number"
                        min="0"
                        value={ing.weight_grams || ''}
                        onChange={(e) =>
                          handleIngredientChange(idx, 'weight_grams', Number(e.target.value) || 0)
                        }
                        placeholder="г"
                        className="w-full text-center bg-neutral-800 text-white rounded px-1 py-1 outline-none font-mono text-[11px]"
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-emerald-400 font-medium text-[10px] mb-0.5 truncate">Ккал</span>
                      <input
                        type="number"
                        min="0"
                        value={ing.calories || ''}
                        onChange={(e) =>
                          handleIngredientChange(idx, 'calories', Number(e.target.value) || 0)
                        }
                        placeholder="ккал"
                        className="w-full text-center bg-neutral-800 text-emerald-400 rounded px-1 py-1 outline-none font-mono text-[11px]"
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-blue-400 font-medium text-[10px] mb-0.5 truncate">Б (г)</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={ing.protein || ''}
                        onChange={(e) =>
                          handleIngredientChange(idx, 'protein', Number(e.target.value) || 0)
                        }
                        placeholder="0"
                        className="w-full text-center bg-neutral-800/90 text-blue-300 rounded px-1 py-1 outline-none font-mono text-[11px]"
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-amber-400 font-medium text-[10px] mb-0.5 truncate">Ж (г)</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={ing.fat || ''}
                        onChange={(e) =>
                          handleIngredientChange(idx, 'fat', Number(e.target.value) || 0)
                        }
                        placeholder="0"
                        className="w-full text-center bg-neutral-800/90 text-amber-300 rounded px-1 py-1 outline-none font-mono text-[11px]"
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-purple-400 font-medium text-[10px] mb-0.5 truncate">У (г)</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={ing.carbs || ''}
                        onChange={(e) =>
                          handleIngredientChange(idx, 'carbs', Number(e.target.value) || 0)
                        }
                        placeholder="0"
                        className="w-full text-center bg-neutral-800/90 text-purple-300 rounded px-1 py-1 outline-none font-mono text-[11px]"
                      />
                    </div>
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

        <div className="sticky bottom-0 bg-[#1a1a1e] -mx-4 sm:-mx-6 px-4 sm:px-6 -mb-4 py-3 border-t border-neutral-800 flex gap-2 z-10">
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
