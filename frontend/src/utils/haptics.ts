/**
 * Centralized Haptic Engine for KaloriiAI (UX-04)
 * Provides tactile feedback for swipe triggers, threshold crossing, and confirmations.
 * Gracefully degrades on unsupported platforms / desktop browsers.
 */

class HapticEngine {
  private isSupported(): boolean {
    return typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator
  }

  /**
   * Crisp tactile tick fired when a swipe gesture crosses the action trigger threshold (60px).
   */
  threshold(): void {
    if (this.isSupported()) {
      try {
        navigator.vibrate(14)
      } catch {
        // ignore
      }
    }
  }

  /**
   * Ultra-light release tick fired when returning to origin without triggering.
   */
  release(): void {
    if (this.isSupported()) {
      try {
        navigator.vibrate(6)
      } catch {
        // ignore
      }
    }
  }

  /**
   * Success pulse (double pulse) for added meal, saved recipe, or completed action.
   */
  success(): void {
    if (this.isSupported()) {
      try {
        navigator.vibrate([12, 40, 16])
      } catch {
        // ignore
      }
    }
  }

  /**
   * Warning / Destructive action pulse for item deletion.
   */
  warning(): void {
    if (this.isSupported()) {
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
