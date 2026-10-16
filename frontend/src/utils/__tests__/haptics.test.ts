import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { haptics } from '../haptics'

describe('HapticEngine', () => {
  const originalNavigator = globalThis.navigator
  const originalWindow = (globalThis as any).window

  beforeEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as any).window = globalThis
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    })
    ;(globalThis as any).window = originalWindow
  })

  it('safely handles environments where navigator.vibrate is missing', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    })

    expect(() => {
      haptics.threshold()
      haptics.release()
      haptics.success()
      haptics.warning()
    }).not.toThrow()
  })

  it('triggers correct vibration patterns when navigator.vibrate is supported', () => {
    const vibrateMock = vi.fn().mockReturnValue(true)
    Object.defineProperty(globalThis, 'navigator', {
      value: { vibrate: vibrateMock },
      configurable: true,
      writable: true,
    })

    haptics.threshold()
    expect(vibrateMock).toHaveBeenCalledWith(14)

    haptics.release()
    expect(vibrateMock).toHaveBeenCalledWith(6)

    haptics.success()
    expect(vibrateMock).toHaveBeenCalledWith([12, 40, 16])

    haptics.warning()
    expect(vibrateMock).toHaveBeenCalledWith([24, 50, 24])
  })
})
