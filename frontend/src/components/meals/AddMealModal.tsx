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
  const { isAddMealOpen, closeAddMeal, addToast, addMealPresetTime } = useUIStore()
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
      setIsRecording(false)
      setRecordingSeconds(0)
      setManualCalcMode('per_100g')
      setManualBarcode('')
      setManualBrand('')
      setManualPackageWeight('')
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
  }, [isAddMealOpen, addMealPresetTime, cancelVoiceRecording])

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

    const photoToUpload = selectedPhoto
    const commentToSend = aiComment.trim() || undefined

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
    const trimmed = textDescription.trim()
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
      const res = await barcodeApi.scanImage(file)
      if (res.product) {
        const p = res.product
        setManualCalcMode('per_100g')
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
            package_weight_grams: packageWeightGrams > 0 ? packageWeightGrams : null,
            calories_per_100g: effectiveBaseCalories,
            protein_per_100g: rawProtein,
            fat_per_100g: rawFat,
            carbs_per_100g: rawCarbs,
            category: manualBarcode.trim() ? 'Штрихкоды' : 'Мои продукты',
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
        <div className="min-h-[420px] flex flex-col">
        {/* Back navigation header when inside a submode */}
        {mode !== 'hub' && (
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral-800/80">
            <button
              type="button"
              onClick={() => {
                if (isRecording) {
                  cancelVoiceRecording()
                }
                setMode('hub')
              }}
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                {/* AI Photo */}
                <button
                  type="button"
                  onClick={() => setMode('ai_photo')}
                  className="relative flex flex-col items-center justify-center p-3.5 sm:p-4 rounded-2xl bg-gradient-to-b from-[#1c1d24] to-[#121317] border border-neutral-800/90 hover:border-emerald-500/50 hover:bg-[#1f2029] active:scale-[0.97] transition-all duration-200 cursor-pointer group text-center min-w-0 shadow-[0_4px_16px_rgba(0,0,0,0.25)] hover:shadow-[0_8px_24px_rgba(16,185,129,0.12)] overflow-hidden"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-emerald-500/5 border border-emerald-500/30 group-hover:border-emerald-400/60 shadow-[0_0_15px_rgba(16,185,129,0.12)] group-hover:shadow-[0_0_22px_rgba(16,185,129,0.28)] flex items-center justify-center mb-2.5 shrink-0 transition-all duration-300 group-hover:scale-105">
                    <Camera className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-400 group-hover:text-emerald-300 stroke-[2.2] transition-colors" />
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-white tracking-tight leading-tight truncate max-w-full">
                    AI Фото
                  </span>
                  <span className="text-[10.5px] sm:text-xs text-neutral-400 group-hover:text-neutral-300 font-medium mt-1 truncate max-w-full">
                    Снимок / Ctrl+V
                  </span>
                </button>

                {/* Barcode & Chestny ZNAK */}
                <button
                  type="button"
                  onClick={() => setMode('barcode')}
                  className="relative flex flex-col items-center justify-center p-3.5 sm:p-4 rounded-2xl bg-gradient-to-b from-[#1c1d24] to-[#121317] border border-neutral-800/90 hover:border-emerald-500/50 hover:bg-[#1f2029] active:scale-[0.97] transition-all duration-200 cursor-pointer group text-center min-w-0 shadow-[0_4px_16px_rgba(0,0,0,0.25)] hover:shadow-[0_8px_24px_rgba(16,185,129,0.12)] overflow-hidden"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-emerald-500/5 border border-emerald-500/30 group-hover:border-emerald-400/60 shadow-[0_0_15px_rgba(16,185,129,0.12)] group-hover:shadow-[0_0_22px_rgba(16,185,129,0.28)] flex items-center justify-center mb-2.5 shrink-0 transition-all duration-300 group-hover:scale-105">
                    <Barcode className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-400 group-hover:text-emerald-300 stroke-[2.2] transition-colors" />
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-white tracking-tight leading-tight truncate max-w-full">
                    Штрихкод
                  </span>
                  <span className="text-[10.5px] sm:text-xs text-neutral-400 group-hover:text-neutral-300 font-medium mt-1 truncate max-w-full">
                    EAN / Честный Знак
                  </span>
                </button>

                {/* Text AI */}
                <button
                  type="button"
                  onClick={() => setMode('text_ai')}
                  className="relative flex flex-col items-center justify-center p-3.5 sm:p-4 rounded-2xl bg-gradient-to-b from-[#1c1d24] to-[#121317] border border-neutral-800/90 hover:border-emerald-500/50 hover:bg-[#1f2029] active:scale-[0.97] transition-all duration-200 cursor-pointer group text-center min-w-0 shadow-[0_4px_16px_rgba(0,0,0,0.25)] hover:shadow-[0_8px_24px_rgba(16,185,129,0.12)] overflow-hidden"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-emerald-500/5 border border-emerald-500/30 group-hover:border-emerald-400/60 shadow-[0_0_15px_rgba(16,185,129,0.12)] group-hover:shadow-[0_0_22px_rgba(16,185,129,0.28)] flex items-center justify-center mb-2.5 shrink-0 transition-all duration-300 group-hover:scale-105">
                    <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-400 group-hover:text-emerald-300 stroke-[2.2] transition-colors" />
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-white tracking-tight leading-tight truncate max-w-full">
                    Текст AI
                  </span>
                  <span className="text-[10.5px] sm:text-xs text-neutral-400 group-hover:text-neutral-300 font-medium mt-1 truncate max-w-full">
                    Описать текстом
                  </span>
                </button>

                {/* Voice AI */}
                <button
                  type="button"
                  onClick={() => setMode('voice_ai')}
                  className="relative flex flex-col items-center justify-center p-3.5 sm:p-4 rounded-2xl bg-gradient-to-b from-[#1c1d24] to-[#121317] border border-neutral-800/90 hover:border-emerald-500/50 hover:bg-[#1f2029] active:scale-[0.97] transition-all duration-200 cursor-pointer group text-center min-w-0 shadow-[0_4px_16px_rgba(0,0,0,0.25)] hover:shadow-[0_8px_24px_rgba(16,185,129,0.12)] overflow-hidden"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-emerald-500/5 border border-emerald-500/30 group-hover:border-emerald-400/60 shadow-[0_0_15px_rgba(16,185,129,0.12)] group-hover:shadow-[0_0_22px_rgba(16,185,129,0.28)] flex items-center justify-center mb-2.5 shrink-0 transition-all duration-300 group-hover:scale-105">
                    <Mic className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-400 group-hover:text-emerald-300 stroke-[2.2] transition-colors" />
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-white tracking-tight leading-tight truncate max-w-full">
                    Голос AI
                  </span>
                  <span className="text-[10.5px] sm:text-xs text-neutral-400 group-hover:text-neutral-300 font-medium mt-1 truncate max-w-full">
                    Сказать голосом
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
            onSwitchToManual={(initialName, barcode, prefill) => {
              setManualCalcMode('per_100g')
              setManualBarcode(prefill?.barcode || barcode || '')
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
                    onClick={handleOpenGallery}
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
                  onClick={handleOpenGallery}
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
        {/* MODE: VOICE AI                                           */}
        {/* ======================================================== */}
        {mode === 'voice_ai' && (
          <div className="space-y-4 py-2 text-center">
            <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-[#18181c] border border-neutral-800 space-y-4">
              <div className="relative">
                {isRecording && (
                  <span className="absolute -inset-3 rounded-full bg-red-500/20 animate-ping" />
                )}
                <button
                  type="button"
                  onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                  className={`relative w-20 h-20 rounded-full flex items-center justify-center text-white transition-all shadow-lg cursor-pointer ${
                    isRecording
                      ? 'bg-red-500 hover:bg-red-600 shadow-red-500/40 scale-105'
                      : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/30 hover:scale-105'
                  }`}
                  title={isRecording ? 'Остановить запись' : 'Начать запись'}
                >
                  {isRecording ? (
                    <Square className="w-8 h-8 fill-white" />
                  ) : (
                    <Mic className="w-9 h-9" />
                  )}
                </button>
              </div>

              <div>
                <p className="text-sm font-bold text-white my-0">
                  {isRecording ? 'Идёт запись голоса...' : 'Нажмите на микрофон для записи'}
                </p>
                {isRecording ? (
                  <div className="flex items-center justify-center gap-2 mt-2 text-red-400 font-mono text-sm font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    <span>00:{String(recordingSeconds).padStart(2, '0')}</span>
                  </div>
                ) : (
                  <span className="text-xs text-neutral-400 block mt-1">
                    Нажмите кнопку, продиктуйте блюдо и нажмите ещё раз
                  </span>
                )}
              </div>

              {isRecording && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    size="md"
                    onClick={stopVoiceRecording}
                    leftIcon={<Square className="w-4 h-4 fill-white" />}
                  >
                    Завершить и отправить в AI
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={cancelVoiceRecording}
                  >
                    Отмена
                  </Button>
                </div>
              )}
            </div>

            <div className="bg-[#141417] border border-neutral-800/80 rounded-xl p-3 text-left">
              <p className="text-xs text-neutral-400 leading-relaxed my-0">
                <b>Подсказка:</b> Скажите, что вы съели (например: <i>«Тарелка борща 350г со сметаной и два куска хлеба»</i>). Нейросеть расшифрует вашу речь, поместит расшифровку в описание продукта для удобного редактирования и посчитает КБЖУ.
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
            {/* 1. Calculation Mode Switcher: Per 100g (from package) vs Total Portion */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[#131317] border border-neutral-800/90">
                <button
                  type="button"
                  onClick={() => {
                    setManualCalcMode('per_100g')
                    if (!manualForm.weight_grams || Number(manualForm.weight_grams) <= 0) {
                      setManualForm((prev) => ({ ...prev, weight_grams: '100' }))
                    }
                  }}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    manualCalcMode === 'per_100g'
                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
                  }`}
                >
                  <Package className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">На 100 г (с упаковки)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setManualCalcMode('total_portion')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    manualCalcMode === 'total_portion'
                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
                  }`}
                >
                  <Scale className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">За всю порцию</span>
                </button>
              </div>
              <p className="text-[11px] text-neutral-400 px-1 my-0">
                {manualCalcMode === 'per_100g'
                  ? 'Вводите КБЖУ на 100 г как написано на пачке, а ниже укажите вес вашей порции — всё пересчитается автоматически.'
                  : 'Вводите уже готовые итоговые КБЖУ за всё съеденное блюдо целиком.'}
              </p>
            </div>

            {/* Scanned Barcode Badge (if switched from barcode scanner) */}
            {manualBarcode && (
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                    <Barcode className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-emerald-300">
                        Привязан штрихкод:
                      </span>
                      <span className="text-xs font-mono font-bold text-white truncate">
                        {manualBarcode}
                      </span>
                    </div>
                    <span className="text-[10px] text-neutral-300 block truncate">
                      Товар сохранится в базе и появится в «Недавно отсканированных»
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setManualBarcode('')}
                  className="p-1 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800/60 transition-colors cursor-pointer shrink-0"
                  title="Отвязать штрихкод"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Quick AI Label OCR Autofill Banner (for Per 100g mode) */}
            {manualCalcMode === 'per_100g' && (
              <div className="flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-950/35 via-[#161a1d] to-[#16161c] border border-emerald-500/25">
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
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <ScanLine className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-white block truncate">
                      Лень вводить цифры с пачки?
                    </span>
                    <span className="text-[10.5px] text-neutral-400 block truncate">
                      AI сам перенесёт КБЖУ на 100 г и вес с фото этикетки
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  isLoading={isScanningManualLabel}
                  onClick={handleTriggerManualLabelScan}
                  className="shrink-0 text-xs border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15"
                >
                  Сфотографировать
                </Button>
              </div>
            )}

            {/* 2. Product Name + Optional Brand & Package Weight */}
            <div className="p-3.5 rounded-2xl bg-[#16161b] border border-neutral-800/90 space-y-3">
              <div>
                <label className="text-xs font-semibold text-neutral-200 block mb-1.5">
                  Название продукта или блюда <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Например: Творог 5%, Греческий йогурт, Протеиновый батончик"
                  value={manualForm.name}
                  onChange={(e) =>
                    setManualForm({ ...manualForm, name: e.target.value })
                  }
                  required
                  autoFocus
                  className="w-full bg-[#111115] border border-neutral-700/80 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 outline-none transition-colors"
                />
              </div>

              {manualCalcMode === 'per_100g' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-medium text-neutral-400">
                        Вес всей пачки / штуки (г)
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
                          className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer"
                        >
                          = Вся пачка ({Math.round(packageWeightGrams)}г)
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      placeholder="Напр: 140, 180, 250 (опц.)"
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
                      className="w-full bg-[#111115] border border-neutral-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none transition-colors"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-neutral-400 block mb-1">
                      Бренд / Производитель (опц.)
                    </label>
                    <input
                      type="text"
                      placeholder="Напр: Савушкин, ВкусВилл"
                      value={manualBrand}
                      onChange={(e) => setManualBrand(e.target.value)}
                      className="w-full bg-[#111115] border border-neutral-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none transition-colors"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. Nutrition Facts Input Block (Per 100g or Per Portion) */}
            <div className="p-3.5 rounded-2xl bg-[#16161b] border border-neutral-800/90 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-bold text-white">
                    {manualCalcMode === 'per_100g'
                      ? 'Пищевая ценность на 100 г (с упаковки)'
                      : 'Пищевая ценность за всю порцию'}
                  </span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {manualCalcMode === 'per_100g' ? 'НА 100 ГРАММ' : 'ЗА ПОРЦИЮ'}
                </span>
              </div>

              {/* Calories Input + Auto-calc from Macros Helper */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-xs font-medium text-neutral-300">
                    Калорийность ({manualCalcMode === 'per_100g' ? 'ккал на 100 г' : 'ккал всего'}) *
                  </label>
                  {hasMacroValues && macroCalculatedCalories > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setManualForm((prev) => ({
                          ...prev,
                          calories: String(macroCalculatedCalories),
                        }))
                      }
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                      title="Рассчитать по формуле: 4 × Белки + 9 × Жиры + 4 × Углеводы"
                    >
                      <Calculator className="w-3 h-3" />
                      <span>Авто по БЖУ: {macroCalculatedCalories} ккал</span>
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
                        ? `${macroCalculatedCalories} (рассчитано по БЖУ)`
                        : 'Например: 120'
                    }
                    value={manualForm.calories}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, calories: e.target.value })
                    }
                    className="w-full bg-[#111115] border border-neutral-700/80 focus:border-emerald-500 rounded-xl pl-3.5 pr-20 py-2.5 text-sm font-bold text-white placeholder-neutral-500 outline-none transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-neutral-400 pointer-events-none">
                    {manualCalcMode === 'per_100g' ? 'ккал / 100г' : 'ккал'}
                  </span>
                </div>
              </div>

              {/* Macros Grid: Protein, Fat, Carbs */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[11px] font-semibold text-blue-400 block mb-1">
                    Белки {manualCalcMode === 'per_100g' ? '(на 100г)' : '(г)'}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0"
                      value={manualForm.protein}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, protein: e.target.value })
                      }
                      className="w-full bg-[#111115] border border-neutral-800 focus:border-blue-500 rounded-xl pl-3 pr-7 py-2 text-sm font-semibold text-white placeholder-neutral-500 outline-none transition-colors"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-neutral-500 pointer-events-none">
                      г
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-amber-400 block mb-1">
                    Жиры {manualCalcMode === 'per_100g' ? '(на 100г)' : '(г)'}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0"
                      value={manualForm.fat}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, fat: e.target.value })
                      }
                      className="w-full bg-[#111115] border border-neutral-800 focus:border-amber-500 rounded-xl pl-3 pr-7 py-2 text-sm font-semibold text-white placeholder-neutral-500 outline-none transition-colors"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-neutral-500 pointer-events-none">
                      г
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-purple-400 block mb-1">
                    Углеводы {manualCalcMode === 'per_100g' ? '(на 100г)' : '(г)'}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0"
                      value={manualForm.carbs}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, carbs: e.target.value })
                      }
                      className="w-full bg-[#111115] border border-neutral-800 focus:border-purple-500 rounded-xl pl-3 pr-7 py-2 text-sm font-semibold text-white placeholder-neutral-500 outline-none transition-colors"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-neutral-500 pointer-events-none">
                      г
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Portion Weight Selector Block (Especially important for Per 100g mode!) */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-b from-[#181c20] to-[#14161a] border border-emerald-500/30 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-bold text-white">
                    {manualCalcMode === 'per_100g'
                      ? 'Сколько грамм вы съели? (Вес порции)'
                      : 'Вес порции (опционально)'}
                  </span>
                </div>
                <span className="text-xs font-extrabold text-emerald-400">
                  {portionWeightGrams > 0 ? `${Math.round(portionWeightGrams)} г` : '—'}
                </span>
              </div>

              {/* Weight Input + Quick Steppers (-50, -10, +10, +50) */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleAdjustPortionWeight(-50)}
                  className="px-2.5 py-2 rounded-xl bg-neutral-800/90 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold transition-colors cursor-pointer active:scale-95 shrink-0"
                >
                  -50
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjustPortionWeight(-10)}
                  className="p-2 rounded-xl bg-neutral-800/90 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer active:scale-95 shrink-0"
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
                    onChange={(e) =>
                      setManualForm({ ...manualForm, weight_grams: e.target.value })
                    }
                    className="w-full bg-[#101215] border border-emerald-500/40 focus:border-emerald-400 rounded-xl px-3 py-2 text-center text-base font-extrabold text-white outline-none transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-emerald-400 pointer-events-none">
                    г
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleAdjustPortionWeight(10)}
                  className="p-2 rounded-xl bg-neutral-800/90 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer active:scale-95 shrink-0"
                  title="+10 г"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjustPortionWeight(50)}
                  className="px-2.5 py-2 rounded-xl bg-neutral-800/90 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold transition-colors cursor-pointer active:scale-95 shrink-0"
                >
                  +50
                </button>
              </div>

              {/* Package Weight Multiplier Chips (when package weight is filled) */}
              {manualCalcMode === 'per_100g' && packageWeightGrams > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-neutral-400 block">
                    От веса упаковки ({Math.round(packageWeightGrams)} г):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: '¼ пачки', mult: 0.25 },
                      { label: '⅓ пачки', mult: 1 / 3 },
                      { label: '½ пачки', mult: 0.5 },
                      { label: 'Вся пачка', mult: 1 },
                      { label: '1.5 пачки', mult: 1.5 },
                      { label: '2 пачки', mult: 2 },
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
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-500 text-white shadow-sm'
                              : 'bg-neutral-900/90 text-neutral-300 hover:text-white border border-neutral-800 hover:border-emerald-500/40'
                          }`}
                        >
                          {label} ({targetWeight}г)
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Standard Gram Presets */}
              <div className="flex flex-wrap gap-1.5">
                {PORTION_PRESETS.map((grams) => {
                  const isSelected = Math.round(portionWeightGrams) === grams
                  return (
                    <button
                      key={grams}
                      type="button"
                      onClick={() =>
                        setManualForm((prev) => ({
                          ...prev,
                          weight_grams: String(grams),
                        }))
                      }
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'bg-[#111317] text-neutral-400 hover:text-white border border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      {grams} г
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 5. Live Recalculated Total Preview Card */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-[#151c19] to-[#15171c] border border-emerald-500/35 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-300">
                  Итого в дневник {portionWeightGrams > 0 ? `за ${Math.round(portionWeightGrams)} г` : ''}:
                </span>
                {manualCalcMode === 'per_100g' && (
                  <span className="text-[11px] text-neutral-400">
                    {effectiveBaseCalories} ккал/100г × {Math.round(portionWeightGrams)}г
                  </span>
                )}
              </div>

              <div className="grid grid-cols-4 gap-2 pt-0.5">
                <div className="p-2 rounded-xl bg-black/35 border border-emerald-500/20 text-center">
                  <span className="text-[10px] text-neutral-400 block">Калории</span>
                  <span className="text-sm font-extrabold text-emerald-400">
                    {finalPortionCalories}
                  </span>
                  <span className="text-[9px] text-neutral-500 block">ккал</span>
                </div>
                <div className="p-2 rounded-xl bg-black/35 border border-neutral-800/80 text-center">
                  <span className="text-[10px] text-blue-400 block">Белки</span>
                  <span className="text-sm font-bold text-white">
                    {finalPortionProtein}
                  </span>
                  <span className="text-[9px] text-neutral-500 block">г</span>
                </div>
                <div className="p-2 rounded-xl bg-black/35 border border-neutral-800/80 text-center">
                  <span className="text-[10px] text-amber-400 block">Жиры</span>
                  <span className="text-sm font-bold text-white">
                    {finalPortionFat}
                  </span>
                  <span className="text-[9px] text-neutral-500 block">г</span>
                </div>
                <div className="p-2 rounded-xl bg-black/35 border border-neutral-800/80 text-center">
                  <span className="text-[10px] text-purple-400 block">Углеводы</span>
                  <span className="text-sm font-bold text-white">
                    {finalPortionCarbs}
                  </span>
                  <span className="text-[9px] text-neutral-500 block">г</span>
                </div>
              </div>
            </div>

            {/* 6. Save to Catalog Checkbox + Meal Time */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-0.5">
              {manualCalcMode === 'per_100g' ? (
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={saveToCatalog}
                    onClick={() => setSaveToCatalog((prev) => !prev)}
                    className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all cursor-pointer shrink-0 ${
                      saveToCatalog
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'bg-[#141418] border-neutral-700 text-transparent group-hover:border-neutral-500'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </button>
                  <span className="text-xs text-neutral-300 group-hover:text-white transition-colors">
                    {manualBarcode
                      ? 'Сохранить товар за этим штрихкодом в базу'
                      : 'Сохранить продукт в мою базу (на 100 г)'}
                  </span>
                </label>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2 shrink-0">
                <Clock className="w-3.5 h-3.5 text-neutral-400" />
                <span className="text-xs text-neutral-400">Время:</span>
                <input
                  type="time"
                  value={manualForm.meal_time}
                  onChange={(e) =>
                    setManualForm({ ...manualForm, meal_time: e.target.value })
                  }
                  className="bg-[#16161b] border border-neutral-800 focus:border-emerald-500 rounded-lg px-2.5 py-1 text-xs font-semibold text-white outline-none"
                />
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              isLoading={isSubmitting}
            >
              {`Добавить в дневник • ${finalPortionCalories} ккал${
                portionWeightGrams > 0 ? ` (${Math.round(portionWeightGrams)} г)` : ''
              }`}
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
