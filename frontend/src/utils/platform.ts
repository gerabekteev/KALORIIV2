import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { StatusBar, Style } from '@capacitor/status-bar'

const DEFAULT_CLOUD_ORIGIN = 'https://kalorii.lopni.fun'

/**
 * Текущая версия клиентского приложения (синхронизирована с backend /api/health).
 */
export const APP_VERSION = '1.5.1'

/**
 * Сравнивает две semver-версии (например, '1.5.2' и '1.5.1').
 * Возвращает 1, если remote > local; -1, если remote < local; 0, если равны.
 */
export function compareAppVersions(remoteVer: string, localVer: string = APP_VERSION): number {
  const cleanRemote = String(remoteVer || '').trim().replace(/^v/i, '')
  const cleanLocal = String(localVer || '').trim().replace(/^v/i, '')
  if (!cleanRemote || !cleanLocal) return 0

  const rParts = cleanRemote.split('.').map((n) => parseInt(n, 10) || 0)
  const lParts = cleanLocal.split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(rParts.length, lParts.length)

  for (let i = 0; i < len; i++) {
    const r = rParts[i] || 0
    const l = lParts[i] || 0
    if (r > l) return 1
    if (r < l) return -1
  }
  return 0
}

/**
 * Возвращает прямую ссылку на скачивание свежего APK (с защитой от кэширования).
 * Внутри Android WebView указывает на облачный сервер, чтобы скачивание шло через браузер/DownloadManager.
 */
export function getApkDownloadUrl(version: string = APP_VERSION): string {
  const v = encodeURIComponent(version || APP_VERSION)
  const origin = isNativeApp() ? getServerOrigin() || DEFAULT_CLOUD_ORIGIN : getServerOrigin()
  return `${origin}/kalorii-ai.apk?v=${v}`
}

/**
 * Запускает скачивание новой версии Android APK (как в браузере, так и внутри мобильного приложения).
 */
export function downloadLatestApk(version: string = APP_VERSION): void {
  const url = getApkDownloadUrl(version)
  if (isNativeApp()) {
    openExternalUrl(url)
    return
  }
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', 'KaloriiAI.apk')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Проверяет в фоне актуальную версию приложения на сервере.
 */
export async function checkServerAppVersion(): Promise<{
  remoteVersion: string
  hasUpdate: boolean
} | null> {
  try {
    const origin = getServerOrigin()
    const healthUrl = `${origin}/api/health?t=${Date.now()}`
    const res = await fetch(healthUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    const remoteVersion = String(data?.apk_version || data?.version || '').trim()
    if (!remoteVersion) return null
    return {
      remoteVersion,
      hasUpdate: compareAppVersions(remoteVersion, APP_VERSION) > 0,
    }
  } catch {
    return null
  }
}

/**
 * Возвращает true, если приложение запущено внутри нативного контейнера Capacitor (Android/iOS),
 * и false в обычном веб-браузере.
 */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/**
 * Возвращает базовый origin облачного сервера для нативного приложения
 * или пустую строку для веб-версии (чтобы сохранить относительные пути '/api' и '/uploads').
 */
export function getServerOrigin(): string {
  const envOrigin = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.trim()
  if (envOrigin) {
    return envOrigin.replace(/\/+$/, '')
  }
  if (isNativeApp()) {
    return DEFAULT_CLOUD_ORIGIN
  }
  return ''
}

/**
 * Базовый URL для всех запросов к REST API.
 * В веб-версии: '/api'
 * В Android APK: 'https://kalorii.lopni.fun/api'
 */
export const API_BASE_URL = `${getServerOrigin()}/api`

/**
 * Универсальный резолвер URL фотографий блюд и картинок товаров.
 * Корректно обрабатывает внешние ссылки (Open Food Facts, blob:, data:)
 * и подставляет облачный домен для '/uploads/...' внутри Android APK.
 */
export function resolveMediaUrl(path: string | null | undefined): string {
  if (!path) return ''
  const trimmed = path.trim()
  if (!trimmed) return ''

  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed
  }

  const normalizedPath = trimmed.startsWith('/uploads/')
    ? trimmed
    : trimmed.startsWith('uploads/')
    ? `/${trimmed}`
    : `/uploads/${trimmed.replace(/^\/+/, '')}`

  const origin = getServerOrigin()
  return origin ? `${origin}${normalizedPath}` : normalizedPath
}

/**
 * Вызывает нативную камеру или системную галерею Android через @capacitor/camera,
 * сжимает изображение нативно (до 1280px, quality 85) и возвращает стандартный объект File.
 * Если пользователь отменил выбор — возвращает null.
 */
export async function pickImageNative(source: 'camera' | 'gallery'): Promise<File | null> {
  if (!isNativeApp()) return null

  try {
    const permissions = await Camera.checkPermissions()
    if (source === 'camera' && permissions.camera !== 'granted') {
      const req = await Camera.requestPermissions({ permissions: ['camera'] })
      if (req.camera !== 'granted') {
        throw new Error('PERMISSION_DENIED')
      }
    }

    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      width: 1280,
      height: 1280,
      correctOrientation: true,
    })

    if (!photo.webPath) return null

    const response = await fetch(photo.webPath)
    const blob = await response.blob()
    const ext = photo.format || 'jpeg'
    const filename = `photo_${Date.now()}.${ext}`
    return new File([blob], filename, { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` })
  } catch (err: any) {
    const msg = String(err?.message || err || '').toLowerCase()
    if (msg.includes('cancel') || msg.includes('user cancelled') || msg.includes('dismiss')) {
      return null
    }
    throw err
  }
}

/**
 * Открывает внешнюю ссылку (например, Telegram deep-link https://t.me/...)
 * в системном браузере или нативном приложении Android.
 */
export function openExternalUrl(url: string): void {
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Инициализирует нативное окружение Android при старте приложения.
 */
export async function initNativeBridge(options: {
  onBackButton: () => boolean
  onAppResume: () => void
  onAppBackground: () => void
}): Promise<void> {
  if (!isNativeApp()) return

  try {
    await StatusBar.setOverlaysWebView({ overlay: false })
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#0f0f0f' })
  } catch {
    // Игнорируем на платформах без StatusBar
  }

  try {
    await CapApp.removeAllListeners()

    await CapApp.addListener('backButton', ({ canGoBack }) => {
      // 1. Сначала пробуем закрыть открытую модалку или подрежим
      const handledByModalOrSubView = options.onBackButton()
      if (handledByModalOrSubView) return

      // 2. Если мы не на главной вкладке ('/'), возвращаемся по истории или на '/'
      if (window.location.pathname !== '/' && window.location.pathname !== '/login') {
        if (canGoBack) {
          window.history.back()
        } else {
          window.location.href = '/'
        }
        return
      }

      // 3. На главном экране без открытых модалок — сворачиваем приложение
      CapApp.minimizeApp()
    })

    await CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        options.onAppResume()
      } else {
        options.onAppBackground()
      }
    })
  } catch (e) {
    console.warn('Native bridge listener setup warning:', e)
  }
}
