import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Download, X } from 'lucide-react'
import { BottomNav, BottomNavHandle, NAV_ITEMS, getNavIndexForPath } from './BottomNav'
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
const PAGER_SPRING = 'transform 340ms cubic-bezier(0.22, 1, 0.36, 1)'
const PANE_SPRING = 'transform 340ms cubic-bezier(0.22, 1, 0.36, 1), opacity 280ms ease-out'

// Memoized page wrappers so parent Layout never triggers unnecessary re-renders during gestures
const MemoTodayPage = React.memo(TodayPage)
const MemoMealPlanPage = React.memo(MealPlanPage)
const MemoStatsPage = React.memo(StatsPage)
const MemoProfilePage = React.memo(ProfilePage)

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
  const currentTabIndexRef = useRef(currentTabIndex)
  currentTabIndexRef.current = currentTabIndex

  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const paneRefs = useRef<Array<HTMLElement | null>>([null, null, null, null])
  const bottomNavRef = useRef<BottomNavHandle>(null)
  const viewportWidthRef = useRef<number>(390)
  const rafIdRef = useRef<number>(0)

  const touchRef = useRef<{
    startX: number
    startY: number
    startTime: number
    dragX: number
    active: boolean
    locked: 'horizontal' | 'vertical' | null
  }>({
    startX: 0,
    startY: 0,
    startTime: 0,
    dragX: 0,
    active: false,
    locked: null,
  })

  // Measure pager viewport width once + on resize (stored in ref, zero React re-renders)
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = () => {
      const w = el.getBoundingClientRect().width
      if (w > 0) viewportWidthRef.current = w
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

  // Sync smooth GPU track glide whenever route changes (via dock tap, sidebar, or back button)
  useEffect(() => {
    const track = trackRef.current
    if (track) {
      track.style.transition = PAGER_SPRING
      track.style.transform = `translate3d(${-currentTabIndex * 100}%, 0, 0)`
    }
    paneRefs.current.forEach((pane, idx) => {
      if (!pane) return
      pane.style.transition = PANE_SPRING
      pane.style.transform = idx === currentTabIndex ? 'scale(1)' : 'scale(0.96)'
      pane.style.opacity = idx === currentTabIndex ? '1' : '0.82'
    })
  }, [currentTabIndex])

  useEffect(() => {
    return () => {
      if (rafIdRef.current) window.cancelAnimationFrame(rafIdRef.current)
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

  // Pure GPU-composited frame update during finger drag (ZERO React re-renders!)
  const applyLiveDragFrame = () => {
    rafIdRef.current = 0
    const t = touchRef.current
    if (!t.active || t.locked !== 'horizontal') return

    const idx = currentTabIndexRef.current
    const w = viewportWidthRef.current || 390
    const dx = t.dragX
    const progress = -dx / w // positive = moving to right tab, negative = moving to left tab

    const track = trackRef.current
    if (track) {
      track.style.transition = 'none'
      track.style.transform = `translate3d(${-idx * w + dx}px, 0, 0)`
    }

    // Update ONLY the current pane and the neighbor being revealed (cheap GPU scale + opacity)
    const neighborIdx = dx < 0 ? idx + 1 : dx > 0 ? idx - 1 : -1
    const absProg = Math.min(1, Math.abs(progress))

    const curPane = paneRefs.current[idx]
    if (curPane) {
      curPane.style.transition = 'none'
      curPane.style.transform = `scale(${(1 - absProg * 0.045).toFixed(4)})`
      curPane.style.opacity = `${(1 - absProg * 0.22).toFixed(3)}`
    }

    if (neighborIdx >= 0 && neighborIdx < NAV_ITEMS.length) {
      const nextPane = paneRefs.current[neighborIdx]
      if (nextPane) {
        nextPane.style.transition = 'none'
        nextPane.style.transform = `scale(${(0.955 + absProg * 0.045).toFixed(4)})`
        nextPane.style.opacity = `${(0.78 + absProg * 0.22).toFixed(3)}`
      }
    }

    // Sync bottom dock pill + docked quick submenu live at 60/120fps
    bottomNavRef.current?.setLiveSwipe(progress, true)
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
      dragX: 0,
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
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      if (Math.abs(dx) > Math.abs(dy) * 1.15) {
        t.locked = 'horizontal'
      } else {
        t.locked = 'vertical'
        t.active = false
        return
      }
    }

    if (t.locked === 'horizontal') {
      const idx = currentTabIndexRef.current
      const w = viewportWidthRef.current || 390
      const atLeftEdge = idx === 0 && dx > 0
      const atRightEdge = idx === NAV_ITEMS.length - 1 && dx < 0
      const clampedDx = atLeftEdge || atRightEdge ? dx * 0.24 : dx
      t.dragX = Math.max(-w * 0.96, Math.min(w * 0.96, clampedDx))

      if (!rafIdRef.current) {
        rafIdRef.current = window.requestAnimationFrame(applyLiveDragFrame)
      }
    }
  }

  const finishTouchSwipe = () => {
    const t = touchRef.current
    if (!t.active) return
    t.active = false

    if (rafIdRef.current) {
      window.cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = 0
    }

    const wasHorizontal = t.locked === 'horizontal'
    const dx = t.dragX
    t.locked = null
    t.dragX = 0

    if (!wasHorizontal) return

    const idx = currentTabIndexRef.current
    const w = viewportWidthRef.current || 390
    const elapsed = Math.max(1, Date.now() - t.startTime)
    const velocity = Math.abs(dx) / elapsed
    const threshold = Math.min(88, w * 0.2)
    const shouldSwitch = Math.abs(dx) >= threshold || (Math.abs(dx) >= 24 && velocity > 0.28)

    let targetIdx = idx
    if (shouldSwitch) {
      if (dx < 0 && idx < NAV_ITEMS.length - 1) {
        targetIdx = idx + 1
      } else if (dx > 0 && idx > 0) {
        targetIdx = idx - 1
      }
    }

    // Start the smooth spring snap on the exact release frame (zero React frame lag!)
    const track = trackRef.current
    if (track) {
      track.style.transition = PAGER_SPRING
      track.style.transform = `translate3d(${-targetIdx * 100}%, 0, 0)`
    }
    paneRefs.current.forEach((pane, i) => {
      if (!pane) return
      pane.style.transition = PANE_SPRING
      pane.style.transform = i === targetIdx ? 'scale(1)' : 'scale(0.96)'
      pane.style.opacity = i === targetIdx ? '1' : '0.82'
    })
    bottomNavRef.current?.setLiveSwipe(0, false, targetIdx)

    if (targetIdx !== idx) {
      haptics.release()
      navigate(NAV_ITEMS[targetIdx].to)
    }
  }

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

      {/* 60/120fps Zero-Rerender Android ViewPager */}
      <div
        ref={viewportRef}
        className="relative z-10 flex-1 min-h-0 w-full overflow-hidden touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={finishTouchSwipe}
        onTouchCancel={finishTouchSwipe}
      >
        <div
          ref={trackRef}
          className="flex h-full w-full will-change-transform"
          style={{
            transform: `translate3d(${-currentTabIndex * 100}%, 0, 0)`,
            transition: PAGER_SPRING,
          }}
        >
          {[
            { key: 'today', node: <MemoTodayPage /> },
            { key: 'meal-plan', node: <MemoMealPlanPage /> },
            { key: 'stats', node: <MemoStatsPage isActive={currentTabIndex === 2} /> },
            { key: 'profile', node: <MemoProfilePage /> },
          ].map((page, idx) => (
            <section
              key={page.key}
              ref={(el) => {
                paneRefs.current[idx] = el
              }}
              aria-hidden={idx !== currentTabIndex}
              className="w-full h-full shrink-0 overflow-y-auto overflow-x-hidden will-change-transform"
              style={{
                transform: idx === currentTabIndex ? 'scale(1)' : 'scale(0.96)',
                opacity: idx === currentTabIndex ? 1 : 0.82,
                transition: PANE_SPRING,
              }}
            >
              <main className="w-full max-w-lg lg:max-w-5xl xl:max-w-6xl mx-auto px-4 lg:px-8 py-3.5 lg:py-7 pb-28 lg:pb-10">
                {page.node}
              </main>
            </section>
          ))}
        </div>
      </div>

      {/* Global Modals */}
      <AddMealModal />
      <EditMealModal />

      {/* Navigation (Mobile Dock + Docked Quick Submenu + Desktop Sidebar) */}
      <BottomNav ref={bottomNavRef} />
    </div>
  )
}
