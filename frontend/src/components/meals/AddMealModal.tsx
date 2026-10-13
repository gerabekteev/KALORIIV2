import React, { useState, useRef, useEffect } from 'react'
import {
  Camera,
  Image as ImageIcon,
  Sparkles,
  MessageSquare,
  Search,
  PenTool,
  X,
  Star,
  UploadCloud,
} from 'lucide-react'
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

  const [mode, setMode] = useState<'ai' | 'text_ai' | 'search' | 'recipes' | 'manual'>('ai')

  // AI Photo mode state
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [aiComment, setAiComment] = useState('')
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // AI Text mode state
  const [textDescription, setTextDescription] = useState('')
  const [isAnalyzingText, setIsAnalyzingText] = useState(false)

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

  // Clipboard paste (Ctrl+V) listener for screenshots and images
  useEffect(() => {
    if (!isAddMealOpen) return

    const handlePaste = (e: ClipboardEvent) => {
      // Don't hijack paste if user is typing text in an input or textarea unless it's an image file
      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            setSelectedPhoto(file)
            setMode('ai')
            addToast('Скриншот получен из буфера обмена (Ctrl+V)', 'info')
            return
          }
        }
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [isAddMealOpen, addToast])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      const file = files[0]
      if (file.type.startsWith('image/')) {
        setSelectedPhoto(file)
        setMode('ai')
        addToast('Скриншот / фото успешно загружено', 'info')
      } else {
        addToast('Пожалуйста, перетащите файл изображения (JPEG, PNG, WebP)', 'warning')
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedPhoto(file)
    }
  }

  const handleRecognizePhoto = async () => {
    if (!selectedPhoto) {
      addToast('Пожалуйста, выберите или сделайте фото', 'warning')
      return
    }

    setIsAnalyzingPhoto(true)
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
      setIsAnalyzingPhoto(false)
    }
  }

  const handleAnalyzeText = async () => {
    const trimmed = textDescription.trim()
    if (!trimmed) {
      addToast('Пожалуйста, введите описание блюда', 'warning')
      return
    }

    setIsAnalyzingText(true)
    try {
      const result = await aiApi.analyzeText(trimmed)
      closeAddMeal()
      openAIResult(result, null)
      // Reset local text
      setTextDescription('')
    } catch (err: any) {
      addToast(
        err.message || 'Ошибка расчёта КБЖУ через AI. Попробуйте уточнить описание.',
        'error',
        5000
      )
    } finally {
      setIsAnalyzingText(false)
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
      {/* Tab Switcher - 5 tabs */}
      <div className="grid grid-cols-5 bg-[#141417] p-1 rounded-xl mb-4 border border-neutral-800 gap-1 text-[11px]">
        <button
          type="button"
          onClick={() => setMode('ai')}
          className={`flex items-center justify-center gap-1 py-2 font-semibold rounded-lg transition-all cursor-pointer ${
            mode === 'ai'
              ? 'bg-emerald-500 text-white shadow-md'
              : 'text-neutral-400 hover:text-white'
          }`}
          title="Распознавание по фото"
        >
          <Camera className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate hidden sm:inline">AI фото</span>
          <span className="truncate sm:hidden">Фото</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('text_ai')}
          className={`flex items-center justify-center gap-1 py-2 font-semibold rounded-lg transition-all cursor-pointer ${
            mode === 'text_ai'
              ? 'bg-emerald-500 text-white shadow-md'
              : 'text-neutral-400 hover:text-white'
          }`}
          title="Описать еду текстом через AI"
        >
          <MessageSquare className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate hidden sm:inline">Текст AI</span>
          <span className="truncate sm:hidden">Текст</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('search')}
          className={`flex items-center justify-center gap-1 py-2 font-semibold rounded-lg transition-all cursor-pointer ${
            mode === 'search'
              ? 'bg-emerald-500 text-white shadow-md'
              : 'text-neutral-400 hover:text-white'
          }`}
          title="Поиск по базе продуктов"
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate hidden sm:inline">Продукты</span>
          <span className="truncate sm:hidden">База</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('recipes')}
          className={`flex items-center justify-center gap-1 py-2 font-semibold rounded-lg transition-all cursor-pointer ${
            mode === 'recipes'
              ? 'bg-emerald-500 text-white shadow-md'
              : 'text-neutral-400 hover:text-white'
          }`}
          title="Мои рецепты и избранное"
        >
          <Star className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate hidden sm:inline">Рецепты</span>
          <span className="truncate sm:hidden">Рецепт</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('manual')}
          className={`flex items-center justify-center gap-1 py-2 font-semibold rounded-lg transition-all cursor-pointer ${
            mode === 'manual'
              ? 'bg-emerald-500 text-white shadow-md'
              : 'text-neutral-400 hover:text-white'
          }`}
          title="Ввод вручную"
        >
          <PenTool className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate hidden sm:inline">Вручную</span>
          <span className="truncate sm:hidden">Ручной</span>
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
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-5 rounded-2xl bg-[#202025] hover:bg-[#27272d] border border-neutral-800 transition-all cursor-pointer group active:scale-[0.98]"
                >
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform mb-2">
                    <Camera className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-semibold text-white">Камера</span>
                  <span className="text-[11px] text-neutral-400 mt-0.5">
                    Сделать снимок
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-5 rounded-2xl bg-[#202025] hover:bg-[#27272d] border border-neutral-800 transition-all cursor-pointer group active:scale-[0.98]"
                >
                  <div className="w-11 h-11 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform mb-2">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-semibold text-white">Галерея</span>
                  <span className="text-[11px] text-neutral-400 mt-0.5">
                    Выбрать файл
                  </span>
                </button>
              </div>

              {/* Drag & drop / Clipboard paste prompt plate */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => galleryInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-4 text-center transition-all flex flex-col items-center justify-center gap-2 cursor-pointer ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-500/10 scale-[1.01]'
                    : 'border-neutral-800 bg-[#161619] hover:border-neutral-700 hover:bg-[#1c1c20]'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-neutral-800/90 border border-neutral-700/60 flex items-center justify-center text-emerald-400">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-neutral-200">
                    Перетащите фото/скриншот сюда или вставьте из буфера (Ctrl+V)
                  </p>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Скриншоты доставки (Яндекс Еда, Самокат, Додо), чеки, рецепты, КБЖУ этикетки
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative rounded-2xl overflow-hidden border bg-neutral-900 aspect-video max-h-52 flex items-center justify-center transition-all ${
                isDragging ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-neutral-700'
              }`}
            >
              <img
                src={photoPreview}
                alt="Предпросмотр"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 left-2 bg-emerald-500/90 backdrop-blur-sm text-white text-[11px] font-semibold px-2 py-0.5 rounded-lg shadow-sm flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span>Готово к анализу</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedPhoto(null)
                  setPhotoPreview(null)
                }}
                className="absolute top-2 right-2 p-1.5 bg-black/75 hover:bg-black text-white rounded-full transition-colors cursor-pointer"
                title="Удалить фото"
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
            isLoading={isAnalyzingPhoto}
            onClick={handleRecognizePhoto}
            leftIcon={<Sparkles className="w-4 h-4 text-emerald-300" />}
          >
            Распознать через AI
          </Button>
        </div>
      )}

      {/* Mode 2: AI by Text Description */}
      {mode === 'text_ai' && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-neutral-300 block">
                Опишите, что вы съели
              </label>
              <span className="text-[11px] text-neutral-500">AI расчёт КБЖУ</span>
            </div>
            <textarea
              rows={4}
              placeholder="Например: Овсянка 200г на молоке с бананом и ложкой мёда, плюс чашка кофе с молоком"
              value={textDescription}
              onChange={(e) => setTextDescription(e.target.value)}
              className="w-full bg-[#18181b] border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-emerald-500 resize-none transition-colors"
            />
          </div>

          {/* Quick chip suggestions */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-neutral-400 font-medium block">
              Быстрые примеры:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[
                'Овсянка 200г на молоке с бананом и мёдом',
                'Куриная грудка 180г, гречка 150г и огурец',
                'Омлет из 3 яиц с сыром и помидорами',
                'Капучино 300мл без сахара и круассан',
              ].map((template) => (
                <button
                  key={template}
                  type="button"
                  onClick={() => setTextDescription(template)}
                  className="text-[11px] text-neutral-400 hover:text-emerald-300 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-emerald-500/30 px-2.5 py-1 rounded-lg transition-colors cursor-pointer text-left"
                >
                  {template}
                </button>
              ))}
            </div>
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={!textDescription.trim()}
            isLoading={isAnalyzingText}
            onClick={handleAnalyzeText}
            leftIcon={<Sparkles className="w-4 h-4 text-emerald-300" />}
          >
            Рассчитать через AI
          </Button>
        </div>
      )}

      {/* Mode 3: Search Products */}
      {mode === 'search' && (
        <ProductSearch onSelectProduct={handleSelectProduct} />
      )}

      {/* Mode 4: Saved Recipes & Favorites */}
      {mode === 'recipes' && (
        <RecipeList onSelectRecipe={handleSelectRecipe} />
      )}

      {/* Mode 5: Manual Entry */}
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
