import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  Camera,
  Image as ImageIcon,
  ScanLine,
  Keyboard,
  AlertCircle,
  Loader2,
  X,
  UploadCloud,
  ShieldCheck,
  Sparkles,
  PenTool,
  RotateCcw,
  Zap,
  ZapOff,
  CameraOff,
  RefreshCw,
} from 'lucide-react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useUIStore } from '../../store/uiStore'
import { barcodeApi } from '../../api/barcode'
import { BarcodeProductResult } from '../../types'
import { decodeBarcodeFromImageFile } from '../../utils/barcodeDecoder'
import { isNativeApp, pickImageNative } from '../../utils/platform'

interface BarcodeScannerViewProps {
  onProductFound: (product: BarcodeProductResult) => void
  onSwitchToAI: (file?: File | null, initialComment?: string) => void
  onSwitchToManual: (initialName?: string, initialBarcode?: string) => void
  onCancel: () => void
}

interface NotFoundState {
  code?: string
  file?: File | null
  noBarcodeFound?: boolean
  source: 'camera' | 'upload' | 'manual'
}

export const BarcodeScannerView: React.FC<BarcodeScannerViewProps> = ({
  onProductFound,
  onSwitchToAI,
  onSwitchToManual,
  onCancel,
}) => {
  const { addToast } = useUIStore()
  const [activeTab, setActiveTab] = useState<'camera' | 'upload' | 'manual'>('camera')

  // Camera state
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraErrorType, setCameraErrorType] = useState<
    'not_allowed' | 'not_found' | 'not_readable' | 'generic'
  >('generic')
  const [isScanningPaused, setIsScanningPaused] = useState(false)

  // Torch / Flashlight state
  const [isTorchAvailable, setIsTorchAvailable] = useState(false)
  const [isTorchOn, setIsTorchOn] = useState(false)
  const [isTogglingTorch, setIsTogglingTorch] = useState(false)

  // Searching & Not-found state
  const [isSearching, setIsSearching] = useState(false)
  const [searchingCode, setSearchingCode] = useState<string | null>(null)
  const [notFoundState, setNotFoundState] = useState<NotFoundState | null>(null)

  // Upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null)
  const [isProcessingFile, setIsProcessingFile] = useState(false)
  const [isScanningOcr, setIsScanningOcr] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Manual code state
  const [manualCode, setManualCode] = useState('')

  // Anti-spam lock & debounce refs
  const isProcessingRef = useRef(false)
  const lastScannedCodeRef = useRef<string | null>(null)
  const lastScannedTimeRef = useRef<number>(0)

  // Lifecycle & race-condition cancellation refs
  const cameraSessionIdRef = useRef<number>(0)
  const isMountedRef = useRef<boolean>(true)
  const activeTabRef = useRef<'camera' | 'upload' | 'manual'>('camera')

  const scannerRegionId = 'kalorii-html5-qrcode-reader'
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Explicit helper: forcefully stop all video tracks on any active MediaStreams in DOM
  const stopAllMediaTracks = useCallback(() => {
    try {
      const container = document.getElementById(scannerRegionId)
      if (container) {
        const videoElements = container.querySelectorAll<HTMLVideoElement>('video')
        videoElements.forEach((video) => {
          if (video.srcObject && video.srcObject instanceof MediaStream) {
            video.srcObject.getTracks().forEach((track) => {
              try {
                track.stop()
              } catch (e) {
                console.warn('Error stopping video track:', e)
              }
            })
            video.srcObject = null
          }
        })
      }
    } catch (err) {
      console.warn('Error in stopAllMediaTracks:', err)
    }
  }, [scannerRegionId])

  // Get active video MediaStreamTrack
  const getActiveVideoTrack = useCallback((): MediaStreamTrack | null => {
    try {
      const container = document.getElementById(scannerRegionId)
      const video = container?.querySelector<HTMLVideoElement>('video')
      if (video && video.srcObject && video.srcObject instanceof MediaStream) {
        const tracks = video.srcObject.getVideoTracks()
        return tracks.length > 0 ? tracks[0] : null
      }
    } catch {
      // ignore
    }
    return null
  }, [scannerRegionId])

  // Safe torch capability detection (iOS Safari and Firefox safe)
  const checkTorchCapability = useCallback(() => {
    try {
      const track = getActiveVideoTrack()
      if (track && typeof track.getCapabilities === 'function') {
        const caps = track.getCapabilities() as any
        if (caps && Boolean(caps.torch)) {
          setIsTorchAvailable(true)
          return
        }
      }
    } catch {
      // Safe fallback for browsers throwing on getCapabilities
    }
    setIsTorchAvailable(false)
  }, [getActiveVideoTrack])

  // Safe camera pause
  const pauseCameraScanning = () => {
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.pause(true)
        setIsScanningPaused(true)
      }
    } catch {
      // ignore
    }
  }

  // Safe camera resume
  const resumeCameraScanning = () => {
    setNotFoundState(null)
    setIsSearching(false)
    setSearchingCode(null)
    isProcessingRef.current = false

    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.resume()
        setIsScanningPaused(false)
      } else {
        startCamera()
      }
    } catch {
      startCamera()
    }
  }

  // Core lookup logic with clean inline state
  const handlePerformLookup = async (
    code: string,
    source: 'camera' | 'upload' | 'manual',
    associatedFile?: File | null
  ) => {
    setIsSearching(true)
    setSearchingCode(code)
    setNotFoundState(null)

    try {
      const product = await barcodeApi.lookup(code)
      if (navigator.vibrate) navigator.vibrate(60)
      setIsSearching(false)
      isProcessingRef.current = false
      onProductFound(product)
    } catch {
      // 404 or not found: Show clean inline card instead of spamming error toasts!
      setIsSearching(false)
      setNotFoundState({
        code,
        file: associatedFile || null,
        noBarcodeFound: false,
        source,
      })
    }
  }

  // Stop camera and release all hardware resources cleanly
  const stopCamera = useCallback(async () => {
    // Invalidate any ongoing asynchronous startCamera
    cameraSessionIdRef.current++

    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop()
        }
      } catch (e) {
        console.warn('Error stopping html5QrCode scanner:', e)
      }
      try {
        await html5QrCodeRef.current.clear()
      } catch {
        // ignore
      }
    }

    // Forcefully stop any orphaned media tracks on HTML video elements
    stopAllMediaTracks()

    setIsCameraActive(false)
    setIsScanningPaused(false)
    setIsTorchOn(false)
    setIsTorchAvailable(false)
  }, [stopAllMediaTracks])

  // Start camera scanner
  const startCamera = useCallback(async () => {
    const sessionId = ++cameraSessionIdRef.current
    setCameraError(null)
    setNotFoundState(null)
    isProcessingRef.current = false

    try {
      // Clean up previous instance before creating a new one
      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            await html5QrCodeRef.current.stop()
          }
        } catch {
          // ignore
        }
        try {
          await html5QrCodeRef.current.clear()
        } catch {
          // ignore
        }
      }
      stopAllMediaTracks()

      // If user navigated away while cleanup was happening
      if (
        sessionId !== cameraSessionIdRef.current ||
        !isMountedRef.current ||
        activeTabRef.current !== 'camera'
      ) {
        return
      }

      const html5QrCode = new Html5Qrcode(scannerRegionId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.CODE_128,
        ],
        verbose: false,
      })
      html5QrCodeRef.current = html5QrCode

      const config = {
        fps: 15,
        qrbox: { width: 250, height: 170 },
        aspectRatio: 1.0,
      }

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          // Anti-spam lock & debounce
          if (isProcessingRef.current) return

          const now = Date.now()
          if (
            lastScannedCodeRef.current === decodedText &&
            now - lastScannedTimeRef.current < 3000
          ) {
            return // Skip duplicate code within 3 seconds
          }

          isProcessingRef.current = true
          lastScannedCodeRef.current = decodedText
          lastScannedTimeRef.current = now

          // Immediately pause camera frames to prevent callback flooding
          pauseCameraScanning()

          // Execute search
          handlePerformLookup(decodedText, 'camera')
        },
        () => {
          // Frame error callback - ignore to keep streaming smoothly
        }
      )

      // Post-start safety verification: did component unmount or tab switch while waiting?
      if (
        sessionId !== cameraSessionIdRef.current ||
        !isMountedRef.current ||
        activeTabRef.current !== 'camera'
      ) {
        try {
          await html5QrCode.stop()
        } catch {}
        try {
          await html5QrCode.clear()
        } catch {}
        stopAllMediaTracks()
        return
      }

      setIsCameraActive(true)
      setIsScanningPaused(false)

      // Safely check torch capability after stream has attached
      setTimeout(() => {
        if (isMountedRef.current && activeTabRef.current === 'camera') {
          checkTorchCapability()
        }
      }, 350)
    } catch (err: any) {
      console.warn('Camera start error:', err)
      stopAllMediaTracks()
      setIsCameraActive(false)
      setIsScanningPaused(false)
      setIsTorchOn(false)
      setIsTorchAvailable(false)

      // Categorize errors with informative Russian messages
      const errStr = String(err?.message || err?.name || err || '').toLowerCase()
      if (
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError' ||
        errStr.includes('notallowed') ||
        errStr.includes('permission denied') ||
        errStr.includes('permission')
      ) {
        setCameraErrorType('not_allowed')
        setCameraError(
          'Доступ к камере заблокирован в браузере. Разрешите доступ к камере в настройках сайта (значок 🔒 в адресной строке) или воспользуйтесь фото.'
        )
      } else if (
        err?.name === 'NotFoundError' ||
        err?.name === 'DevicesNotFoundError' ||
        errStr.includes('notfound') ||
        errStr.includes('requested device not found') ||
        errStr.includes('no camera')
      ) {
        setCameraErrorType('not_found')
        setCameraError(
          'Камера не обнаружена на этом устройстве. Вы можете загрузить скриншот упаковки или ввести штрихкод вручную.'
        )
      } else if (
        err?.name === 'NotReadableError' ||
        err?.name === 'TrackStartError' ||
        errStr.includes('notreadable') ||
        errStr.includes('could not start video source') ||
        errStr.includes('source unavailable')
      ) {
        setCameraErrorType('not_readable')
        setCameraError(
          'Камера занята другим приложением (Telegram, Zoom, системная камера). Закройте другие программы и повторите попытку.'
        )
      } else if (
        err?.name === 'OverconstrainedError' ||
        errStr.includes('overconstrained')
      ) {
        setCameraErrorType('generic')
        setCameraError(
          'Параметры видеокамеры не поддерживаются устройством. Попробуйте повторить или загрузить фото упаковки.'
        )
      } else {
        setCameraErrorType('generic')
        setCameraError(
          'Не удалось получить доступ к камере. Проверьте разрешения браузера или загрузите скриншот/фото.'
        )
      }
    }
  }, [stopAllMediaTracks, checkTorchCapability])

  // Torch toggle handler
  const handleToggleTorch = async () => {
    if (isTogglingTorch) return
    setIsTogglingTorch(true)

    try {
      const track = getActiveVideoTrack()
      if (track && typeof track.applyConstraints === 'function') {
        const nextState = !isTorchOn
        await track.applyConstraints({
          advanced: [{ torch: nextState } as any],
        })
        setIsTorchOn(nextState)
      }
    } catch (err) {
      console.warn('Torch toggle error:', err)
      setIsTorchAvailable(false)
    } finally {
      setIsTogglingTorch(false)
    }
  }

  // Tab & mount lifecycle management
  useEffect(() => {
    isMountedRef.current = true
    activeTabRef.current = activeTab

    if (activeTab === 'camera') {
      startCamera()
    } else {
      stopCamera()
    }

    return () => {
      // Invalidate running operations and force-stop all tracks
      cameraSessionIdRef.current++
      stopCamera()
      stopAllMediaTracks()
    }
  }, [activeTab, startCamera, stopCamera, stopAllMediaTracks])

  // Component unmount final cleanup
  useEffect(() => {
    return () => {
      isMountedRef.current = false
      cameraSessionIdRef.current++
      if (uploadedPreview) {
        URL.revokeObjectURL(uploadedPreview)
      }
      stopAllMediaTracks()
    }
  }, [stopAllMediaTracks, uploadedPreview])

  // Handle image file selection / screenshot
  const handleProcessImageFile = async (file: File) => {
    if (uploadedPreview) {
      URL.revokeObjectURL(uploadedPreview)
    }
    const url = URL.createObjectURL(file)
    setUploadedFile(file)
    setUploadedPreview(url)
    setIsProcessingFile(true)
    setNotFoundState(null)

    try {
      // Try decoding barcode directly using ZXing
      const detectedCode = await decodeBarcodeFromImageFile(file)

      if (detectedCode) {
        if (navigator.vibrate) navigator.vibrate(50)
        addToast(`Штрихкод ${detectedCode} найден на изображении!`, 'info', 2000)
        setIsProcessingFile(false)
        await handlePerformLookup(detectedCode, 'upload', file)
      } else {
        // No barcode detected on this image
        setIsProcessingFile(false)
        setNotFoundState({
          file,
          noBarcodeFound: true,
          source: 'upload',
        })
      }
    } catch {
      setIsProcessingFile(false)
      setNotFoundState({
        file,
        noBarcodeFound: true,
        source: 'upload',
      })
    }
  }

  const handleScanLabelViaAI = async (file: File) => {
    setIsScanningOcr(true)
    try {
      const res = await barcodeApi.scanImage(file)
      if (res.product) {
        if (navigator.vibrate) navigator.vibrate(60)
        addToast('Этикетка успешно распознана через AI!', 'success', 2500)
        onProductFound(res.product)
      } else {
        addToast(res.message || 'Не удалось распознать пищевую ценность на упаковке', 'warning', 3500)
      }
    } catch (err: any) {
      console.warn('AI OCR scan error:', err)
      addToast(err?.message || 'Ошибка распознавания упаковки через AI', 'error')
    } finally {
      setIsScanningOcr(false)
    }
  }

  // Clipboard paste (Ctrl+V) listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
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
            setActiveTab('upload')
            addToast('Скриншот получен из буфера обмена (Ctrl+V)', 'info', 2000)
            handleProcessImageFile(file)
            return
          }
        }
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [addToast])

  const handleOpenGalleryUpload = async () => {
    if (isNativeApp()) {
      try {
        const file = await pickImageNative('gallery')
        if (file) handleProcessImageFile(file)
      } catch {
        addToast('Не удалось открыть галерею', 'error')
      }
      return
    }
    fileInputRef.current?.click()
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = manualCode.trim()
    if (!trimmed) {
      addToast('Введите цифры штрихкода', 'warning')
      return
    }
    handlePerformLookup(trimmed, 'manual')
  }

  const handleClose = () => {
    stopCamera()
    stopAllMediaTracks()
    onCancel()
  }

  return (
    <div
      className="space-y-4"
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setIsDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file && file.type.startsWith('image/')) {
          setActiveTab('upload')
          handleProcessImageFile(file)
        }
      }}
    >
      {/* Format info banner */}
      <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1 pb-1">
        <span>Штрихкоды: EAN-13, EAN-8, UPC</span>
        <span className="text-emerald-400 flex items-center gap-1 font-medium">
          <ShieldCheck className="w-3.5 h-3.5" /> Честный Знак
        </span>
      </div>

      {/* Sub-tabs: Camera | Screenshot | Manual */}
      <div className="grid grid-cols-3 bg-[#141417] p-1 rounded-xl border border-neutral-800 text-xs font-semibold gap-1">
        <button
          type="button"
          onClick={() => {
            setActiveTab('camera')
            setNotFoundState(null)
          }}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all cursor-pointer min-h-[38px] ${
            activeTab === 'camera'
              ? 'bg-emerald-500 text-white shadow'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Camera className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Камера</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('upload')
            setNotFoundState(null)
          }}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all cursor-pointer min-h-[38px] ${
            activeTab === 'upload'
              ? 'bg-emerald-500 text-white shadow'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Скриншот</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('manual')
            setNotFoundState(null)
          }}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all cursor-pointer min-h-[38px] ${
            activeTab === 'manual'
              ? 'bg-emerald-500 text-white shadow'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Keyboard className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Вручную</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: LIVE CAMERA VIEWFINDER                            */}
      {/* ======================================================== */}
      {activeTab === 'camera' && (
        <div className="space-y-3">
          <div className="relative rounded-2xl overflow-hidden bg-black border border-neutral-800 aspect-square max-h-[300px] mx-auto flex items-center justify-center">
            {/* HTML5 QR Scanner DOM Region */}
            <div
              id={scannerRegionId}
              className="w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
            />

            {/* Glowing Reticle Overlay (Only when scanning active) */}
            {isCameraActive && !isScanningPaused && !isSearching && !notFoundState && !cameraError && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative w-64 h-40 rounded-2xl border-2 border-emerald-500/80 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                  {/* Corner brackets */}
                  <div className="absolute -top-1 -left-1 w-4 h-4 border-t-3 border-l-3 border-emerald-400 rounded-tl-lg" />
                  <div className="absolute -top-1 -right-1 w-4 h-4 border-t-3 border-r-3 border-emerald-400 rounded-tr-lg" />
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-3 border-l-3 border-emerald-400 rounded-bl-lg" />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-3 border-r-3 border-emerald-400 rounded-br-lg" />

                  {/* Laser line */}
                  <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse top-1/2 -translate-y-1/2 shadow-[0_0_8px_#34d399]" />
                </div>
              </div>
            )}

            {/* Torch / Flashlight Toggle Button in Viewfinder */}
            {isCameraActive && isTorchAvailable && !cameraError && (
              <button
                type="button"
                onClick={handleToggleTorch}
                disabled={isTogglingTorch}
                className={`absolute top-2.5 right-2.5 z-10 px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md ${
                  isTorchOn
                    ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/30'
                    : 'bg-black/60 hover:bg-black/80 text-white border border-white/20'
                }`}
                title={isTorchOn ? 'Выключить фонарик' : 'Включить фонарик'}
              >
                {isTorchOn ? (
                  <Zap className="w-3.5 h-3.5 fill-black" />
                ) : (
                  <ZapOff className="w-3.5 h-3.5 text-neutral-300" />
                )}
                <span className="text-[11px]">{isTorchOn ? 'Вкл' : 'Фонарик'}</span>
              </button>
            )}

            {/* Searching In-view overlay */}
            {isSearching && (
              <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4 z-20 animate-in fade-in">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold text-white">
                    Ищем товар в базе...
                  </p>
                  {searchingCode && (
                    <p className="text-[11px] font-mono text-emerald-400 mt-1">
                      {searchingCode}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Detailed Camera Access Error State */}
            {cameraError && (
              <div className="absolute inset-0 bg-[#161619]/95 p-4 sm:p-6 flex flex-col items-center justify-center text-center space-y-3 z-20 animate-in fade-in">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <CameraOff className="w-5 h-5" />
                </div>
                <p className="text-xs text-neutral-300 max-w-xs leading-relaxed">
                  {cameraError}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={startCamera}
                    leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    Повторить
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setActiveTab('upload')}
                  >
                    Загрузить фото
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setActiveTab('manual')}
                  >
                    Вручную
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Polite Not-Found Inline Card for Camera */}
          {notFoundState && notFoundState.source === 'camera' && (
            <div className="p-4 rounded-2xl bg-[#191920] border border-amber-500/40 space-y-3 animate-in fade-in">
              <div className="flex items-center gap-2 text-amber-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-xs font-bold">Товар не найден в базе</span>
              </div>
              <p className="text-xs text-neutral-300">
                Штрихкод <span className="font-mono font-bold text-white bg-black/40 px-1.5 py-0.5 rounded border border-neutral-700">{notFoundState.code}</span> пока отсутствует в каталоге.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSwitchToAI(null, `Штрихкод: ${notFoundState.code}`)}
                  className="flex items-center justify-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">Фото упаковки</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => onSwitchToManual('', notFoundState.code)}
                  className="flex items-center justify-center gap-1.5"
                >
                  <PenTool className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Ввести КБЖУ</span>
                </Button>
              </div>
              <button
                type="button"
                onClick={resumeCameraScanning}
                className="w-full text-center text-xs text-neutral-400 hover:text-white pt-1 flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Сканировать другой товар</span>
              </button>
            </div>
          )}

          {!notFoundState && !isSearching && !cameraError && (
            <p className="text-[11px] text-center text-neutral-400">
              Наведите камеру на штрихкод или квадратный код маркировки «Честный Знак»
            </p>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: SCREENSHOT / IMAGE UPLOAD                         */}
      {/* ======================================================== */}
      {activeTab === 'upload' && (
        <div className="space-y-3">
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleProcessImageFile(file)
            }}
            className="hidden"
          />

          {!uploadedPreview ? (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                setIsDragging(false)
              }}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragging(false)
                const file = e.dataTransfer.files?.[0]
                if (file && file.type.startsWith('image/')) {
                  handleProcessImageFile(file)
                }
              }}
              onClick={handleOpenGalleryUpload}
              className={`border-2 border-dashed rounded-2xl p-6 sm:p-7 text-center transition-all flex flex-col items-center justify-center gap-3 cursor-pointer ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-500/10 scale-[1.01]'
                  : 'border-neutral-800 bg-[#161619] hover:border-neutral-700 hover:bg-[#1a1a1f]'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">
                  Выберите скриншот или вставьте из буфера (Ctrl+V)
                </p>
                <p className="text-[11px] text-neutral-400 mt-1 max-w-xs">
                  Подходят скриншоты каталогов, фото упаковки, штрихкодов или маркировки Честный Знак
                </p>
              </div>
              <Button size="sm" variant="secondary" className="mt-1">
                Выбрать файл
              </Button>
            </div>
          ) : (
            <div className="space-y-3 animate-in fade-in">
              {/* Preview with action overlays */}
              <div className="relative rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900 aspect-video max-h-48 flex items-center justify-center">
                <img
                  src={uploadedPreview}
                  alt="Скриншот"
                  className="w-full h-full object-contain p-1"
                />

                {isProcessingFile && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 p-4 z-10">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                    <span className="text-xs font-medium text-white">
                      Сканируем изображение...
                    </span>
                  </div>
                )}

                {isSearching && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 p-4 z-10">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                    <span className="text-xs font-medium text-white">
                      Поиск в базе продуктов...
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (uploadedPreview) URL.revokeObjectURL(uploadedPreview)
                    setUploadedFile(null)
                    setUploadedPreview(null)
                    setNotFoundState(null)
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-black/75 hover:bg-black text-white rounded-full transition-colors cursor-pointer z-10"
                  title="Выбрать другой файл"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Polite Result State for Uploaded Screenshot */}
              {notFoundState && notFoundState.source === 'upload' && (
                <div className="p-4 rounded-2xl bg-[#191920] border border-neutral-800 space-y-3 animate-in fade-in">
                  {notFoundState.noBarcodeFound ? (
                    <>
                      <div className="flex items-center gap-2 text-neutral-200">
                        <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                        <span className="text-xs font-bold">
                          Штрихкод на изображении не найден
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400">
                        Штрихкод не обнаружен. Вы можете распознать пищевую ценность с упаковки/этикетки через AI или проанализировать готовое блюдо.
                      </p>
                      <div className="flex flex-col gap-2 pt-1">
                        {notFoundState.file && (
                          <Button
                            className="w-full flex items-center justify-center gap-1.5"
                            variant="secondary"
                            isLoading={isScanningOcr}
                            onClick={() => notFoundState.file && handleScanLabelViaAI(notFoundState.file)}
                          >
                            <ScanLine className="w-4 h-4 text-emerald-400" />
                            <span>Считать этикетку / упаковку через AI</span>
                          </Button>
                        )}
                        <Button
                          className="w-full flex items-center justify-center gap-1.5"
                          onClick={() => onSwitchToAI(notFoundState.file)}
                        >
                          <Sparkles className="w-4 h-4 text-emerald-300" />
                          <span>Распознать блюдо целиком через AI</span>
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-amber-400">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-bold">
                          Штрихкод найден, но товара нет в базе
                        </span>
                      </div>
                      <p className="text-xs text-neutral-300">
                        Код <span className="font-mono font-bold text-white bg-black/40 px-1.5 py-0.5 rounded border border-neutral-700">{notFoundState.code}</span> отсутствует в каталоге. Определить КБЖУ по фото через AI?
                      </p>
                      <div className="grid grid-cols-2 gap-2 pt-0.5">
                        <Button
                          size="sm"
                          onClick={() => onSwitchToAI(notFoundState.file, `Штрихкод: ${notFoundState.code}`)}
                          className="flex items-center justify-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                          <span className="truncate">Анализ через AI</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onSwitchToManual('', notFoundState.code)}
                          className="flex items-center justify-center gap-1.5"
                        >
                          <PenTool className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Вручную</span>
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: MANUAL CODE ENTRY                                 */}
      {/* ======================================================== */}
      {activeTab === 'manual' && (
        <form onSubmit={handleManualSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-neutral-300 block mb-1.5">
              Цифры штрихкода (EAN-13, EAN-8) или код Честного Знака
            </label>
            <Input
              type="text"
              placeholder="Например, 4607025140019 или 01046..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              autoFocus
            />
          </div>

          <Button type="submit" isLoading={isSearching} className="w-full min-h-[44px]">
            Найти продукт в базе
          </Button>

          {/* Polite Not-found Card for Manual Code */}
          {notFoundState && notFoundState.source === 'manual' && (
            <div className="p-4 rounded-2xl bg-[#191920] border border-amber-500/40 space-y-3 animate-in fade-in">
              <div className="flex items-center gap-2 text-amber-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-xs font-bold">Товар не найден в базе</span>
              </div>
              <p className="text-xs text-neutral-300">
                Код <span className="font-mono font-bold text-white bg-black/40 px-1.5 py-0.5 rounded border border-neutral-700">{notFoundState.code}</span> отсутствует в каталоге.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSwitchToAI(null, `Штрихкод: ${notFoundState.code}`)}
                  className="flex items-center justify-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">Фото упаковки</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => onSwitchToManual('', notFoundState.code)}
                  className="flex items-center justify-center gap-1.5"
                >
                  <PenTool className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Ввести КБЖУ</span>
                </Button>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  )
}
