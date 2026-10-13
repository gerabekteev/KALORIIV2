import React, { useState, useRef, useEffect } from 'react'
import { Camera, Image as ImageIcon, Sparkles, Search, PenTool, X, Star } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { ProductSearch } from '../products/ProductSearch'
import { RecipeList } from '../recipes/RecipeList'
import { useUIStore } from '../../store/uiStore'
import { useMealsStore } from '../../store/mealsStore'
import { aiApi } from '../../api/ai'

export const AddMealModal: React.FC = () => {
  const { isAddMealOpen, closeAddMeal, openAIResult, addToast } = useUIStore()
  const { addMeal, selectedDate } = useMealsStore()

  const [mode, setMode] = useState<'ai' | 'search' | 'recipes' | 'manual'>('ai')

  // AI mode state
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [aiComment, setAiComment] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // Manual mode state
  const [manualForm, setManualForm] = useState({
    name: '',
    calories: '',
    protein: '',
    fat: '',
    carbs: '',
    weight_grams: '',
    meal_time: new Date().toTimeString().slice(0, 5),
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (selectedPhoto) {
      const url = URL.createObjectURL(selectedPhoto)
      setPhotoPreview(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setPhotoPreview(null)
    }
  }, [selectedPhoto])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedPhoto(file)
    }
  }

  const handleRecognizeAI = async () => {
    if (!selectedPhoto) {
      addToast('Пожалуйста, выберите или сделайте фото', 'warning')
      return
    }

    setIsAnalyzing(true)
    try {
      const result = await aiApi.recognizeFood(selectedPhoto, aiComment)
      closeAddMeal()
      openAIResult(result, selectedPhoto)
      // Reset local state
      setSelectedPhoto(null)
      setPhotoPreview(null)
      setAiComment('')
    } catch (err: any) {
      addToast(
        err.message || 'Ошибка распознавания AI. Попробуйте ещё раз или введите вручную.',
        'error',
        5000
      )
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualForm.name.trim()) {
      addToast('Введите название блюда', 'warning')
      return
    }

    setIsSubmitting(true)
    try {
      await addMeal({
        name: manualForm.name.trim(),
        calories: Number(manualForm.calories) || 0,
        protein: Number(manualForm.protein) || 0,
        fat: Number(manualForm.fat) || 0,
        carbs: Number(manualForm.carbs) || 0,
        weight_grams: manualForm.weight_grams ? Number(manualForm.weight_grams) : undefined,
        meal_time: manualForm.meal_time || new Date().toTimeString().slice(0, 5),
        meal_date: selectedDate,
        is_manually_edited: true,
      })
      addToast('Приём пищи добавлен', 'success')
      closeAddMeal()
      // Reset form
      setManualForm({
        name: '',
        calories: '',
        protein: '',
        fat: '',
        carbs: '',
        weight_grams: '',
        meal_time: new Date().toTimeString().slice(0, 5),
      })
    } catch {
      addToast('Ошибка сохранения', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSelectProduct = async (productData: {
    name: string
    calories: number
    protein: number
    fat: number
    carbs: number
    weight_grams: number
  }) => {
    try {
      await addMeal({
        ...productData,
        meal_time: new Date().toTimeString().slice(0, 5),
        meal_date: selectedDate,
        is_manually_edited: false,
      })
      addToast(`Добавлено: ${productData.name}`, 'success')
      closeAddMeal()
    } catch {
      addToast('Ошибка добавления продукта', 'error')
    }
  }

  const handleSelectRecipe = async (recipeData: {
    name: string
    calories: number
    protein: number
    fat: number
    carbs: number
    weight_grams: number
  }) => {
    try {
      await addMeal({
        ...recipeData,
        meal_time: new Date().toTimeString().slice(0, 5),
        meal_date: selectedDate,
        is_manually_edited: false,
      })
      addToast(`Рецепт добавлен: ${recipeData.name}`, 'success')
      closeAddMeal()
    } catch {
      addToast('Ошибка добавления рецепта', 'error')
    }
  }

  return (
    <Modal
      isOpen={isAddMealOpen}
      onClose={closeAddMeal}
      title="Добавить приём пищи"
      maxWidth="md"
    >
      {/* Tab Switcher - 4 tabs */}
      <div className="grid grid-cols-4 bg-[#141417] p-1 rounded-xl mb-4 border border-neutral-800 gap-1">
        <button
          type="button"
          onClick={() => setMode('ai')}
          className={`flex items-center justify-center gap-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
            mode === 'ai'
              ? 'bg-emerald-500 text-white shadow-md'
              : 'text-neutral-400 hover:text-white'
          }`}
          title="Распознавание по фото"
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">AI фото</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('search')}
          className={`flex items-center justify-center gap-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
            mode === 'search'
              ? 'bg-emerald-500 text-white shadow-md'
              : 'text-neutral-400 hover:text-white'
          }`}
          title="Поиск по базе продуктов"
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Продукты</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('recipes')}
          className={`flex items-center justify-center gap-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
            mode === 'recipes'
              ? 'bg-emerald-500 text-white shadow-md'
              : 'text-neutral-400 hover:text-white'
          }`}
          title="Мои рецепты и избранное"
        >
          <Star className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Рецепты</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('manual')}
          className={`flex items-center justify-center gap-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
            mode === 'manual'
              ? 'bg-emerald-500 text-white shadow-md'
              : 'text-neutral-400 hover:text-white'
          }`}
          title="Ввод вручную"
        >
          <PenTool className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Вручную</span>
        </button>
      </div>

      {/* Mode 1: AI by Photo */}
      {mode === 'ai' && (
        <div className="space-y-4">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={cameraInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
          <input
            type="file"
            accept="image/*"
            ref={galleryInputRef}
            onChange={handleFileChange}
            className="hidden"
          />

          {!photoPreview ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-6 rounded-2xl bg-[#202025] hover:bg-[#27272d] border border-neutral-800 transition-all cursor-pointer group active:scale-[0.98]"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform mb-2">
                  <Camera className="w-6 h-6" />
                </div>
                <span className="text-sm font-semibold text-white">Камера</span>
                <span className="text-[11px] text-neutral-400 mt-0.5">
                  Сделать снимок
                </span>
              </button>

              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-6 rounded-2xl bg-[#202025] hover:bg-[#27272d] border border-neutral-800 transition-all cursor-pointer group active:scale-[0.98]"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform mb-2">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <span className="text-sm font-semibold text-white">Галерея</span>
                <span className="text-[11px] text-neutral-400 mt-0.5">
                  Выбрать файл
                </span>
              </button>
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden border border-neutral-700 bg-neutral-900 aspect-video max-h-52 flex items-center justify-center">
              <img
                src={photoPreview}
                alt="Предпросмотр"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  setSelectedPhoto(null)
                  setPhotoPreview(null)
                }}
                className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black text-white rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Optional comment */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-300 block">
              Пояснение к фото (опционально)
            </label>
            <input
              type="text"
              placeholder='Например: "Гречка с курицей, около 300г"'
              value={aiComment}
              onChange={(e) => setAiComment(e.target.value)}
              className="w-full bg-[#18181b] border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-emerald-500"
            />
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={!selectedPhoto}
            isLoading={isAnalyzing}
            onClick={handleRecognizeAI}
            leftIcon={<Sparkles className="w-4 h-4 text-emerald-300" />}
          >
            Распознать через AI
          </Button>
        </div>
      )}

      {/* Mode 2: Search Products */}
      {mode === 'search' && (
        <ProductSearch onSelectProduct={handleSelectProduct} />
      )}

      {/* Mode 3: Saved Recipes & Favorites */}
      {mode === 'recipes' && (
        <RecipeList onSelectRecipe={handleSelectRecipe} />
      )}

      {/* Mode 4: Manual Entry */}
      {mode === 'manual' && (
        <form onSubmit={handleManualSubmit} className="space-y-3.5">
          <Input
            label="Название блюда *"
            placeholder="Например: Творог с ягодами"
            value={manualForm.name}
            onChange={(e) =>
              setManualForm({ ...manualForm, name: e.target.value })
            }
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Калории (ккал) *"
              type="number"
              min="0"
              placeholder="0"
              value={manualForm.calories}
              onChange={(e) =>
                setManualForm({ ...manualForm, calories: e.target.value })
              }
              required
            />
            <Input
              label="Вес порции (г)"
              type="number"
              min="0"
              placeholder="100"
              value={manualForm.weight_grams}
              onChange={(e) =>
                setManualForm({ ...manualForm, weight_grams: e.target.value })
              }
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Input
              label="Белки (г)"
              type="number"
              step="0.1"
              min="0"
              placeholder="0"
              value={manualForm.protein}
              onChange={(e) =>
                setManualForm({ ...manualForm, protein: e.target.value })
              }
            />
            <Input
              label="Жиры (г)"
              type="number"
              step="0.1"
              min="0"
              placeholder="0"
              value={manualForm.fat}
              onChange={(e) =>
                setManualForm({ ...manualForm, fat: e.target.value })
              }
            />
            <Input
              label="Углеводы (г)"
              type="number"
              step="0.1"
              min="0"
              placeholder="0"
              value={manualForm.carbs}
              onChange={(e) =>
                setManualForm({ ...manualForm, carbs: e.target.value })
              }
            />
          </div>

          <Input
            label="Время приёма"
            type="time"
            value={manualForm.meal_time}
            onChange={(e) =>
              setManualForm({ ...manualForm, meal_time: e.target.value })
            }
          />

          <Button
            type="submit"
            className="w-full mt-2"
            isLoading={isSubmitting}
          >
            Сохранить в дневник
          </Button>
        </form>
      )}
    </Modal>
  )
}
