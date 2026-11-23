import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Camera,
  Image as ImageIcon,
  Sparkles,
  Search,
  PenTool,
  X,
  Star,
  UploadCloud,
  Barcode,
  ArrowLeft,
  ChevronRight,
  Mic,
  Square,
  Scale,
  Package,
  Calculator,
  Check,
  Plus,
  Minus,
  Flame,
  Clock,
  ScanLine,
} from 'lucide-react'
import { Modal, registerBackHandler } from '../ui/Modal'
import { Button } from '../ui/Button'
import { ProductSearch } from '../products/ProductSearch'
import { RecipeList } from '../recipes/RecipeList'
import { BarcodeScannerView } from '../barcode/BarcodeScannerView'
import { BarcodePortionModal } from '../barcode/BarcodePortionModal'
import { RecentScannedShelf } from '../barcode/RecentScannedShelf'
import { useUIStore } from '../../store/uiStore'
import { useMealsStore } from '../../store/mealsStore'
import { productsApi } from '../../api/products'
import { barcodeApi } from '../../api/barcode'
import { BarcodeProductResult } from '../../types'
import { isNativeApp, pickImageNative } from '../../utils/platform'

type ModalMode = 'hub' | 'barcode' | 'ai_photo' | 'text_ai' | 'voice_ai' | 'search' | 'recipes' | 'manual'
type ManualCalcMode = 'per_100g' | 'total_portion'

const PORTION_PRESETS = [30, 50, 100, 150, 200, 250, 300]

