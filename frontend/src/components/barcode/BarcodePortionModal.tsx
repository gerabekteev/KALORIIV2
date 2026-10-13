import React, { useState, useEffect } from 'react'
import {
  Package,
  Sparkles,
  ShieldCheck,
  Clock,
  Scale,
  Check,
  ChevronRight,
} from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { BarcodeProductResult } from '../../types'
import { useMealsStore } from '../../store/mealsStore'
import { useUIStore } from '../../store/uiStore'

interface BarcodePortionModalProps {
  product: BarcodeProductResult | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

const PRESET_MULTIPLIERS = [0.5, 1.0, 1.5, 2.0, 3.0, 5.0]

export const BarcodePortionModal: React.FC<BarcodePortionModalProps> = ({
  product,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { addMeal, selectedDate } = useMealsStore()
  const { addToast } = useUIStore()

  const [multiplier, setMultiplier] = useState<number>(1.0)
  const [exactGrams, setExactGrams] = useState<number>(100)
  const [mealTime, setMealTime] = useState<string>(
    new Date().toTimeString().slice(0, 5)
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Initialize or reset when product changes
  useEffect(() => {
    if (product) {
      const baseWeight = product.package_weight_grams || 100
      setMultiplier(1.0)
      setExactGrams(Math.round(baseWeight))
      setMealTime(new Date().toTimeString().slice(0, 5))
    }
  }, [product])

  if (!product) return null

  const baseWeight = product.package_weight_grams || 100

  // Handle multiplier chip click
  const handleSelectMultiplier = (val: number) => {
    setMultiplier(val)
    setExactGrams(Math.round(baseWeight * val))
  }

  // Handle exact grams change
  const handleGramsChange = (grams: number) => {
    const cleanGrams = Math.max(1, grams)
    setExactGrams(cleanGrams)
    if (baseWeight > 0) {
      setMultiplier(Math.round((cleanGrams / baseWeight) * 100) / 100)
    }
  }

  // Calculate totals
  const ratio = (exactGrams || 100) / 100
  const calculatedCalories = Math.round(product.calories_per_100g * ratio)
  const calculatedProtein = Math.round(product.protein_per_100g * ratio * 10) / 10
  const calculatedFat = Math.round(product.fat_per_100g * ratio * 10) / 10
  const calculatedCarbs = Math.round(product.carbs_per_100g * ratio * 10) / 10

  const handleAddMeal = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await addMeal({
        name: product.brand ? `${product.name} (${product.brand})` : product.name,
        calories: calculatedCalories,
        protein: calculatedProtein,
        fat: calculatedFat,
        carbs: calculatedCarbs,
        weight_grams: exactGrams,
        meal_date: selectedDate,
        meal_time: mealTime,
        photo_path: product.image_url || undefined,
        is_manually_edited: false,
      })

      addToast(`Добавлено: ${product.name} (${exactGrams} г)`, 'success')
      if (onSuccess) onSuccess()
      onClose()
    } catch {
      addToast('Ошибка сохранения приёма пищи', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Добавление в рацион" maxWidth="md">
      <form onSubmit={handleAddMeal} className="space-y-4">
        {/* Product Card Header */}
        <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-[#19191e] border border-neutral-800">
          {product.image_url ? (
            <div className="w-16 h-16 rounded-xl bg-neutral-900 border border-neutral-700/80 overflow-hidden shrink-0 flex items-center justify-center">
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-contain p-1"
                onError={(e) => {
                  // Fallback if image fails to load
                  ;(e.target as HTMLElement).style.display = 'none'
                }}
              />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <Package className="w-8 h-8" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              {product.is_honest_sign ? (
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Честный Знак
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                  Штрихкод
                </span>
              )}

              {product.brand && (
                <span className="text-[11px] text-neutral-400 font-medium">
                  {product.brand}
                </span>
              )}
            </div>

            <h3 className="text-sm font-bold text-white line-clamp-2">
              {product.name}
            </h3>

            <p className="text-[11px] text-neutral-400 mt-0.5">
              Базовая упаковка: <span className="text-white font-medium">{Math.round(baseWeight)} г</span> • {Math.round(product.calories_per_100g)} ккал / 100г
            </p>
          </div>
        </div>

        {/* Portion Multiplier Chips */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-neutral-200">
              Количество порций / упаковок:
            </span>
            <span className="text-emerald-400 font-bold">
              {multiplier}x ({exactGrams} г)
            </span>
          </div>

          <div className="grid grid-cols-6 gap-1.5">
            {PRESET_MULTIPLIERS.map((val) => {
              const isSelected = multiplier === val
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleSelectMultiplier(val)}
                  className={`py-2 px-1 text-xs font-bold rounded-xl transition-all cursor-pointer text-center ${
                    isSelected
                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25 scale-[1.02]'
                      : 'bg-[#18181c] text-neutral-300 hover:text-white hover:bg-[#222228] border border-neutral-800'
                  }`}
                >
                  {val}x
                </button>
              )
            })}
          </div>
        </div>

        {/* Grams and Time inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-neutral-400 block mb-1 font-medium flex items-center gap-1">
              <Scale className="w-3 h-3 text-emerald-400" /> Точный вес (граммы)
            </label>
            <input
              type="number"
              min="1"
              max="5000"
              value={exactGrams}
              onChange={(e) => handleGramsChange(Number(e.target.value))}
              className="w-full bg-[#18181b] border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] text-neutral-400 block mb-1 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3 text-emerald-400" /> Время приёма
            </label>
            <input
              type="time"
              value={mealTime}
              onChange={(e) => setMealTime(e.target.value)}
              className="w-full bg-[#18181b] border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none"
            />
          </div>
        </div>

        {/* Recalculated Nutrition Plate */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-300 font-medium">
              Итого за выбранную порцию:
            </span>
            <div className="text-right">
              <span className="text-xl font-black text-emerald-400">
                {calculatedCalories}
              </span>
              <span className="text-xs text-emerald-400 ml-1 font-semibold">ккал</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-emerald-500/20 text-center text-xs">
            <div className="bg-[#141417]/80 py-1.5 px-2 rounded-xl border border-neutral-800">
              <span className="text-[10px] text-neutral-400 block">Белки</span>
              <span className="font-bold text-blue-400">{calculatedProtein} г</span>
            </div>
            <div className="bg-[#141417]/80 py-1.5 px-2 rounded-xl border border-neutral-800">
              <span className="text-[10px] text-neutral-400 block">Жиры</span>
              <span className="font-bold text-amber-400">{calculatedFat} г</span>
            </div>
            <div className="bg-[#141417]/80 py-1.5 px-2 rounded-xl border border-neutral-800">
              <span className="text-[10px] text-neutral-400 block">Углеводы</span>
              <span className="font-bold text-purple-400">{calculatedCarbs} г</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="flex-1"
          >
            Отмена
          </Button>
          <Button
            type="submit"
            isLoading={isSubmitting}
            className="flex-2 flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Добавить в рацион</span>
          </Button>
        </div>
      </form>
    </Modal>
  )
}
