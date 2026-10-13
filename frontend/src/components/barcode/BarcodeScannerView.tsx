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
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useUIStore } from '../../store/uiStore'

interface BarcodeScannerViewProps {
  onCodeScanned: (code: string) => void
  onImageUploaded: (file: File) => void
  onCancel: () => void
}

export const BarcodeScannerView: React.FC<BarcodeScannerViewProps> = ({
  onCodeScanned,
  onImageUploaded,
  onCancel,
}) => {
  const { addToast } = useUIStore()
  const [activeTab, setActiveTab] = useState<'camera' | 'upload' | 'manual'>('camera')
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [isProcessingFile, setIsProcessingFile] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const scannerRegionId = 'kalorii-html5-qrcode-reader'
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Start camera scanner
  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      if (html5QrCodeRef.current) {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop()
        }
      }

      const html5QrCode = new Html5Qrcode(scannerRegionId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        verbose: false,
      })
      html5QrCodeRef.current = html5QrCode

      const config = {
        fps: 15,
        qrbox: { width: 260, height: 180 },
        aspectRatio: 1.0,
      }

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          // Success callback
          if (navigator.vibrate) {
            navigator.vibrate(50)
          }
          stopCamera()
          onCodeScanned(decodedText)
        },
        () => {
          // Frame scan error - ignore to keep streaming
        }
      )

      setIsCameraActive(true)
    } catch (err: any) {
      console.warn('Camera start error:', err)
      setCameraError(
        'Не удалось получить доступ к камере. Проверьте разрешения браузера или загрузите фото/скриншот.'
      )
      setIsCameraActive(false)
    }
  }, [onCodeScanned])

  const stopCamera = useCallback(async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop()
      } catch (e) {
        console.warn('Error stopping scanner:', e)
      }
    }
    setIsCameraActive(false)
  }, [])

  useEffect(() => {
    if (activeTab === 'camera') {
      startCamera()
    } else {
      stopCamera()
    }

    return () => {
      stopCamera()
    }
  }, [activeTab, startCamera, stopCamera])

  // Process file / screenshot directly in browser
  const handleProcessImageFile = async (file: File) => {
    setIsProcessingFile(true)
    try {
      // 1. Try decoding barcode directly in browser with Html5Qrcode
      const scanner = new Html5Qrcode('temp-file-scanner', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        verbose: false,
      })

      try {
        const decodedText = await scanner.scanFile(file, true)
        if (decodedText) {
          if (navigator.vibrate) navigator.vibrate(50)
          addToast('Штрихкод успешно распознан на скриншоте!', 'success')
          onCodeScanned(decodedText)
          return
        }
      } catch (scanErr) {
        // Barcode not readable locally, fallback to backend AI vision
        console.info('Local image scan found no direct barcode, delegating to AI Vision:', scanErr)
      } finally {
        try {
          await scanner.clear()
        } catch {
          // ignore
        }
      }

      // 2. Local decode didn't find clear barcode - send photo to server AI Vision
      onImageUploaded(file)
    } catch (err: any) {
      addToast(err.message || 'Ошибка обработки изображения', 'error')
    } finally {
      setIsProcessingFile(false)
    }
  }

  // Clipboard paste (Ctrl+V) listener for screenshots
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile()
          if (file) {
            e.preventDefault()
            addToast('Скриншот получен из буфера обмена (Ctrl+V)', 'info')
            handleProcessImageFile(file)
            return
          }
        }
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [addToast])

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = manualCode.trim()
    if (!trimmed) {
      addToast('Введите цифры штрихкода', 'warning')
      return
    }
    onCodeScanned(trimmed)
  }

  return (
    <div className="space-y-4">
      {/* Hidden container for temp file scan */}
      <div id="temp-file-scanner" className="hidden" />

      {/* Header bar with Back button & Mode tabs */}
      <div className="flex items-center justify-between gap-2 border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <ScanLine className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Сканер штрихкодов</h3>
            <p className="text-[11px] text-neutral-400 flex items-center gap-1">
              <span>EAN-13, EAN-8</span>
              <span>•</span>
              <span className="text-emerald-400 flex items-center gap-0.5">
                <ShieldCheck className="w-3 h-3" /> Честный Знак
              </span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
          title="Назад"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Sub-tabs: Camera | Upload/Screenshot | Manual */}
      <div className="grid grid-cols-3 bg-[#141417] p-1 rounded-xl border border-neutral-800 text-xs font-semibold gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('camera')}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all cursor-pointer ${
            activeTab === 'camera'
              ? 'bg-emerald-500 text-white shadow'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Камера</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('upload')}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all cursor-pointer ${
            activeTab === 'upload'
              ? 'bg-emerald-500 text-white shadow'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Скриншот</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('manual')}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all cursor-pointer ${
            activeTab === 'manual'
              ? 'bg-emerald-500 text-white shadow'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Keyboard className="w-3.5 h-3.5" />
          <span>Вручную</span>
        </button>
      </div>

      {/* Tab 1: Live Camera Viewfinder */}
      {activeTab === 'camera' && (
        <div className="space-y-3">
          <div className="relative rounded-2xl overflow-hidden bg-black border border-neutral-800 aspect-square max-h-[320px] mx-auto flex items-center justify-center">
            {/* HTML5 QR Scanner DOM Target */}
            <div
              id={scannerRegionId}
              className="w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
            />

            {/* Glowing Target Reticle Overlay */}
            {isCameraActive && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative w-64 h-44 rounded-2xl border-2 border-emerald-500/80 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                  {/* Corner accents */}
                  <div className="absolute -top-1 -left-1 w-4 h-4 border-t-3 border-l-3 border-emerald-400 rounded-tl-lg" />
                  <div className="absolute -top-1 -right-1 w-4 h-4 border-t-3 border-r-3 border-emerald-400 rounded-tr-lg" />
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-3 border-l-3 border-emerald-400 rounded-bl-lg" />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-3 border-r-3 border-emerald-400 rounded-br-lg" />

                  {/* Animated scanning beam */}
                  <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse top-1/2 -translate-y-1/2 shadow-[0_0_8px_#34d399]" />
                </div>
              </div>
            )}

            {/* Camera error state */}
            {cameraError && (
              <div className="absolute inset-0 bg-[#161619]/95 p-6 flex flex-col items-center justify-center text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-400" />
                <p className="text-xs text-neutral-300 max-w-xs">{cameraError}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={startCamera}>
                    Повторить
                  </Button>
                  <Button size="sm" onClick={() => setActiveTab('upload')}>
                    Загрузить фото
                  </Button>
                </div>
              </div>
            )}
          </div>

          <p className="text-[11px] text-center text-neutral-400">
            Наведите камеру на полосатый штрихкод или квадратный код маркировки «Честный Знак»
          </p>
        </div>
      )}

      {/* Tab 2: Upload / Screenshot / Ctrl+V */}
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
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-7 text-center transition-all flex flex-col items-center justify-center gap-3 cursor-pointer ${
              isDragging
                ? 'border-emerald-500 bg-emerald-500/10 scale-[1.01]'
                : 'border-neutral-800 bg-[#161619] hover:border-neutral-700 hover:bg-[#1a1a1f]'
            }`}
          >
            {isProcessingFile ? (
              <div className="py-4 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
                <span className="text-xs text-neutral-300 font-medium">
                  Анализируем изображение...
                </span>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">
                    Выберите фото упаковки или вставьте скриншот (Ctrl+V)
                  </p>
                  <p className="text-[11px] text-neutral-400 mt-1 max-w-xs">
                    Подойдут фотографии штрихкодов, кодов Честный Знак, скриншоты каталогов или этикеток с составом
                  </p>
                </div>
                <Button size="sm" variant="secondary" className="mt-1">
                  Выбрать файл
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Manual Code Entry */}
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

          <Button type="submit" className="w-full">
            Найти продукт в базе
          </Button>
        </form>
      )}
    </div>
  )
}
