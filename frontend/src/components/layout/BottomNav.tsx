import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Utensils,
  BarChart3,
  User,
  Plus,
  ChefHat,
  Camera,
  Barcode,
  Mic,
  Search,
} from 'lucide-react'
import { useMealsStore } from '../../store/mealsStore'
import { useUIStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'

export const NAV_ITEMS = [
  { to: '/', label: 'Сегодня', icon: Utensils, end: true },
  { to: '/meal-plan', label: 'Что съесть', icon: ChefHat, end: false },
  { to: '/stats', label: 'Статистика', icon: BarChart3, end: false },
  { to: '/profile', label: 'Профиль', icon: User, end: false },
]

const QUICK_INPUT_ACTIONS = [
  { mode: 'ai_photo' as const, label: 'Фото', ariaLabel: 'AI Фото', icon: Camera, primary: true },
  { mode: 'barcode' as const, label: 'Код', ariaLabel: 'Штрихкод', icon: Barcode, primary: false },
  { mode: 'voice_ai' as const, label: 'Голос', ariaLabel: 'Голос AI', icon: Mic, primary: false },
  { mode: 'search' as const, label: 'Поиск', ariaLabel: 'Поиск в базе', icon: Search, primary: false },
]

export function getNavIndexForPath(pathname: string): number {
  if (pathname === '/') return 0
  const idx = NAV_ITEMS.findIndex((item) => item.to !== '/' && pathname.startsWith(item.to))
  return idx >= 0 ? idx : 0
}

export interface BottomNavHandle {
  /** Imperative 60/120fps update during finger swipe without triggering React re-renders */
  setLiveSwipe: (offsetFraction: number, isDragging: boolean, targetIndexOverride?: number) => void
}

const DOCK_SPRING = 'transform 340ms cubic-bezier(0.22, 1, 0.36, 1)'

export const BottomNav = React.memo(
  forwardRef<BottomNavHandle>((_props, ref) => {
    const location = useLocation()
    const { pendingMeals } = useMealsStore()
    const { openAddMeal } = useUIStore()
    const { user } = useAuthStore()
    const hasAnalyzingMeals = pendingMeals.some((p) => p.status === 'analyzing')

    const activeIndex = getNavIndexForPath(location.pathname)
    const activeIndexRef = useRef(activeIndex)
    activeIndexRef.current = activeIndex

    const pillRef = useRef<HTMLDivElement>(null)
    const trayRef = useRef<HTMLDivElement>(null)

    const applyPosition = (offset: number, instant: boolean) => {
      const clamped = Math.max(0, Math.min(NAV_ITEMS.length - 1, offset))
      const tuck = Math.max(0, Math.min(1, clamped))

      if (pillRef.current) {
        pillRef.current.style.transition = instant ? 'none' : DOCK_SPRING
        pillRef.current.style.transform = `translate3d(${clamped * 100}%, 0, 0)`
      }
      if (trayRef.current) {
        trayRef.current.style.transition = instant ? 'none' : DOCK_SPRING
        trayRef.current.style.transform = `translate3d(0, ${(tuck * 105).toFixed(2)}%, 0)`
      }
    }

    useImperativeHandle(ref, () => ({
      setLiveSwipe: (offsetFraction: number, isDragging: boolean, targetIndexOverride?: number) => {
        const base =
          targetIndexOverride !== undefined ? targetIndexOverride : activeIndexRef.current
        applyPosition(base + offsetFraction, isDragging)
      },
    }))

    // Sync smoothly whenever route changes (via tap, sidebar, or hardware back)
    useEffect(() => {
      applyPosition(activeIndex, false)
    }, [activeIndex])

    const isQuickTrayInteractive = activeIndex === 0
    const initialTuck = activeIndex === 0 ? 0 : 1

    return (
      <>
        {/* ============================================================
            DESKTOP SIDEBAR (>= 1024px): Compact Nothing X Left Dock
            ============================================================ */}
        <aside className="hidden lg:flex fixed top-0 left-0 bottom-0 w-[228px] z-40 bg-black border-r border-white/[0.07] flex-col justify-between px-4 py-6">
          <div className="space-y-6">
            {/* Brand Wordmark */}
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2.5">
                <img
                  src="/icon.svg?v=2.0.2"
                  alt="KaloriiAI"
                  className="w-7 h-7 rounded-[8px] border border-white/[0.08] shrink-0"
                />
                <span className="font-ndot text-lg font-bold tracking-wider text-white">
                  KALORII<span className="text-[#7A7A82]">.AI</span>
                </span>
              </div>
            </div>

            {/* Primary Surgical Red Action CTA */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => openAddMeal()}
                className="w-full min-h-[46px] px-4 rounded-full bg-[#E02424] hover:bg-[#C81E1E] active:scale-[0.98] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-[0_8px_24px_rgba(224,36,36,0.28)]"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Добавить еду</span>
              </button>

              {/* Desktop 4 Quick-Input Shortcuts */}
              <div className="grid grid-cols-4 gap-1.5">
                {QUICK_INPUT_ACTIONS.map(({ mode, label, ariaLabel, icon: Icon }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => openAddMeal(null, mode)}
                    title={ariaLabel}
                    aria-label={ariaLabel}
                    className="h-9 rounded-full bg-[#1A1A1D] hover:bg-[#2A2A2F] text-[#D4D4D8] hover:text-white flex items-center justify-center transition-colors cursor-pointer active:scale-95"
                  >
                    <Icon className="w-4 h-4" />
                    <span className="sr-only">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="nothing-dotted-divider" />

            {/* Navigation Links */}
            <nav className="space-y-1.5" aria-label="Основная навигация">
              {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `group flex items-center justify-between px-3.5 py-2.5 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#1A1A1D] text-white'
                        : 'text-[#7A7A82] hover:text-white hover:bg-[#121214]'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className="flex items-center gap-3">
                        <Icon
                          className={`w-[18px] h-[18px] ${
                            isActive
                              ? 'text-white stroke-[2.2]'
                              : 'text-[#7A7A82] group-hover:text-white stroke-[1.8]'
                          }`}
                        />
                        <span>{label}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        {to === '/' && hasAnalyzingMeals && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E02424] opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#E02424]" />
                          </span>
                        )}
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#E02424]" />}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* User Footer Card */}
          {user && (
            <div className="space-y-3">
              <div className="nothing-dotted-divider" />
              <NavLink
                to="/profile"
                className="flex items-center gap-2.5 p-2 rounded-[18px] bg-[#1A1A1D] hover:bg-[#222226] transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-[#2A2A2F] flex items-center justify-center text-xs font-bold text-white shrink-0">
                  {(user.name?.[0] || user.email[0] || 'U').toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate my-0">
                    {user.name || user.email.split('@')[0]}
                  </p>
                  <p className="font-ndot text-[11px] text-[#7A7A82] truncate my-0 mt-0.5">
                    {user.daily_calories_goal || 2000} ККАЛ
                  </p>
                </div>
              </NavLink>
            </div>
          )}
        </aside>

        {/* ============================================================
            MOBILE DOCK (< 1024px):
            Docked Slide-Out Submenu Cartridge (Today only) + Full-Width Dock
            ============================================================ */}
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-3 pt-2 pointer-events-none"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
          aria-label="Мобильная навигация"
        >
          <div className="max-w-lg mx-auto relative">
            {/* Clip Container docked seamlessly into the top edge of the main bar */}
            <div
              className={`relative z-10 mx-5 sm:mx-6 -mb-3 overflow-hidden ${
                isQuickTrayInteractive ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
            >
              {/* Attached Slide-Out Quick-Input Submenu */}
              <div
                ref={trayRef}
                aria-hidden={!isQuickTrayInteractive}
                className="rounded-t-[20px] bg-[#131316]/98 border border-b-0 border-white/[0.09] shadow-[0_-6px_24px_rgba(0,0,0,0.65)] px-2 pt-2 pb-[18px] will-change-transform"
                style={{
                  transform: `translate3d(0, ${initialTuck * 105}%, 0)`,
                  transition: DOCK_SPRING,
                }}
              >
                <div className="grid grid-cols-4 gap-1.5">
                  {QUICK_INPUT_ACTIONS.map(({ mode, label, ariaLabel, icon: Icon, primary }) => (
                    <button
                      key={mode}
                      type="button"
                      tabIndex={isQuickTrayInteractive ? 0 : -1}
                      onClick={() => openAddMeal(null, mode)}
                      aria-label={ariaLabel}
                      className={`h-8 rounded-full flex items-center justify-center gap-1 text-[11px] font-semibold transition-colors cursor-pointer active:scale-95 focus:outline-none ${
                        primary
                          ? 'bg-[#E02424] hover:bg-[#C81E1E] text-white'
                          : 'bg-[#222227] hover:bg-[#2E2E35] text-[#E4E4E7] hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Main Full-Width Floating Matte Dock (z-20 in front of the docked submenu) */}
            <div className="relative z-20 w-full h-[58px] rounded-full bg-[#1A1A1D]/98 border border-white/[0.09] shadow-[0_12px_40px_rgba(0,0,0,0.9)] p-1.5 grid grid-cols-4 items-center pointer-events-auto">
              {/* Smooth Sliding Active Highlight + Red Micro-Dot */}
              <div
                ref={pillRef}
                aria-hidden="true"
                className="pointer-events-none absolute top-1.5 bottom-1.5 left-1.5 rounded-full bg-[#2E2E34] border border-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] flex items-end justify-center pb-1.5 will-change-transform"
                style={{
                  width: `calc((100% - 12px) / ${NAV_ITEMS.length})`,
                  transform: `translate3d(${activeIndex * 100}%, 0, 0)`,
                  transition: DOCK_SPRING,
                }}
              >
                <span className="w-1 h-1 rounded-full bg-[#E02424]" />
              </div>

              {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  aria-label={label}
                  className={({ isActive }) =>
                    `relative z-10 flex flex-col items-center justify-center h-[46px] rounded-full transition-colors duration-200 cursor-pointer select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30 ${
                      isActive ? 'text-white' : 'text-[#7A7A82] hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <div className="relative flex items-center justify-center -mt-1">
                      <Icon
                        className={`w-[20px] h-[20px] transition-transform duration-200 ${
                          isActive ? 'stroke-[2.2] scale-105' : 'stroke-[1.8]'
                        }`}
                      />
                      {to === '/' && hasAnalyzingMeals && (
                        <span className="absolute -top-1 -right-1.5 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E02424] opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#E02424]" />
                        </span>
                      )}
                    </div>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        </nav>
      </>
    )
  })
)

BottomNav.displayName = 'BottomNav'
