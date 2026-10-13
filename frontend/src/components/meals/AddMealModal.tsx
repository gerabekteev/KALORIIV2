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
  Barcode,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { ProductSearch } from '../products/ProductSearch'
import { RecipeList } from '../recipes/RecipeList'
import { BarcodeScannerView } from '../barcode/BarcodeScannerView'
import { BarcodePortionModal } from '../barcode/BarcodePortionModal'
import { RecentScannedShelf } from '../barcode/RecentScannedShelf'
import { useUIStore } from '../../store/uiStore'
import { useMealsStore } from '../../store/mealsStore'
import { aiApi } from '../../api/ai'
import { barcodeApi } from '../../api/barcode'
import { BarcodeProductResult } from '../../types'

type ModalMode = 'hub' | 'barcode' | 'ai_photo' | 'text_ai' | 'search' | 'recipes' | 'manual'

export const AddMealModal: React.FC = () => {
  const { isAddMealOpen, closeAddMeal, addToast } = useUIStore()
  const {
    addMeal,
    selectedDate,
    startPhotoAIAnalysis,
    startTextAIAnalysis,
  } = useMealsStore()

  const [mode, setMode] = useState<ModalMode>('hub')

  // Barcode scan result & portion modal state
  const [scannedProduct, setScannedProduct] = useState<BarcodeProductResult | null>(null)
  const [isPortionModalOpen, setIsPortionModalOpen] = useState(false)
  const [recentRefreshTrigger, setRecentRefreshTrigger] = useState(0)

  // AI Photo mode state
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [aiComment, setAiComment] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  // AI Text mode state
  const [textDescription, setTextDescription] = useState('')

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

  // Reset to hub whenever modal opens
  useEffect(() => {
    if (isAddMealOpen) {
      setMode('hub')
      setSelectedPhoto(null)
      setPhotoPreview(null)
      setAiComment('')
      setTextDescription('')
      setScannedProduct(null)
      setIsPortionModalOpen(false)
    }
  }, [isAddMealOpen])

  useEffect(() => {
    if (selectedPhoto) {
      const url = URL.createObjectURL(selectedPhoto)
      setPhotoPreview(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setPhotoPreview(null)
    }
  }, [selectedPhoto])

  // Clipboard paste (Ctrl+V) listener for screenshots
  useEffect(() => {
    if (!isAddMealOpen) return

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile()
          if (file) {
            e.preventDefault()
            if (mode !== 'barcode') {
              setSelectedPhoto(file)
              setMode('ai_photo')
              addToast('Скриншот получен из буфера обмена (Ctrl+V)', 'info')
            }
            return
          }
        }
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [isAddMealOpen, mode, addToast])

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
        setMode('ai_photo')
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

  const handleRecognizePhoto = () => {
    if (!selectedPhoto) {
      addToast('Пожалуйста, выберите или сделайте фото', 'warning')
      return
    }

    const photoToUpload = selectedPhoto
    const commentToSend = aiComment.trim() || undefined

    // Launch background AI recognition
    startPhotoAIAnalysis(photoToUpload, commentToSend, selectedDate)

    // Reset state & close modal immediately
    setSelectedPhoto(null)
    setPhotoPreview(null)
    setAiComment('')
    closeAddMeal()

    addToast('Фото отправлено на анализ AI. Блюдо появится в дневнике!', 'info', 3500)
  }

  const handleAnalyzeText = () => {
    const trimmed = textDescription.trim()
    if (!trimmed) {
      addToast('Пожалуйста, введите описание блюда', 'warning')
      return
    }

    // Launch background AI recognition
    startTextAIAnalysis(trimmed, selectedDate)

    // Reset state & close modal immediately
    setTextDescription('')
    closeAddMeal()

    addToast('Текст отправлен на расчёт AI. Блюдо появится в дневнике!', 'info', 3500)
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

  // Titles for sub-views
  const modeTitles: Record<ModalMode, string> = {
    hub: 'Добавить еду',
    barcode: 'Сканер штрихкодов',
    ai_photo: 'Распознавание по фото',
    text_ai: 'Описание еды текстом',
    search: 'База продуктов',
    recipes: 'Мои рецепты',
    manual: 'Ввод вручную',
  }

  return (
    <>
      <Modal
        isOpen={isAddMealOpen}
        onClose={closeAddMeal}
        title={mode === 'hub' ? 'Добавить еду' : modeTitles[mode]}
        maxWidth="md"
      >
        {/* Back navigation header when inside a submode */}
        {mode !== 'hub' && (
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral-800/80">
            <button
              type="button"
              onClick={() => setMode('hub')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer py-1 px-2 rounded-lg hover:bg-neutral-800"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Назад ко всем способам</span>
            </button>
            <span className="text-[11px] text-neutral-400">{modeTitles[mode]}</span>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODE: MAIN CLEAN HUB                                     */}
        {/* ======================================================== */}
        {mode === 'hub' && (
          <div className="space-y-4">
            {/* 1. Omni Search Button */}
            <button
              type="button"
              onClick={() => setMode('search')}
              className="w-full flex items-center justify-between px-3.5 py-3 rounded-2xl bg-[#19191d] hover:bg-[#202026] border border-neutral-800 hover:border-neutral-700 transition-all cursor-pointer group text-left shadow-sm min-w-0"
            >
              <div className="flex items-center gap-2.5 text-neutral-400 group-hover:text-neutral-200 min-w-0 flex-1 mr-2">
                <Search className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-medium truncate">
                  Поиск в базе (156+ продуктов) и рецептах...
                </span>
              </div>
              <span className="text-[10px] text-neutral-500 bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded-md shrink-0">
                База
              </span>
            </button>

            {/* 2. Three Smart Input Action Cards */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-neutral-400 block px-0.5">
                Быстрые способы:
              </span>
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                {/* AI Photo */}
                <button
                  type="button"
                  onClick={() => setMode('ai_photo')}
                  className="flex flex-col items-center justify-center p-2.5 sm:p-3.5 rounded-2xl bg-[#19191e] hover:bg-[#22222a] border border-neutral-800/90 hover:border-emerald-500/40 transition-all cursor-pointer group active:scale-[0.98] text-center min-w-0"
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform mb-1.5 shrink-0">
                    <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <span className="text-xs font-bold text-white leading-tight truncate max-w-full">
                    AI Фото
                  </span>
                  <span className="text-[10px] text-neutral-400 mt-0.5 truncate max-w-full">
                    Снимок / Ctrl+V
                  </span>
                </button>

                {/* Barcode & Chestny ZNAK */}
                <button
                  type="button"
                  onClick={() => setMode('barcode')}
                  className="relative flex flex-col items-center justify-center p-2.5 sm:p-3.5 rounded-2xl bg-[#19191e] hover:bg-[#22222a] border border-neutral-800/90 hover:border-emerald-500/40 transition-all cursor-pointer group active:scale-[0.98] text-center shadow-sm min-w-0"
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300 group-hover:scale-110 transition-transform mb-1.5 shrink-0">
                    <Barcode className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <span className="text-xs font-bold text-white leading-tight flex items-center gap-1 truncate max-w-full">
                    Штрихкод
                  </span>
                  <span className="text-[10px] text-emerald-400 font-semibold mt-0.5 flex items-center gap-0.5 truncate max-w-full">
                    <ShieldCheck className="w-2.5 h-2.5 shrink-0" /> и ЧЗ
                  </span>
                </button>

                {/* Text AI */}
                <button
                  type="button"
                  onClick={() => setMode('text_ai')}
                  className="flex flex-col items-center justify-center p-2.5 sm:p-3.5 rounded-2xl bg-[#19191e] hover:bg-[#22222a] border border-neutral-800/90 hover:border-emerald-500/40 transition-all cursor-pointer group active:scale-[0.98] text-center min-w-0"
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform mb-1.5 shrink-0">
                    <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <span className="text-xs font-bold text-white leading-tight truncate max-w-full">
                    Текст AI
                  </span>
                  <span className="text-[10px] text-neutral-400 mt-0.5 truncate max-w-full">
                    Описать текстом
                  </span>
                </button>
              </div>
            </div>

            {/* 3. Recent Scanned Products Shelf (With Photos!) */}
            <RecentScannedShelf
              refreshTrigger={recentRefreshTrigger}
              onSelectProduct={(prod) => {
                setScannedProduct(prod)
                setIsPortionModalOpen(true)
              }}
              onOpenScanner={() => setMode('barcode')}
            />

            {/* 4. Recipes & Manual Entry Navigation Row */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-neutral-800/80">
              <button
                type="button"
                onClick={() => setMode('recipes')}
                className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-[#161619] hover:bg-[#1f1f24] border border-neutral-800 transition-all cursor-pointer text-left group min-w-0"
              >
                <div className="flex items-center gap-2 min-w-0 mr-1">
                  <Star className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-semibold text-neutral-200 truncate">
                    Мои рецепты
                  </span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-white shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => setMode('manual')}
                className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-[#161619] hover:bg-[#1f1f24] border border-neutral-800 transition-all cursor-pointer text-left group min-w-0"
              >
                <div className="flex items-center gap-2 min-w-0 mr-1">
                  <PenTool className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="text-xs font-semibold text-neutral-200 truncate">
                    Ввести вручную
                  </span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-white shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODE: BARCODE / CHESTNY ZNAK SCANNER                     */}
        {/* ======================================================== */}
        {mode === 'barcode' && (
          <BarcodeScannerView
            onProductFound={(product) => {
              setScannedProduct(product)
              setIsPortionModalOpen(true)
              setRecentRefreshTrigger((prev) => prev + 1)
            }}
            onSwitchToAI={(file, comment) => {
              if (file) setSelectedPhoto(file)
              if (comment) setAiComment(comment)
              setMode('ai_photo')
            }}
            onSwitchToManual={(initialName, barcode) => {
              setManualForm((prev) => ({
                ...prev,
                name: initialName || (barcode ? `Товар (${barcode})` : ''),
              }))
              setMode('manual')
            }}
            onCancel={() => setMode('hub')}
          />
        )}

        {/* ======================================================== */}
        {/* MODE: AI PHOTO                                           */}
        {/* ======================================================== */}
        {mode === 'ai_photo' && (
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
                      Скриншоты доставок (Яндекс Еда, Самокат, Додо), чеки, тарелки
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
              onClick={handleRecognizePhoto}
              leftIcon={<Sparkles className="w-4 h-4 text-emerald-300" />}
            >
              Распознать через AI
            </Button>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODE: TEXT AI                                            */}
        {/* ======================================================== */}
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
              onClick={handleAnalyzeText}
              leftIcon={<Sparkles className="w-4 h-4 text-emerald-300" />}
            >
              Рассчитать через AI
            </Button>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODE: SEARCH PRODUCTS                                    */}
        {/* ======================================================== */}
        {mode === 'search' && (
          <ProductSearch onSelectProduct={handleSelectProduct} />
        )}

        {/* ======================================================== */}
        {/* MODE: RECIPES                                            */}
        {/* ======================================================== */}
        {mode === 'recipes' && (
          <RecipeList onSelectRecipe={handleSelectRecipe} />
        )}

        {/* ======================================================== */}
        {/* MODE: MANUAL ENTRY                                       */}
        {/* ======================================================== */}
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

      {/* Barcode Portion Modal (with x0.5 - x5 Multipliers & Photo) */}
      <BarcodePortionModal
        product={scannedProduct}
        isOpen={isPortionModalOpen}
        onClose={() => {
          setIsPortionModalOpen(false)
          setScannedProduct(null)
        }}
        onSuccess={() => {
          closeAddMeal()
          setRecentRefreshTrigger((prev) => prev + 1)
        }}
      />
    </>
  )
}
