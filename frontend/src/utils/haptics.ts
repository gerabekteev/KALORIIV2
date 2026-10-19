import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { isNativeApp } from './platform'

class HapticEngine {
  private isWebVibrateSupported(): boolean {
    return typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator
  }

  threshold(): void {
    if (isNativeApp()) {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
      return
    }
    if (this.isWebVibrateSupported()) {
      try {
        navigator.vibrate(14)
      } catch {
        // ignore
      }
    }
  }

  release(): void {
    if (isNativeApp()) {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
      return
    }
    if (this.isWebVibrateSupported()) {
      try {
        navigator.vibrate(6)
      } catch {
        // ignore
      }
    }
  }

  success(): void {
    if (isNativeApp()) {
      Haptics.notification({ type: NotificationType.Success }).catch(() => {})
      return
    }
    if (this.isWebVibrateSupported()) {
      try {
        navigator.vibrate([12, 40, 16])
      } catch {
        // ignore
      }
    }
  }

  warning(): void {
    if (isNativeApp()) {
      Haptics.notification({ type: NotificationType.Warning }).catch(() => {})
      return
    }
    if (this.isWebVibrateSupported()) {
      try {
        navigator.vibrate([24, 50, 24])
      } catch {
        // ignore
      }
    }
  }
}

export const haptics = new HapticEngine()
export default haptics
