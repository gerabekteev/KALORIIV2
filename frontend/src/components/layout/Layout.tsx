import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Download, X } from 'lucide-react'
import { BottomNav, NAV_ITEMS, getNavIndexForPath } from './BottomNav'
import { Header } from './Header'
import { AddMealModal } from '../meals/AddMealModal'
import { EditMealModal } from '../meals/EditMealModal'
import { TodayPage } from '../../pages/TodayPage'
import { MealPlanPage } from '../../pages/MealPlanPage'
import { StatsPage } from '../../pages/StatsPage'
import { ProfilePage } from '../../pages/ProfilePage'
import { haptics } from '../../utils/haptics'
import {
  APP_VERSION,
  checkServerAppVersion,
  downloadLatestApk,
} from '../../utils/platform'

const DISMISSED_UPDATE_KEY = 'kalorii_dismissed_update_version'

function isSwipeBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (
    target.closest(
      '[data-no-tab-swipe="true"], [role="dialog"], input, textarea, select, .recharts-wrapper'
    )
  ) {
    return true
  }
  let el: Element | null = target
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el)
    if (
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      el.scrollWidth > el.clientWidth + 4
    ) {
      return true
    }
    el = el.parentElement
  }
  return false
}

export const Layout: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [availableUpdateVersion, setAvailableUpdateVersion] = useState<string | null>(null)

  const currentTabIndex = getNavIndexForPath(location.pathname)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState<number>(390)

  // Live drag & animated desktop-paging state (Android Launcher ViewPager)
  const [dragX, setDragX] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const [isAnimatingPage, setIsAnimatingPage] = useState(false)
  const prevIndexRef = useRef<number>(currentTabIndex)
  const animTimerRef = useRef<number | null>(null)

  const touchRef = useRef<{
    startX: number
    startY: number
    startTime: number
    active: boolean
    locked: 'horizontal' | 'vertical' | null
  }>({
    startX: 0,
    startY: 0,
    startTime: 0,
    active: false,
    locked: null,
  })

  // Measure pager viewport width for exact 1:1 finger tracking
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = () => {
      const w = el.getBoundingClientRect().width
      if (w > 0) setViewportWidth(w)
    }
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure)
      ro.observe(el)
      return () => ro.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Trigger brief 3D depth-transform state while gliding between desktops
  useEffect(() => {
    if (prevIndexRef.current !== currentTabIndex) {
      prevIndexRef.current = currentTabIndex
      setIsAnimatingPage(true)
      if (animTimerRef.current) window.clearTimeout(animTimerRef.current)
      animTimerRef.current = window.setTimeout(() => {
        setIsAnimatingPage(false)
        animTimerRef.current = null
      }, 420)
    }
  }, [currentTabIndex])

  useEffect(() => {
    return () => {
      if (animTimerRef.current) window.clearTimeout(animTimerRef.current)
    }
  }, [])

  const checkForUpdate = useCallback(async () => {
    const info = await checkServerAppVersion()
    if (!info || !info.hasUpdate) {
      setAvailableUpdateVersion(null)
      return
    }
    try {
      const dismissed = sessionStorage.getItem(DISMISSED_UPDATE_KEY)
      if (dismissed === info.remoteVersion) return
    } catch {
      // Ignore storage errors
    }
    setAvailableUpdateVersion(info.remoteVersion)
  }, [])

  useEffect(() => {
    checkForUpdate()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', checkForUpdate)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', checkForUpdate)
    }
  }, [checkForUpdate])

  const handleDismissUpdate = () => {
    if (availableUpdateVersion) {
      try {
        sessionStorage.setItem(DISMISSED_UPDATE_KEY, availableUpdateVersion)
      } catch {
        // Ignore storage errors
      }
    }
    setAvailableUpdateVersion(null)
  }

  const handleUpdateAction = () => {
    const targetVersion = availableUpdateVersion || APP_VERSION
    downloadLatestApk(targetVersion)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    if (document.body.style.overflow === 'hidden') return
    if (isSwipeBlockedTarget(e.target)) return

    const touch = e.touches[0]
    touchRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      active: true,
      locked: null,
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const t = touchRef.current
    if (!t.active || e.touches.length !== 1) return

    const dx = e.touches[0].clientX - t.startX
    const dy = e.touches[0].clientY - t.startY

    if (t.locked === null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      if (Math.abs(dx) > Math.abs(dy) * 1.25) {
        t.locked = 'horizontal'
        setIsSwiping(true)
      } else {
        t.locked = 'vertical'
        t.active = false
        return
      }
    }

    if (t.locked === 'horizontal') {
      const atLeftEdge = currentTabIndex === 0 && dx > 0
      const atRightEdge = currentTabIndex === NAV_ITEMS.length - 1 && dx < 0
      const clampedDx = atLeftEdge || atRightEdge ? dx * 0.28 : dx
      const maxDrag = viewportWidth * 0.95
      setDragX(Math.max(-maxDrag, Math.min(maxDrag, clampedDx)))
    }
  }

  const finishTouchSwipe = () => {
    const t = touchRef.current
    if (!t.active) return
    t.active = false

    const wasHorizontal = t.locked === 'horizontal'
    t.locked = null

    if (wasHorizontal) {
      const elapsed = Math.max(1, Date.now() - t.startTime)
      const velocity = Math.abs(dragX) / elapsed
      const threshold = Math.min(95, viewportWidth * 0.22)
      const shouldSwitch =
        Math.abs(dragX) >= threshold || (Math.abs(dragX) >= 28 && velocity > 0.3)

      if (shouldSwitch) {
        if (dragX < 0 && currentTabIndex < NAV_ITEMS.length - 1) {
          haptics.release()
          navigate(NAV_ITEMS[currentTabIndex + 1].to)
        } else if (dragX > 0 && currentTabIndex > 0) {
          haptics.release()
          navigate(NAV_ITEMS[currentTabIndex - 1].to)
        }
      }
    }

    setIsSwiping(false)
    setDragX(0)
  }

  // Exact 1:1 fractional offset (-1..+1) synced to both ViewPager 3D transform and BottomNav pill
  const swipeProgress = isSwiping && viewportWidth > 0 ? -dragX / viewportWidth : 0
  const virtualPage = currentTabIndex + swipeProgress
  const isTransitionActive = isSwiping || isAnimatingPage

  const pages = [
    { key: 'today', node: <TodayPage /> },
    { key: 'meal-plan', node: <MealPlanPage /> },
    { key: 'stats', node: <StatsPage isActive={currentTabIndex === 2} /> },
    { key: 'profile', node: <ProfilePage /> },
  ]

  return (
    <div className="relative h-dvh bg-black text-white flex flex-col font-sans antialiased selection:bg-[#E02424] selection:text-white overflow-hidden lg:pl-[228px]">
      {/* Mobile Header (pinned at top) */}
      <Header />

      {/* Update Notification Banner (Nothing X Style) */}
      {availableUpdateVersion && (
        <div className="relative z-20 shrink-0 w-full max-w-lg lg:max-w-5xl xl:max-w-6xl mx-auto px-4 lg:px-8 pt-2.5 animate-in fade-in duration-200">
          <div className="bg-[#1A1A1D] border border-white/[0.08] rounded-[20px] p-3 flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#E02424]/15 flex items-center justify-center text-[#E02424] shrink-0">
                <Download className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white leading-tight truncate my-0">
                  Доступно обновление{' '}
                  <span className="font-ndot">v{availableUpdateVersion}</span>
                </p>
                <p className="text-[11px] text-[#7A7A82] leading-tight truncate mt-0.5 my-0">
                  Скачайте новую версию KaloriiAI
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleUpdateAction}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition-colors cursor-pointer active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Скачать</span>
              </button>
              <button
                type="button"
                onClick={handleDismissUpdate}
                className="p-1.5 rounded-full text-[#7A7A82] hover:text-white hover:bg-[#2A2A2F] transition-colors cursor-pointer"
                title="Скрыть уведомление"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Android Launcher 4-Desktop Horizontal ViewPager */}
      <div
        ref={viewportRef}
        className="relative z-10 flex-1 min-h-0 w-full overflow-hidden touch-pan-y"
        style={{ perspective: '1200px' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={finishTouchSwipe}
        onTouchCancel={finishTouchSwipe}
      >
        <div
          className="flex h-full w-full will-change-transform"
          style={{
            transform: `translate3d(calc(${-currentTabIndex * 100}% + ${dragX}px), 0, 0)`,
            transition: isSwiping
              ? 'none'
              : 'transform 380ms cubic-bezier(0.22, 1, 0.36, 1)',
            transformStyle: 'preserve-3d',
          }}
        >
          {pages.map((page, idx) => {
            const dist = idx - virtualPage
            const absDist = Math.min(1, Math.abs(dist))
            const isCurrent = idx === currentTabIndex

            // Classic Android Launcher depth + gentle 3D desktop rotation while paging
            const scale = isTransitionActive ? 1 - absDist * 0.065 : 1
            const rotateY = isTransitionActive ? Math.max(-10, Math.min(10, dist * -8)) : 0
            const opacity = isTransitionActive ? 1 - absDist * 0.28 : isCurrent ? 1 : 0.85

            return (
              <section
                key={page.key}
                aria-hidden={!isCurrent}
                className="w-full h-full shrink-0 overflow-y-auto overflow-x-hidden"
                style={{
                  transform:
                    isTransitionActive
                      ? `scale(${scale.toFixed(4)}) rotateY(${rotateY.toFixed(2)}deg)`
                      : undefined,
                  transformOrigin: dist < 0 ? 'right center' : dist > 0 ? 'left center' : 'center center',
                  opacity,
                  transition: isSwiping
                    ? 'none'
                    : 'transform 380ms cubic-bezier(0.22, 1, 0.36, 1), opacity 320ms ease-out',
                }}
              >
                <main className="w-full max-w-lg lg:max-w-5xl xl:max-w-6xl mx-auto px-4 lg:px-8 py-3.5 lg:py-7 pb-28 lg:pb-10">
                  {page.node}
                </main>
              </section>
            )
          })}
        </div>
      </div>

      {/* Global Modals */}
      <AddMealModal />
      <EditMealModal />

      {/* Navigation (Mobile Split Dock + Desktop Left Sidebar) */}
      <BottomNav swipeProgress={swipeProgress} isSwiping={isSwiping} />
    </div>
  )
}