function parseNumericInput(val: string): number {
  if (!val) return 0
  const normalized = val.replace(',', '.').trim()
  const parsed = parseFloat(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export const AddMealModal: React.FC = () => {
  const { isAddMealOpen, closeAddMeal, addToast, addMealPresetTime, addMealInitialMode } = useUIStore()
  const {
    addMeal,
    selectedDate,
    startPhotoAIAnalysis,
    startTextAIAnalysis,
    startVoiceAIAnalysis,
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

  // AI Voice mode state
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const isRecordingCancelledRef = useRef(false)
  const audioChunksRef = useRef<Blob[]>([])

  // Manual mode state
  const [manualCalcMode, setManualCalcMode] = useState<ManualCalcMode>('per_100g')
  const [manualBarcode, setManualBarcode] = useState('')
  const [manualBrand, setManualBrand] = useState('')
  const [manualPackageWeight, setManualPackageWeight] = useState('')
  const [manualImageUrl, setManualImageUrl] = useState('')
  const [manualFromOcr, setManualFromOcr] = useState(false)
  const [saveToCatalog, setSaveToCatalog] = useState(true)
  const [manualForm, setManualForm] = useState({
    name: '',
    calories: '',
    protein: '',
    fat: '',
    carbs: '',
    weight_grams: '100',
    meal_time: new Date().toTimeString().slice(0, 5),
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isScanningManualLabel, setIsScanningManualLabel] = useState(false)

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const manualLabelInputRef = useRef<HTMLInputElement>(null)
  const textDescriptionRef = useRef<HTMLTextAreaElement>(null)
  const aiCommentRef = useRef<HTMLInputElement>(null)

  const cancelVoiceRecording = useCallback(() => {
    isRecordingCancelledRef.current = true
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch {
        // ignore
      }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }
    setIsRecording(false)
    setRecordingSeconds(0)
  }, [])

  // Reset to initialMode (hub or 1-tap mode from Today Bento) whenever modal opens
  useEffect(() => {
    if (isAddMealOpen) {
      setMode(addMealInitialMode || 'hub')
      setSelectedPhoto(null)
      setPhotoPreview(null)
      setAiComment('')
      setTextDescription('')
      setScannedProduct(null)
      setIsPortionModalOpen(false)
      setIsRecording(false)
      setRecordingSeconds(0)
      setManualCalcMode('per_100g')
      setManualBarcode('')
      setManualBrand('')
      setManualPackageWeight('')
      setManualImageUrl('')
      setManualFromOcr(false)
      setSaveToCatalog(true)
      const timePreset = addMealPresetTime || new Date().toTimeString().slice(0, 5)
      setManualForm({
        name: '',
        calories: '',
        protein: '',
        fat: '',
        carbs: '',
        weight_grams: '100',
        meal_time: timePreset,
      })
    } else {
      cancelVoiceRecording()
    }
  }, [isAddMealOpen, addMealPresetTime, addMealInitialMode, cancelVoiceRecording])

  useEffect(() => {
    if (!isAddMealOpen || mode === 'hub' || isPortionModalOpen) return
    return registerBackHandler(() => {
      if (isRecording) {
        cancelVoiceRecording()
      }
      setMode('hub')
      return true
    })
  }, [isAddMealOpen, mode, isPortionModalOpen, isRecording, cancelVoiceRecording])

  useEffect(() => {
    let interval: any
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isRecording])

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
      if (mode === 'barcode') return

      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        if (e.clipboardData?.getData('text/plain')) {
          return
        }
      }

      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile()
          if (file) {
            e.preventDefault()
            setSelectedPhoto(file)
            setMode('ai_photo')
            addToast('Скриншот получен из буфера обмена (Ctrl+V)', 'info')
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

    // Explicitly blur the active element to commit any in-flight mobile IME composition (Gboard/iOS)
    if (aiCommentRef.current) {
      aiCommentRef.current.blur()
    } else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    const rawComment = aiCommentRef.current?.value ?? aiComment
    const photoToUpload = selectedPhoto
    const commentToSend = rawComment.trim() || undefined

    // Launch background AI recognition
    startPhotoAIAnalysis(
      photoToUpload,
      commentToSend,
      selectedDate,
      addMealPresetTime || undefined
    )

    // Reset state & close modal immediately
    setSelectedPhoto(null)
    setPhotoPreview(null)
    setAiComment('')
    closeAddMeal()

    addToast('Фото отправлено на анализ AI. Блюдо появится в дневнике!', 'info', 3500)
  }

  const handleAnalyzeText = () => {
    // Explicitly blur the active element to commit any in-flight mobile IME composition (Gboard/iOS)
    if (textDescriptionRef.current) {
      textDescriptionRef.current.blur()
    } else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    // Read latest committed value from DOM ref (where the committed word now lives) or state fallback
    const rawText = textDescriptionRef.current?.value ?? textDescription
    const trimmed = rawText.trim()
    if (!trimmed) {
      addToast('Пожалуйста, введите описание блюда', 'warning')
      return
    }

    // Launch background AI recognition
    startTextAIAnalysis(trimmed, selectedDate, addMealPresetTime || undefined)

    // Reset state & close modal immediately
    setTextDescription('')
    closeAddMeal()

    addToast('Текст отправлен на расчёт AI. Блюдо появится в дневнике!', 'info', 3500)
  }

  const startVoiceRecording = async () => {
    try {
      isRecordingCancelledRef.current = false
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        mediaStreamRef.current = null
        if (isRecordingCancelledRef.current) {
          isRecordingCancelledRef.current = false
          audioChunksRef.current = []
          return
        }
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        if (audioBlob.size > 0) {
          startVoiceAIAnalysis(audioBlob, selectedDate, addMealPresetTime || undefined)
          closeAddMeal()
          addToast(
            'Голосовое сообщение отправлено в AI! Расшифровка сохранится в описание блюда.',
            'info',
            4000
          )
        }
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
      setRecordingSeconds(0)
    } catch {
      addToast('Не удалось получить доступ к микрофону в браузере', 'error')
    }
  }

  const stopVoiceRecording = () => {
    isRecordingCancelledRef.current = false
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
  }

  // Computed values for Manual Entry
  const rawProtein = parseNumericInput(manualForm.protein)
  const rawFat = parseNumericInput(manualForm.fat)
  const rawCarbs = parseNumericInput(manualForm.carbs)
  const macroCalculatedCalories = Math.round(rawProtein * 4 + rawFat * 9 + rawCarbs * 4)
  const hasMacroValues = rawProtein > 0 || rawFat > 0 || rawCarbs > 0
  const enteredCalories = parseNumericInput(manualForm.calories)
  const effectiveBaseCalories =
    manualForm.calories.trim() !== '' ? enteredCalories : macroCalculatedCalories

  const portionWeightGrams = Math.max(
    0,
    parseNumericInput(manualForm.weight_grams || (manualCalcMode === 'per_100g' ? '100' : '0'))
  )
  const packageWeightGrams = parseNumericInput(manualPackageWeight)
  const portionRatio = manualCalcMode === 'per_100g' ? portionWeightGrams / 100 : 1

  const finalPortionCalories = Math.round(effectiveBaseCalories * portionRatio)
  const finalPortionProtein = Math.round(rawProtein * portionRatio * 10) / 10
  const finalPortionFat = Math.round(rawFat * portionRatio * 10) / 10
  const finalPortionCarbs = Math.round(rawCarbs * portionRatio * 10) / 10

  const handleAdjustPortionWeight = (delta: number) => {
    const current = portionWeightGrams || 100
    const next = Math.max(5, Math.round(current + delta))
    setManualForm((prev) => ({ ...prev, weight_grams: String(next) }))
  }

  const handleScanManualLabelFile = async (file: File) => {
    setIsScanningManualLabel(true)
    try {
      const res = await barcodeApi.scanImage(file, manualBarcode.trim() || undefined)
      if (res.product) {
        const p = res.product
        setManualCalcMode('per_100g')
        setManualFromOcr(true)
        if (p.image_url) {
          setManualImageUrl(p.image_url)
        }
        if (p.barcode && !manualBarcode) {
          setManualBarcode(p.barcode)
        }
        if (p.brand) {
          setManualBrand(p.brand)
        }
        const pkgW = p.package_weight_grams && p.package_weight_grams > 0 ? Math.round(p.package_weight_grams) : 0
        if (pkgW > 0) {
          setManualPackageWeight(String(pkgW))
        }
        setManualForm((prev) => ({
          ...prev,
          name: p.name || prev.name,
          calories: String(Math.round(p.calories_per_100g || 0)),
          protein: String(Math.round((p.protein_per_100g || 0) * 10) / 10),
          fat: String(Math.round((p.fat_per_100g || 0) * 10) / 10),
          carbs: String(Math.round((p.carbs_per_100g || 0) * 10) / 10),
          weight_grams: pkgW > 0 ? String(pkgW) : prev.weight_grams || '100',
        }))
        addToast('Данные с этикетки перенесены в форму! Укажите вес вашей порции.', 'success', 3500)
      } else {
        addToast(res.message || 'Не удалось считать таблицу КБЖУ с фото', 'warning')
      }
    } catch (err: any) {
      addToast(err?.message || 'Ошибка распознавания этикетки через AI', 'error')
    } finally {
      setIsScanningManualLabel(false)
    }
  }

  const handleTriggerManualLabelScan = async () => {
    if (isNativeApp()) {
      try {
        const file = await pickImageNative('camera')
        if (file) await handleScanManualLabelFile(file)
      } catch {
        addToast('Не удалось открыть камеру', 'error')
      }
      return
    }
    manualLabelInputRef.current?.click()
  }

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    const cleanName = manualForm.name.trim()
    const cleanBrand = manualBrand.trim()
    if (!cleanName) {
      addToast('Введите название продукта или блюда', 'warning')
      return
    }
    if (manualCalcMode === 'per_100g' && portionWeightGrams <= 0) {
      addToast('Укажите вес съеденной порции в граммах', 'warning')
      return
    }
    if (effectiveBaseCalories <= 0 && !hasMacroValues) {
      addToast('Укажите калорийность или БЖУ', 'warning')
      return
    }

    const displayMealName =
      cleanBrand && !cleanName.toLowerCase().includes(cleanBrand.toLowerCase())
        ? `${cleanName} (${cleanBrand})`
        : cleanName

    setIsSubmitting(true)
    try {
      // 1. Optionally save to product catalog (and recent scanned shelf if barcode is attached)
      if (manualCalcMode === 'per_100g' && (saveToCatalog || manualBarcode.trim())) {
        try {
          await productsApi.createProduct({
            name: cleanName,
            brand: cleanBrand || null,
            barcode: manualBarcode.trim() || null,
            image_url: manualImageUrl || null,
            package_weight_grams: packageWeightGrams > 0 ? packageWeightGrams : null,
            calories_per_100g: effectiveBaseCalories,
            protein_per_100g: rawProtein,
            fat_per_100g: rawFat,
            carbs_per_100g: rawCarbs,
            category: manualBarcode.trim() ? 'Штрихкоды' : 'Мои продукты',
            share_to_catalog: Boolean(manualFromOcr && manualBarcode.trim()),
          })
          setRecentRefreshTrigger((prev) => prev + 1)
        } catch (catalogErr) {
          console.warn('Could not save custom product to catalog:', catalogErr)
        }
      }

      // 2. Add the actual eaten portion to the meal diary
      await addMeal({
        name: displayMealName,
        calories: finalPortionCalories,
        protein: finalPortionProtein,
        fat: finalPortionFat,
        carbs: finalPortionCarbs,
        weight_grams: portionWeightGrams > 0 ? Math.round(portionWeightGrams) : undefined,
        meal_time: manualForm.meal_time || addMealPresetTime || new Date().toTimeString().slice(0, 5),
        meal_date: selectedDate,
        is_manually_edited: true,
      })

      addToast(
        manualBarcode.trim()
          ? `Товар сохранён по штрихкоду и добавлен в дневник (${finalPortionCalories} ккал)`
          : `Добавлено в дневник: ${displayMealName} (${finalPortionCalories} ккал)`,
        'success'
      )
      closeAddMeal()
    } catch {
      addToast('Ошибка сохранения', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSelectProduct = async (
    productData: {
      name: string
      calories: number
      protein: number
      fat: number
      carbs: number
      weight_grams: number
    },
    keepOpen = false
  ) => {
    try {
      await addMeal({
        ...productData,
        meal_time: addMealPresetTime || new Date().toTimeString().slice(0, 5),
        meal_date: selectedDate,
        is_manually_edited: false,
      })
      addToast(`Добавлено: ${productData.name}`, 'success')
      if (!keepOpen) {
        closeAddMeal()
      }
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
        meal_time: addMealPresetTime || new Date().toTimeString().slice(0, 5),
        meal_date: selectedDate,
        is_manually_edited: false,
      })
      addToast(`Рецепт добавлен: ${recipeData.name}`, 'success')
      closeAddMeal()
    } catch {
      addToast('Ошибка добавления рецепта', 'error')
    }
  }

  const handleOpenCamera = async () => {
    if (isNativeApp()) {
      try {
        const file = await pickImageNative('camera')
        if (file) setSelectedPhoto(file)
      } catch {
        addToast('Разрешите доступ к камере в настройках приложения', 'error')
      }
      return
    }
    cameraInputRef.current?.click()
  }

  const handleOpenGallery = async () => {
    if (isNativeApp()) {
      try {
        const file = await pickImageNative('gallery')
        if (file) setSelectedPhoto(file)
      } catch {
        addToast('Не удалось открыть галерею', 'error')
      }
      return
    }
    galleryInputRef.current?.click()
  }

  // Titles for sub-views
  const modeTitles: Record<ModalMode, string> = {
    hub: 'Добавить еду',
    barcode: 'Сканер штрихкодов',
    ai_photo: 'Распознавание по фото',
    text_ai: 'Описание еды текстом',
    voice_ai: 'Голос AI',
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
        <div key={mode} className="min-h-[420px] flex flex-col modal-subview-in">
        {/* Back navigation header when inside a submode */}
        {mode !== 'hub' && (
          <div className="mb-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  if (isRecording) {
                    cancelVoiceRecording()
                  }
                  setMode('hub')
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white hover:text-[#E4E4E7] transition-colors cursor-pointer py-1.5 px-3 rounded-full bg-[#1A1A1D] hover:bg-[#2A2A2F]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Все способы</span>
              </button>
              <span className="font-ndot text-[11px] uppercase text-[#7A7A82]">{modeTitles[mode]}</span>
            </div>
            <div className="nothing-dotted-divider" />
          </div>
        )}

        {/* ======================================================== */}
        {/* MODE: NOTHING X BENTO HUB                                */}
        {/* ======================================================== */}
        {mode === 'hub' && (
          <div className="space-y-4">
            {/* 1. Omni Search Pill */}
            <button
              type="button"
              onClick={() => setMode('search')}
              className="w-full flex items-center justify-between px-4 py-3 rounded-full bg-[#1A1A1D] hover:bg-[#222226] transition-colors cursor-pointer group text-left min-w-0"
            >
              <div className="flex items-center gap-2.5 text-[#8E8E96] group-hover:text-white min-w-0 flex-1 mr-2">
                <Search className="w-4 h-4 text-white shrink-0" />
                <span className="text-xs font-medium truncate">
                  Поиск в базе (156+ продуктов) и рецептах...
                </span>
              </div>
              <span className="font-ndot text-[10px] text-[#A1A1AA] bg-[#2A2A2F] px-2 py-0.5 rounded-full shrink-0">
                БАЗА
              </span>
            </button>

            {/* 2. 2×2 Nothing Bento Quick Modes */}
            <div className="space-y-2">
              <span className="text-[11px] font-medium text-[#7A7A82] block px-1">
                Быстрые способы
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                {/* AI Photo — Surgical Red Circle */}
                <button
                  type="button"
                  onClick={() => setMode('ai_photo')}
                  className="flex items-center gap-3 p-3.5 rounded-[20px] bg-[#1A1A1D] hover:bg-[#222226] active:scale-[0.98] transition-all cursor-pointer group text-left min-w-0"
                >
                  <div className="w-11 h-11 rounded-full bg-[#E02424] group-hover:bg-[#C81E1E] flex items-center justify-center text-white shrink-0 transition-colors">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm font-semibold text-white block truncate">
                      AI Фото
                    </span>
                    <span className="text-[11px] text-[#7A7A82] block truncate mt-0.5">
                      Снимок / Ctrl+V
                    </span>
                  </div>
                </button>

                {/* Barcode & Chestny ZNAK */}
                <button
                  type="button"
                  onClick={() => setMode('barcode')}
                  className="flex items-center gap-3 p-3.5 rounded-[20px] bg-[#1A1A1D] hover:bg-[#222226] active:scale-[0.98] transition-all cursor-pointer group text-left min-w-0"
                >
                  <div className="w-11 h-11 rounded-full bg-[#2A2A2F] group-hover:bg-white group-hover:text-black flex items-center justify-center text-white shrink-0 transition-colors">
                    <Barcode className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm font-semibold text-white block truncate">
                      Штрихкод
                    </span>
                    <span className="text-[11px] text-[#7A7A82] block truncate mt-0.5">
                      EAN / Знак
                    </span>
                  </div>
                </button>

                {/* Text AI */}
                <button
                  type="button"
                  onClick={() => setMode('text_ai')}
                  className="flex items-center gap-3 p-3.5 rounded-[20px] bg-[#1A1A1D] hover:bg-[#222226] active:scale-[0.98] transition-all cursor-pointer group text-left min-w-0"
                >
                  <div className="w-11 h-11 rounded-full bg-[#2A2A2F] group-hover:bg-white group-hover:text-black flex items-center justify-center text-white shrink-0 transition-colors">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm font-semibold text-white block truncate">
                      Текст AI
                    </span>
                    <span className="text-[11px] text-[#7A7A82] block truncate mt-0.5">
                      Описать словами
                    </span>
                  </div>
                </button>

                {/* Voice AI */}
                <button
                  type="button"
                  onClick={() => setMode('voice_ai')}
                  className="flex items-center gap-3 p-3.5 rounded-[20px] bg-[#1A1A1D] hover:bg-[#222226] active:scale-[0.98] transition-all cursor-pointer group text-left min-w-0"
                >
                  <div className="w-11 h-11 rounded-full bg-[#2A2A2F] group-hover:bg-white group-hover:text-black flex items-center justify-center text-white shrink-0 transition-colors">
                    <Mic className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm font-semibold text-white block truncate">
                      Голос AI
                    </span>
                    <span className="text-[11px] text-[#7A7A82] block truncate mt-0.5">
                      Надиктовать
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* 3. Recent Scanned Products Shelf */}
            <RecentScannedShelf
              refreshTrigger={recentRefreshTrigger}
              onSelectProduct={(prod) => {
                setScannedProduct(prod)
                setIsPortionModalOpen(true)
              }}
              onOpenScanner={() => setMode('barcode')}
            />

            <div className="nothing-dotted-divider" />

            {/* 4. Recipes & Manual Entry Navigation Row */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setMode('recipes')}
                className="flex items-center justify-between px-4 py-3 rounded-full bg-[#1A1A1D] hover:bg-[#222226] transition-colors cursor-pointer text-left group min-w-0"
              >
                <div className="flex items-center gap-2 min-w-0 mr-1">
                  <Star className="w-4 h-4 text-white shrink-0" />
                  <span className="text-xs font-semibold text-white truncate">
                    Мои рецепты
                  </span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#7A7A82] group-hover:text-white shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => setMode('manual')}
                className="flex items-center justify-between px-4 py-3 rounded-full bg-[#1A1A1D] hover:bg-[#222226] transition-colors cursor-pointer text-left group min-w-0"
              >
                <div className="flex items-center gap-2 min-w-0 mr-1">
                  <PenTool className="w-4 h-4 text-white shrink-0" />
                  <span className="text-xs font-semibold text-white truncate">
                    Вручную
                  </span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#7A7A82] group-hover:text-white shrink-0" />
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
            onSwitchToManual={(initialName, barcode, prefill) => {
              setManualCalcMode('per_100g')
              setManualBarcode(prefill?.barcode || barcode || '')
              setManualImageUrl(prefill?.image_url || '')
              setManualFromOcr(Boolean(prefill?.from_ocr))
              setSaveToCatalog(true)
              if (prefill) {
                const pkgW =
                  prefill.package_weight_grams && prefill.package_weight_grams > 0
                    ? Math.round(prefill.package_weight_grams)
                    : 0
                setManualBrand(prefill.brand || '')
                setManualPackageWeight(pkgW > 0 ? String(pkgW) : '')
                setManualForm((prev) => ({
                  ...prev,
                  name: prefill.name || initialName || prev.name || '',
                  calories:
                    prefill.calories_per_100g !== undefined
                      ? String(Math.round(prefill.calories_per_100g))
                      : prev.calories,
                  protein:
                    prefill.protein_per_100g !== undefined
                      ? String(Math.round(prefill.protein_per_100g * 10) / 10)
                      : prev.protein,
                  fat:
                    prefill.fat_per_100g !== undefined
                      ? String(Math.round(prefill.fat_per_100g * 10) / 10)
                      : prev.fat,
                  carbs:
                    prefill.carbs_per_100g !== undefined
                      ? String(Math.round(prefill.carbs_per_100g * 10) / 10)
                      : prev.carbs,
                  weight_grams: pkgW > 0 ? String(pkgW) : prev.weight_grams || '100',
                }))
              } else {
                setManualForm((prev) => ({
                  ...prev,
                  name: initialName || prev.name || '',
                  weight_grams: prev.weight_grams || '100',
                }))
              }
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
                    onClick={handleOpenCamera}
                    className="flex flex-col items-center justify-center p-5 rounded-[20px] bg-[#1A1A1D] hover:bg-[#222226] transition-all cursor-pointer group active:scale-[0.98]"
                  >
                    <div className="w-12 h-12 rounded-full bg-[#E02424] flex items-center justify-center text-white mb-2.5">
                      <Camera className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-semibold text-white">Камера</span>
                    <span className="text-[11px] text-[#7A7A82] mt-0.5">
                      Сделать снимок
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenGallery}
                    className="flex flex-col items-center justify-center p-5 rounded-[20px] bg-[#1A1A1D] hover:bg-[#222226] transition-all cursor-pointer group active:scale-[0.98]"
                  >
                    <div className="w-12 h-12 rounded-full bg-[#2A2A2F] group-hover:bg-white group-hover:text-black flex items-center justify-center text-white mb-2.5 transition-colors">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-semibold text-white">Галерея</span>
                    <span className="text-[11px] text-[#7A7A82] mt-0.5">
                      Выбрать файл
                    </span>
                  </button>
                </div>

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={handleOpenGallery}
                  className={`border border-dashed rounded-[20px] p-4 text-center transition-all flex flex-col items-center justify-center gap-2 cursor-pointer ${
                    isDragging
                      ? 'border-white bg-white/10'
                      : 'border-white/[0.14] bg-[#161619] hover:bg-[#1A1A1D]'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-[#2A2A2F] flex items-center justify-center text-white">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-white my-0">
                      Перетащите фото сюда или вставьте (Ctrl+V)
                    </p>
                    <p className="text-[11px] text-[#7A7A82] mt-0.5 my-0">
                      Скриншоты доставок, чеки, тарелки
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative rounded-[20px] overflow-hidden border bg-black aspect-video max-h-52 flex items-center justify-center transition-all ${
                  isDragging ? 'border-white' : 'border-white/[0.1]'
                }`}
              >
                <img
                  src={photoPreview}
                  alt="Предпросмотр"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2.5 left-2.5 bg-black/80 text-white text-[11px] font-ndot font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E02424]" />
                  <span>ГОТОВО</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPhoto(null)
                    setPhotoPreview(null)
                  }}
                  className="absolute top-2.5 right-2.5 p-1.5 bg-black/80 hover:bg-black text-white rounded-full transition-colors cursor-pointer"
                  title="Удалить фото"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#A1A1AA] block">
                Пояснение к фото (опционально)
              </label>
              <input
                ref={aiCommentRef}
                type="text"
                placeholder='Например: "Гречка с курицей, около 300г"'
                value={aiComment}
                onChange={(e) => setAiComment(e.target.value)}
                autoCapitalize="sentences"
                autoCorrect="on"
                spellCheck={true}
                className="w-full bg-[#1A1A1D] border border-white/[0.08] rounded-2xl px-3.5 py-2.5 text-sm text-white placeholder-[#6E6E75] outline-none focus:border-white/40"
              />
            </div>

            <Button
              className="w-full"
              size="lg"
              disabled={!selectedPhoto}
              onClick={handleRecognizePhoto}
              leftIcon={<Sparkles className="w-4 h-4" />}
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
                <label className="text-xs font-medium text-[#A1A1AA] block">
                  Опишите, что вы съели
                </label>
                <span className="font-ndot text-[10px] text-[#7A7A82]">AI КБЖУ</span>
              </div>
              <textarea
                ref={textDescriptionRef}
                rows={4}
                placeholder="Например: Овсянка 200г на молоке с бананом и ложкой мёда, плюс кофе с молоком"
                value={textDescription}
                onChange={(e) => setTextDescription(e.target.value)}
                autoCapitalize="sentences"
                autoCorrect="on"
                spellCheck={true}
                className="w-full bg-[#1A1A1D] border border-white/[0.08] rounded-[20px] px-3.5 py-3 text-sm text-white placeholder-[#6E6E75] outline-none focus:border-white/40 resize-none transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] text-[#7A7A82] font-medium block">
                Быстрые примеры
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
                    className="text-[11px] text-[#A1A1AA] hover:text-black bg-[#1A1A1D] hover:bg-white px-3 py-1.5 rounded-full transition-colors cursor-pointer text-left"
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
              leftIcon={<Sparkles className="w-4 h-4" />}
            >
              Рассчитать через AI
            </Button>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODE: VOICE AI                                           */}
        {/* ======================================================== */}
        {mode === 'voice_ai' && (
          <div className="space-y-4 py-2 text-center">
            <div className="flex flex-col items-center justify-center p-6 rounded-[24px] bg-[#1A1A1D] space-y-4">
              <div className="relative">
                {isRecording && (
                  <span className="absolute -inset-3 rounded-full bg-[#E02424]/25 animate-ping" />
                )}
                <button
                  type="button"
                  onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                  className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                    isRecording
                      ? 'bg-[#E02424] hover:bg-[#C81E1E] text-white scale-105'
                      : 'bg-[#E02424] hover:bg-[#C81E1E] text-white hover:scale-105'
                  }`}
                  title={isRecording ? 'Остановить запись' : 'Начать запись'}
                >
                  {isRecording ? (
                    <Square className="w-7 h-7 fill-white" />
                  ) : (
                    <Mic className="w-8 h-8" />
                  )}
                </button>
              </div>

              <div>
                <p className="text-sm font-semibold text-white my-0">
                  {isRecording ? 'Идёт запись голоса' : 'Нажмите на микрофон для записи'}
                </p>
                {isRecording ? (
                  <div className="flex items-center justify-center gap-2 mt-2 text-[#E02424] font-ndot text-lg font-bold">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#E02424] animate-pulse" />
                    <span>00:{String(recordingSeconds).padStart(2, '0')}</span>
                  </div>
                ) : (
                  <span className="text-xs text-[#7A7A82] block mt-1">
                    Продиктуйте блюдо и нажмите ещё раз для отправки
                  </span>
                )}
              </div>

              {isRecording && (
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={stopVoiceRecording}
                    leftIcon={<Square className="w-3.5 h-3.5 fill-black" />}
                  >
                    Отправить в AI
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={cancelVoiceRecording}
                  >
                    Отмена
                  </Button>
                </div>
              )}
            </div>

            <div className="bg-[#1A1A1D] rounded-[18px] p-3.5 text-left">
              <p className="text-xs text-[#A1A1AA] leading-relaxed my-0">
                <span className="text-white font-semibold">Подсказка:</span> Скажите, что вы съели (например: <i>«Тарелка борща 350г со сметаной и два куска хлеба»</i>). Нейросеть расшифрует речь и посчитает КБЖУ.
              </p>
            </div>
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
        {/* MODE: MANUAL ENTRY (REDESIGNED SMART 100G + PORTION UX)  */}
        {/* ======================================================== */}
        {mode === 'manual' && (
          <form onSubmit={handleManualSubmit} className="space-y-4">
            {/* 1. Calculation Mode Switcher */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-[#1A1A1D]">
                <button
                  type="button"
                  onClick={() => {
                    setManualCalcMode('per_100g')
                    if (!manualForm.weight_grams || Number(manualForm.weight_grams) <= 0) {
                      setManualForm((prev) => ({ ...prev, weight_grams: '100' }))
                    }
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    manualCalcMode === 'per_100g'
                      ? 'bg-white text-black'
                      : 'text-[#8E8E96] hover:text-white'
                  }`}
                >
                  <Package className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">На 100 г</span>
                </button>
                <button
                  type="button"
                  onClick={() => setManualCalcMode('total_portion')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    manualCalcMode === 'total_portion'
                      ? 'bg-white text-black'
                      : 'text-[#8E8E96] hover:text-white'
                  }`}
                >
                  <Scale className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">За порцию</span>
                </button>
              </div>
              <p className="text-[11px] text-[#7A7A82] px-1 my-0">
                {manualCalcMode === 'per_100g'
                  ? 'Введите КБЖУ на 100 г с пачки — вес порции ниже пересчитает всё автоматически.'
                  : 'Введите итоговые КБЖУ за всё съеденное блюдо целиком.'}
              </p>
            </div>

            {manualBarcode && (
              <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-[18px] bg-[#1A1A1D] border border-white/[0.1]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[#2A2A2F] flex items-center justify-center text-white shrink-0">
                    <Barcode className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-[#A1A1AA]">Штрихкод:</span>
                      <span className="font-ndot text-xs font-bold text-white truncate">
                        {manualBarcode}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#7A7A82] block truncate">
                      Сохранится в базе и «Недавно отсканированных»
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setManualBarcode('')}
                  className="p-1.5 text-[#7A7A82] hover:text-white rounded-full hover:bg-[#2A2A2F] transition-colors cursor-pointer shrink-0"
                  title="Отвязать штрихкод"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {manualCalcMode === 'per_100g' && (
              <div className="flex items-center justify-between gap-2.5 px-3.5 py-3 rounded-[20px] bg-[#1A1A1D]">
                <input
                  type="file"
                  accept="image/*"
                  ref={manualLabelInputRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleScanManualLabelFile(file)
                    e.target.value = ''
                  }}
                  className="hidden"
                />
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#E02424] flex items-center justify-center text-white shrink-0">
                    <ScanLine className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-white block truncate">
                      Сканировать этикетку
                    </span>
                    <span className="text-[11px] text-[#7A7A82] block truncate">
                      AI перенесёт КБЖУ с фото пачки
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  isLoading={isScanningManualLabel}
                  onClick={handleTriggerManualLabelScan}
                  className="shrink-0 text-xs"
                >
                  Фото
                </Button>
              </div>
            )}

            {/* 2. Product Name + Optional Brand & Package Weight */}
            <div className="p-3.5 rounded-[20px] bg-[#1A1A1D] space-y-3">
              <div>
                <label className="text-xs font-medium text-[#A1A1AA] block mb-1.5">
                  Название продукта или блюда <span className="text-[#E02424]">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Например: Творог 5%, Греческий йогурт"
                  value={manualForm.name}
                  onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                  required
                  autoFocus
                  className="w-full bg-[#111113] border border-white/[0.08] focus:border-white/40 rounded-2xl px-3.5 py-2.5 text-sm text-white placeholder-[#6E6E75] outline-none transition-colors"
                />
              </div>

              {manualCalcMode === 'per_100g' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-medium text-[#7A7A82]">
                        Вес пачки (г)
                      </label>
                      {packageWeightGrams > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setManualForm((prev) => ({
                              ...prev,
                              weight_grams: String(Math.round(packageWeightGrams)),
                            }))
                          }
                          className="font-ndot text-[10px] font-bold text-white hover:underline cursor-pointer"
                        >
                          ={Math.round(packageWeightGrams)}г
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      placeholder="Напр: 180"
                      value={manualPackageWeight}
                      onChange={(e) => {
                        const val = e.target.value
                        setManualPackageWeight(val)
                        const parsedPkg = parseNumericInput(val)
                        if (parsedPkg > 0 && manualForm.weight_grams === '100') {
                          setManualForm((prev) => ({
                            ...prev,
                            weight_grams: String(Math.round(parsedPkg)),
                          }))
                        }
                      }}
                      className="w-full bg-[#111113] border border-white/[0.08] focus:border-white/40 rounded-xl px-3 py-2 text-xs text-white placeholder-[#6E6E75] outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-[#7A7A82] block mb-1">
                      Бренд (опц.)
                    </label>
                    <input
                      type="text"
                      placeholder="Напр: Савушкин"
                      value={manualBrand}
                      onChange={(e) => setManualBrand(e.target.value)}
                      className="w-full bg-[#111113] border border-white/[0.08] focus:border-white/40 rounded-xl px-3 py-2 text-xs text-white placeholder-[#6E6E75] outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. Nutrition Facts Input */}
            <div className="p-3.5 rounded-[20px] bg-[#1A1A1D] space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-[#E02424] shrink-0" />
                  <span className="text-xs font-semibold text-white">
                    {manualCalcMode === 'per_100g' ? 'КБЖУ на 100 г' : 'КБЖУ за порцию'}
                  </span>
                </div>
                {hasMacroValues && macroCalculatedCalories > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setManualForm((prev) => ({
                        ...prev,
                        calories: String(macroCalculatedCalories),
                      }))
                    }
                    className="inline-flex items-center gap-1 font-ndot text-[11px] font-bold text-black bg-white px-2.5 py-0.5 rounded-full cursor-pointer"
                  >
                    <Calculator className="w-3 h-3" />
                    <span>Авто: {macroCalculatedCalories}</span>
                  </button>
                )}
              </div>

              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder={
                    hasMacroValues && macroCalculatedCalories > 0
                      ? `${macroCalculatedCalories}`
                      : 'Калории, напр. 120'
                  }
                  value={manualForm.calories}
                  onChange={(e) => setManualForm({ ...manualForm, calories: e.target.value })}
                  className="w-full bg-[#111113] border border-white/[0.08] focus:border-white/40 rounded-2xl pl-3.5 pr-24 py-2.5 font-ndot text-base font-bold text-white placeholder-[#6E6E75] outline-none"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-[#7A7A82] pointer-events-none">
                  {manualCalcMode === 'per_100g' ? 'ккал / 100г' : 'ккал'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'protein' as const, label: 'Белки', dot: 'bg-white' },
                  { key: 'fat' as const, label: 'Жиры', dot: 'bg-[#A1A1AA]' },
                  { key: 'carbs' as const, label: 'Углеводы', dot: 'bg-[#6E6E75]' },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="text-[11px] font-medium text-[#A1A1AA] flex items-center gap-1.5 mb-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${f.dot}`} />
                      {f.label}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="0"
                        value={manualForm[f.key]}
                        onChange={(e) => setManualForm({ ...manualForm, [f.key]: e.target.value })}
                        className="w-full bg-[#111113] border border-white/[0.08] focus:border-white/40 rounded-xl pl-3 pr-6 py-2 font-ndot text-sm font-bold text-white placeholder-[#6E6E75] outline-none"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[#6E6E75] pointer-events-none">
                        г
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Portion Weight Selector */}
            <div className="p-3.5 rounded-[20px] bg-[#1A1A1D] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-[#A1A1AA]" />
                  <span>{manualCalcMode === 'per_100g' ? 'Вес порции' : 'Вес (опц.)'}</span>
                </span>
                <span className="font-ndot text-sm font-bold text-white">
                  {portionWeightGrams > 0 ? `${Math.round(portionWeightGrams)} г` : '—'}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleAdjustPortionWeight(-50)}
                  className="px-2.5 py-2 rounded-full bg-[#2A2A2F] hover:bg-[#34343B] text-white font-ndot text-xs font-bold cursor-pointer active:scale-95 shrink-0"
                >
                  -50
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjustPortionWeight(-10)}
                  className="w-9 h-9 rounded-full bg-[#2A2A2F] hover:bg-[#34343B] text-white flex items-center justify-center cursor-pointer active:scale-95 shrink-0"
                  title="-10 г"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>

                <div className="relative flex-1 min-w-0">
                  <input
                    type="number"
                    min="1"
                    step="any"
                    placeholder="100"
                    value={manualForm.weight_grams}
                    onChange={(e) => setManualForm({ ...manualForm, weight_grams: e.target.value })}
                    className="w-full bg-[#111113] border border-white/[0.14] focus:border-white rounded-full px-3 py-2 text-center font-ndot text-base font-bold text-white outline-none"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-[#7A7A82] pointer-events-none">
                    г
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleAdjustPortionWeight(10)}
                  className="w-9 h-9 rounded-full bg-[#2A2A2F] hover:bg-[#34343B] text-white flex items-center justify-center cursor-pointer active:scale-95 shrink-0"
                  title="+10 г"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjustPortionWeight(50)}
                  className="px-2.5 py-2 rounded-full bg-[#2A2A2F] hover:bg-[#34343B] text-white font-ndot text-xs font-bold cursor-pointer active:scale-95 shrink-0"
                >
                  +50
                </button>
              </div>

              {manualCalcMode === 'per_100g' && packageWeightGrams > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: '¼', mult: 0.25 },
                    { label: '⅓', mult: 1 / 3 },
                    { label: '½', mult: 0.5 },
                    { label: 'Вся пачка', mult: 1 },
                    { label: '×1.5', mult: 1.5 },
                    { label: '×2', mult: 2 },
                  ].map(({ label, mult }) => {
                    const targetWeight = Math.round(packageWeightGrams * mult)
                    const isSelected = Math.round(portionWeightGrams) === targetWeight
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() =>
                          setManualForm((prev) => ({
                            ...prev,
                            weight_grams: String(targetWeight),
                          }))
                        }
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-white text-black'
                            : 'bg-[#111113] text-[#A1A1AA] hover:text-white'
                        }`}
                      >
                        {label} ({targetWeight}г)
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {PORTION_PRESETS.map((grams) => {
                  const isSelected = Math.round(portionWeightGrams) === grams
                  return (
                    <button
                      key={grams}
                      type="button"
                      onClick={() =>
                        setManualForm((prev) => ({ ...prev, weight_grams: String(grams) }))
                      }
                      className={`font-ndot px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-white text-black'
                          : 'bg-[#111113] text-[#8E8E96] hover:text-white'
                      }`}
                    >
                      {grams}г
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 5. Live Total Preview */}
            <div className="p-3.5 rounded-[20px] bg-[#1A1A1D] space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#A1A1AA] font-medium">
                  Итого {portionWeightGrams > 0 ? `(${Math.round(portionWeightGrams)} г)` : ''}
                </span>
                <span className="font-ndot text-lg font-bold text-[#E02424]">
                  {finalPortionCalories}{' '}
                  <span className="font-sans text-[11px] font-normal text-[#7A7A82]">ккал</span>
                </span>
              </div>
              <div className="nothing-dotted-divider" />
              <div className="grid grid-cols-3 gap-2 text-center font-ndot text-xs">
                <div>
                  <span className="font-sans text-[10px] text-[#7A7A82] block">Белки</span>
                  <span className="font-bold text-white">{finalPortionProtein}г</span>
                </div>
                <div>
                  <span className="font-sans text-[10px] text-[#7A7A82] block">Жиры</span>
                  <span className="font-bold text-[#D4D4D8]">{finalPortionFat}г</span>
                </div>
                <div>
                  <span className="font-sans text-[10px] text-[#7A7A82] block">Углеводы</span>
                  <span className="font-bold text-[#A1A1AA]">{finalPortionCarbs}г</span>
                </div>
              </div>
            </div>

            {/* 6. Save to Catalog + Time */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              {manualCalcMode === 'per_100g' ? (
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={saveToCatalog}
                    onClick={() => setSaveToCatalog((prev) => !prev)}
                    className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors cursor-pointer shrink-0 ${
                      saveToCatalog
                        ? 'bg-white border-white text-black'
                        : 'bg-[#1A1A1D] border-white/20 text-transparent'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </button>
                  <span className="text-xs text-[#A1A1AA] group-hover:text-white transition-colors">
                    {manualBarcode ? 'Сохранить за штрихкодом' : 'Сохранить в мою базу'}
                  </span>
                </label>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2 shrink-0">
                <Clock className="w-3.5 h-3.5 text-[#7A7A82]" />
                <input
                  type="time"
                  value={manualForm.meal_time}
                  onChange={(e) => setManualForm({ ...manualForm, meal_time: e.target.value })}
                  className="bg-[#1A1A1D] border border-white/[0.08] focus:border-white/40 rounded-full px-3 py-1 font-ndot text-xs font-bold text-white outline-none"
                />
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>
              {`Добавить · ${finalPortionCalories} ккал`}
            </Button>
          </form>
        )}
        </div>
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
