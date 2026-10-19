import React, { useState, useEffect } from 'react'
import {
  Package,
  ShieldCheck,
  Clock,
  Scale,
  Check,
  CheckCircle2,
  Edit2,
  Save,
  RefreshCw,
} from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { BarcodeProductResult } from '../../types'
import { barcodeApi } from '../../api/barcode'
import { useMealsStore } from '../../store/mealsStore'
import { useUIStore } from '../../store/uiStore'
import { resolveMediaUrl } from '../../utils/platform'

interface BarcodePortionModalProps {
  product: BarcodeProductResult | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

const PRESET_MULTIPLIERS = [0.5, 1.0, 1.5, 2.0, 3.0, 5.0]

export const BarcodePortionModal: React.FC<BarcodePortionModalProps> = ({
  product: initialProduct,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { addMeal, selectedDate } = useMealsStore()
  const { addToast } = useUIStore()

  // Local product state allowing in-modal editing
  const [product, setProduct] = useState<BarcodeProductResult | null>(initialProduct)

  const [multiplier, setMultiplier] = useState<number>(1.0)
  const [exactGrams, setExactGrams] = useState<string>('100')
  const [mealTime, setMealTime] = useState<string>(
    new Date().toTimeString().slice(0, 5)
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAddedSuccess, setIsAddedSuccess] = useState(false)

  // Product edit state & fields
  const [isEditingProduct, setIsEditingProduct] = useState(false)
  const [isSavingProduct, setIsSavingProduct] = useState(false)
  const [isRefreshingOFF, setIsRefreshingOFF] = useState(false)

  const [editForm, setEditForm] = useState({
    name: '',
    brand: '',
    calories: '',
    protein: '',
    fat: '',
    carbs: '',
    packageWeight: '',
  })

  // Safe base weight (strictly >= 1g to eliminate any division by zero)
  const safeBaseWeight = Math.max(
    1,
    Math.round(Number(product?.package_weight_grams) || 100)
  )

  // Initialize or reset when product prop changes or modal opens
  useEffect(() => {
    if (initialProduct && isOpen) {
      setProduct(initialProduct)
      const baseWeight = Math.max(
        1,
        Math.round(Number(initialProduct.package_weight_grams) || 100)
      )
      setMultiplier(1.0)
      setExactGrams(String(baseWeight))
      setMealTime(new Date().toTimeString().slice(0, 5))
      setIsEditingProduct(false)
      setIsSubmitting(false)
      setIsAddedSuccess(false)

      setEditForm({
        name: initialProduct.name || '',
        brand: initialProduct.brand || '',
        calories: String(Math.max(0, Number(initialProduct.calories_per_100g) || 0)),
        protein: String(Math.max(0, Number(initialProduct.protein_per_100g) || 0)),
        fat: String(Math.max(0, Number(initialProduct.fat_per_100g) || 0)),
        carbs: String(Math.max(0, Number(initialProduct.carbs_per_100g) || 0)),
        packageWeight: String(baseWeight),
      })
    }
  }, [initialProduct, isOpen])

  if (!product) return null

  // Handle multiplier chip click
  const handleSelectMultiplier = (val: number) => {
    setMultiplier(val)
    const targetGrams = Math.min(
      10000,
      Math.max(1, Math.round(safeBaseWeight * val))
    )
    setExactGrams(String(targetGrams))
  }

  // Handle exact grams change freely as text/number with robust validation
  const handleGramsChange = (valStr: string) => {
    // Allow empty string while typing
    if (valStr === '') {
      setExactGrams('')
      return
    }
    // Filter non-digit characters to block negatives and invalid characters
    const cleanDigits = valStr.replace(/[^0-9]/g, '')
    if (!cleanDigits) {
      setExactGrams('')
      return
    }
    const num = parseInt(cleanDigits, 10)
    if (isNaN(num)) {
      setExactGrams('')
      return
    }
    // Cap at 10,000 grams
    const clamped = Math.min(10000, Math.max(0, num))
    setExactGrams(String(clamped))

    if (clamped > 0 && safeBaseWeight > 0) {
      setMultiplier(Math.round((clamped / safeBaseWeight) * 100) / 100)
    }
  }

  const handleGramsBlur = () => {
    const num = parseInt(exactGrams, 10)
    if (isNaN(num) || num <= 0) {
      setExactGrams(String(safeBaseWeight))
      setMultiplier(1.0)
    } else if (num > 10000) {
      setExactGrams('10000')
      setMultiplier(Math.round((10000 / safeBaseWeight) * 100) / 100)
    } else {
      setExactGrams(String(num))
      setMultiplier(Math.round((num / safeBaseWeight) * 100) / 100)
    }
  }

  // Calculate totals safely - absolute zero chance of NaN or division by zero
  const parsedGrams = parseFloat(exactGrams)
  const currentWeightGrams = Math.min(
    10000,
    Math.max(1, !isNaN(parsedGrams) && parsedGrams > 0 ? Math.round(parsedGrams) : safeBaseWeight)
  )
  const ratio = currentWeightGrams / 100

  const calPer100 = Math.max(0, Number(product.calories_per_100g) || 0)
  const protPer100 = Math.max(0, Number(product.protein_per_100g) || 0)
  const fatPer100 = Math.max(0, Number(product.fat_per_100g) || 0)
  const carbsPer100 = Math.max(0, Number(product.carbs_per_100g) || 0)

  const calculatedCalories = Math.max(0, Math.round(calPer100 * ratio))
  const calculatedProtein = Math.max(0, Math.round(protPer100 * ratio * 10) / 10)
  const calculatedFat = Math.max(0, Math.round(fatPer100 * ratio * 10) / 10)
  const calculatedCarbs = Math.max(0, Math.round(carbsPer100 * ratio * 10) / 10)

  // Save product corrections to database
  const handleSaveProductCorrection = async () => {
    if (!product.product_id) {
      addToast('ID товара не найден для сохранения', 'warning')
      return
    }
    if (!editForm.name.trim()) {
      addToast('Введите название товара', 'warning')
      return
    }

    const correctedWeight = Math.min(
      10000,
      Math.max(1, parseFloat(editForm.packageWeight) || 100)
    )

    setIsSavingProduct(true)
    try {
      const updated = await barcodeApi.updateProduct(product.product_id, {
        name: editForm.name.trim(),
        brand: editForm.brand.trim() || undefined,
        calories_per_100g: Math.max(0, parseFloat(editForm.calories) || 0),
        protein_per_100g: Math.max(0, parseFloat(editForm.protein) || 0),
        fat_per_100g: Math.max(0, parseFloat(editForm.fat) || 0),
        carbs_per_100g: Math.max(0, parseFloat(editForm.carbs) || 0),
        package_weight_grams: correctedWeight,
      })

      setProduct(updated)
      const newWeight = Math.max(1, Math.round(updated.package_weight_grams || 100))
      setExactGrams(String(Math.min(10000, Math.round(newWeight * multiplier))))
      setIsEditingProduct(false)
      addToast('Данные товара сохранены в базе данных!', 'success')
    } catch {
      addToast('Ошибка сохранения исправленных данных товара', 'error')
    } finally {
      setIsSavingProduct(false)
    }
  }

  // Force refresh product data from Open Food Facts API
  const handleRefreshFromOFF = async () => {
    if (!product.barcode) {
      addToast('Штрихкод отсутствует', 'warning')
      return
    }

    setIsRefreshingOFF(true)
    try {
      const refreshed = await barcodeApi.lookup(product.barcode, true)
      setProduct(refreshed)
      const newWeight = Math.max(
        1,
        Math.round(refreshed.package_weight_grams || 100)
      )
      setEditForm({
        name: refreshed.name || '',
        brand: refreshed.brand || '',
        calories: String(Math.max(0, Number(refreshed.calories_per_100g) || 0)),
        protein: String(Math.max(0, Number(refreshed.protein_per_100g) || 0)),
        fat: String(Math.max(0, Number(refreshed.fat_per_100g) || 0)),
        carbs: String(Math.max(0, Number(refreshed.carbs_per_100g) || 0)),
        packageWeight: String(newWeight),
      })
      setExactGrams(String(Math.min(10000, Math.round(newWeight * multiplier))))
      addToast('Данные обновлены из Open Food Facts!', 'success')
    } catch {
      addToast('Не удалось получить обновленные данные из онлайн-базы', 'info')
    } finally {
      setIsRefreshingOFF(false)
    }
  }

  // Add meal with double-click protection and success feedback
  const handleAddMeal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting || isAddedSuccess) return

    setIsSubmitting(true)
    try {
      await addMeal({
        name: product.brand
          ? `${product.name} (${product.brand})`
          : product.name,
        calories: calculatedCalories,
        protein: calculatedProtein,
        fat: calculatedFat,
        carbs: calculatedCarbs,
        weight_grams: currentWeightGrams,
        meal_date: selectedDate,
        meal_time: mealTime,
        photo_path: product.image_url || undefined,
        is_manually_edited: false,
      })

      setIsAddedSuccess(true)
      addToast(
        `Добавлено: ${product.name} (${currentWeightGrams} г)`,
        'success'
      )
      if (onSuccess) onSuccess()
      setTimeout(() => {
        onClose()
      }, 450)
    } catch {
      addToast('Ошибка сохранения приёма пищи', 'error')
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Добавление в рацион"
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Product Card Header */}
        <div className="p-3 sm:p-3.5 rounded-2xl bg-[#19191e] border border-neutral-800 space-y-3">
          <div className="flex items-start gap-3 sm:gap-3.5">
            {product.image_url ? (
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-neutral-900 border border-neutral-700/80 overflow-hidden shrink-0 flex items-center justify-center">
                <img
                  src={resolveMediaUrl(product.image_url)}
                  alt={product.name}
                  className="w-full h-full object-contain p-1"
                  onError={(e) => {
                    ;(e.target as HTMLElement).style.display = 'none'
                  }}
                />
              </div>
            ) : (
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <Package className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  {product.is_honest_sign ? (
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                      <ShieldCheck className="w-3 h-3" /> Честный Знак
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full shrink-0">
                      Штрихкод
                    </span>
                  )}

                  {product.brand && (
                    <span className="text-[11px] text-neutral-400 font-medium truncate max-w-[120px] sm:max-w-[160px]">
                      {product.brand}
                    </span>
                  )}
                </div>

                {/* Toggle inline product editor */}
                <button
                  type="button"
                  onClick={() => setIsEditingProduct(!isEditingProduct)}
                  className={`text-[11px] font-medium flex items-center gap-1 px-2.5 py-1 rounded-xl transition-all cursor-pointer shrink-0 ${
                    isEditingProduct
                      ? 'text-emerald-400 bg-emerald-500/15 border border-emerald-500/30'
                      : 'text-neutral-400 hover:text-white bg-[#141418] hover:bg-neutral-800 border border-neutral-700/60'
                  }`}
                  title="Отредактировать неверные данные товара и сохранить в БД"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>{isEditingProduct ? 'Скрыть' : 'Исправить'}</span>
                </button>
              </div>

              <h3 className="text-sm font-bold text-white line-clamp-2" title={product.name}>
                {product.name}
              </h3>

              <p className="text-[11px] text-neutral-400 mt-0.5">
                Упаковка:{' '}
                <span className="text-white font-medium">
                  {safeBaseWeight} г
                </span>{' '}
                • {Math.round(calPer100)} ккал / 100г
              </p>
            </div>
          </div>

          {/* Inline Product Editor Drawer */}
          {isEditingProduct && (
            <div className="mt-2 pt-3 border-t border-neutral-800/80 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Коррекция товара в базе данных</span>
                </span>
                <span className="text-[10px] text-neutral-500">
                  Сохранится навсегда
                </span>
              </div>

              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input
                    label="Название товара *"
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, name: e.target.value })
                    }
                    placeholder="Например: Творог 9% рассыпчатый"
                  />
                  <Input
                    label="Бренд / производитель"
                    value={editForm.brand}
                    onChange={(e) =>
                      setEditForm({ ...editForm, brand: e.target.value })
                    }
                    placeholder="Например: Простоквашино"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Input
                    label="Ккал / 100г *"
                    type="number"
                    min="0"
                    step="0.1"
                    value={editForm.calories}
                    onChange={(e) =>
                      setEditForm({ ...editForm, calories: e.target.value })
                    }
                  />
                  <Input
                    label="Белки / 100г"
                    type="number"
                    min="0"
                    step="0.1"
                    value={editForm.protein}
                    onChange={(e) =>
                      setEditForm({ ...editForm, protein: e.target.value })
                    }
                  />
                  <Input
                    label="Жиры / 100г"
                    type="number"
                    min="0"
                    step="0.1"
                    value={editForm.fat}
                    onChange={(e) =>
                      setEditForm({ ...editForm, fat: e.target.value })
                    }
                  />
                  <Input
                    label="Углеводы / 100г"
                    type="number"
                    min="0"
                    step="0.1"
                    value={editForm.carbs}
                    onChange={(e) =>
                      setEditForm({ ...editForm, carbs: e.target.value })
                    }
                  />
                </div>

                <div>
                  <Input
                    label="Вес базовой упаковки (г)"
                    type="number"
                    min="1"
                    max="10000"
                    value={editForm.packageWeight}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        packageWeight: e.target.value,
                      })
                    }
                    placeholder="200"
                  />
                </div>
              </div>

              {/* Editor Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRefreshFromOFF}
                  isLoading={isRefreshingOFF}
                  leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                  className="text-xs"
                >
                  Обновить из сети
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsEditingProduct(false)}
                    className="text-xs"
                  >
                    Отмена
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleSaveProductCorrection}
                    isLoading={isSavingProduct}
                    leftIcon={<Save className="w-3.5 h-3.5" />}
                    className="text-xs"
                  >
                    Сохранить в базу
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Regular Portion Addition Form */}
        <form onSubmit={handleAddMeal} className="space-y-4">
          {/* Portion Multiplier Chips (Thumb-Friendly, Min 44px Height, Responsive) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-neutral-200">
                Количество порций / упаковок:
              </span>
              <span className="text-emerald-400 font-bold">
                {multiplier}x ({currentWeightGrams} г)
              </span>
            </div>

            <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
              {PRESET_MULTIPLIERS.map((val) => {
                const isSelected = multiplier === val
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleSelectMultiplier(val)}
                    className={`min-h-[44px] py-2 px-0.5 sm:px-1 text-[11px] sm:text-xs font-bold rounded-xl transition-all cursor-pointer text-center flex items-center justify-center ${
                      isSelected
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25 scale-[1.02]'
                        : 'bg-[#18181c] text-neutral-300 hover:text-white hover:bg-[#222228] border border-neutral-800 active:scale-95'
                    }`}
                  >
                    {val}x
                  </button>
                )
              })}
            </div>
          </div>

          {/* Grams and Time inputs */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            <div>
              <label className="text-[11px] text-neutral-400 block mb-1 font-medium flex items-center gap-1">
                <Scale className="w-3.5 h-3.5 text-emerald-400" /> Точный вес (г)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={exactGrams}
                onChange={(e) => handleGramsChange(e.target.value)}
                onBlur={handleGramsBlur}
                placeholder="100"
                className="w-full min-h-[42px] bg-[#18181b] border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] text-neutral-400 block mb-1 font-medium flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-emerald-400" /> Время приёма
              </label>
              <input
                type="time"
                value={mealTime}
                onChange={(e) => setMealTime(e.target.value)}
                className="w-full min-h-[42px] bg-[#18181b] border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* Recalculated Nutrition Plate */}
          <div className="p-3 sm:p-3.5 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-300 font-medium">
                Итого за выбранную порцию ({currentWeightGrams} г):
              </span>
              <div className="text-right">
                <span className="text-2xl font-black text-emerald-400">
                  {calculatedCalories}
                </span>
                <span className="text-xs text-emerald-400 ml-1 font-semibold">
                  ккал
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pt-1 border-t border-emerald-500/20 text-center text-xs">
              <div className="bg-[#141417]/80 py-2 px-1 sm:px-2 rounded-xl border border-neutral-800">
                <span className="text-[10px] text-neutral-400 block">Белки</span>
                <span className="font-bold text-blue-400 text-xs sm:text-sm">
                  {calculatedProtein} г
                </span>
              </div>
              <div className="bg-[#141417]/80 py-2 px-1 sm:px-2 rounded-xl border border-neutral-800">
                <span className="text-[10px] text-neutral-400 block">Жиры</span>
                <span className="font-bold text-amber-400 text-xs sm:text-sm">
                  {calculatedFat} г
                </span>
              </div>
              <div className="bg-[#141417]/80 py-2 px-1 sm:px-2 rounded-xl border border-neutral-800">
                <span className="text-[10px] text-neutral-400 block">Углеводы</span>
                <span className="font-bold text-purple-400 text-xs sm:text-sm">
                  {calculatedCarbs} г
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isSubmitting || isAddedSuccess}
              className="flex-1 min-h-[44px]"
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isAddedSuccess}
              isLoading={isSubmitting}
              className={`flex-2 min-h-[44px] flex items-center justify-center gap-1.5 transition-all ${
                isAddedSuccess
                  ? 'bg-emerald-600 hover:bg-emerald-600 text-white'
                  : ''
              }`}
            >
              {isAddedSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white animate-in zoom-in-50" />
                  <span>Добавлено в рацион!</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Добавить в рацион</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
