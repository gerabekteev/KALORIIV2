import React, { useState, useRef, useEffect } from 'react'
import {
  Plus,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from 'lucide-react'
import { Meal } from '../types'
import { useMeals } from '../hooks/useMeals'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { useMealsStore } from '../store/mealsStore'
import { MealList } from '../components/meals/MealList'
import { WeekStripCalendar } from '../components/meals/WeekStripCalendar'
import { pluralizeRu } from '../utils/pluralize'

function buildRoundedRectPath(w: number, h: number, inset: number, radius: number): string {
  const x = inset
  const y = inset
  const rw = Math.max(20, w - inset * 2)
  const rh = Math.max(20, h - inset * 2)
  const r = Math.min(radius, rw / 2, rh / 2)
  const cx = w / 2
  return [
    `M ${cx} ${y}`,
    `L ${x + rw - r} ${y}`,
    `A ${r} ${r} 0 0 1 ${x + rw} ${y + r}`,
    `L ${x + rw} ${y + rh - r}`,
    `A ${r} ${r} 0 0 1 ${x + rw - r} ${y + rh}`,
    `L ${x + r} ${y + rh}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + rh - r}`,
    `L ${x} ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    'Z',
  ].join(' ')
}

/**
 * Nothing X Flagship Concentric Soft-Oval Stadium Frame (chunky arcs, slightly squared ends)
 * Holds Calories / Protein / Fat & Carbs cleanly inside the spacious center.
 */
const NothingConcentricFrame: React.FC<{
  caloriesRatio: number
  proteinRatio: number
  carbsFatRatio: number
  children: React.ReactNode
}> = ({ caloriesRatio, proteinRatio, carbsFatRatio, children }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 340, h: 184 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setBox({ w: Math.round(rect.width), h: Math.round(rect.height) })
      }
    }
    update()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update)
      ro.observe(el)
      return () => ro.disconnect()
    }
  }, [])

  const cVal = caloriesRatio > 0 ? Math.max(0.025, Math.min(1, caloriesRatio)) : 0
  const pVal = proteinRatio > 0 ? Math.max(0.025, Math.min(1, proteinRatio)) : 0
  const cfVal = carbsFatRatio > 0 ? Math.max(0.025, Math.min(1, carbsFatRatio)) : 0

  // Big sweeping half-oval corners, uniformly concentric with identical stroke thickness
  const strokeW = 8.5
  const ringStep = 13.5 // 8.5px stroke + exact 5px dark gap between every ring
  const outerMaxR = Math.max(32, (box.h - 20) / 2)
  const rOuter = Math.round(outerMaxR * 0.72)
  const rMiddle = Math.max(20, rOuter - ringStep)
  const rInner = Math.max(12, rMiddle - ringStep)

  const outerPath = buildRoundedRectPath(box.w, box.h, 10, rOuter)
  const middlePath = buildRoundedRectPath(box.w, box.h, 10 + ringStep, rMiddle)
  const innerPath = buildRoundedRectPath(box.w, box.h, 10 + ringStep * 2, rInner)

  return (
    <div ref={containerRef} className="relative w-full select-none">
      <svg
        width={box.w}
        height={box.h}
        viewBox={`0 0 ${box.w} ${box.h}`}
        className="pointer-events-none absolute inset-0 w-full h-full overflow-visible"
        aria-hidden="true"
      >
        {/* Outer Track & Calories Fill (Nothing Red #E02424) */}
        <path
          d={outerPath}
          fill="none"
          stroke="#2A2A2F"
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {cVal > 0 ? (
          <path
            d={outerPath}
            fill="none"
            stroke="#E02424"
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={100}
            strokeDasharray={`${cVal * 100} 100`}
            className="transition-all duration-700 ease-out"
          />
        ) : (
          <circle cx={box.w / 2} cy={10} r="3.5" fill="#E02424" />
        )}

        {/* Middle Track & Protein Fill (Pure White #FFFFFF) */}
        <path
          d={middlePath}
          fill="none"
          stroke="#2A2A2F"
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {pVal > 0 && (
          <path
            d={middlePath}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={100}
            strokeDasharray={`${pVal * 100} 100`}
            className="transition-all duration-700 ease-out"
          />
        )}

        {/* Inner Track & Fat+Carbs Fill (Stone Gray #7A7A82) */}
        <path
          d={innerPath}
          fill="none"
          stroke="#2A2A2F"
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {cfVal > 0 && (
          <path
            d={innerPath}
            fill="none"
            stroke="#7A7A82"
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={100}
            strokeDasharray={`${cfVal * 100} 100`}
            className="transition-all duration-700 ease-out"
          />
        )}
      </svg>

      {/* 3 Core Macro Rows Centered Inside the Concentric Oval */}
      <div className="relative z-10 px-[52px] sm:px-[58px] py-[52px] sm:py-[54px]">
        {children}
      </div>
    </div>
  )
}

interface DaySnapshot {
  date: string
  meals: Meal[]
  totals: { calories: number; protein: number; fat: number; carbs: number }
}

const DAY_WIPE_DURATION_MS = 540
const DAY_WIPE_CLEANUP_MS = 570

export const TodayPage: React.FC = () => {
  const { user } = useAuthStore()
  const { openAddMeal } = useUIStore()
  const {
    meals,
    selectedDate,
    setSelectedDate,
    isLoading,
    totals,
    pendingMeals,
    goToToday,
  } = useMeals()

  const { previousDayMeals, copyMealToDate, copyMultipleMealsToDate } = useMealsStore()

  const [weeklyBank, setWeeklyBank] = useState<{
    balance: number
    isPositive: boolean
    trackedCount: number
  } | null>(null)
  const [showYesterdayList, setShowYesterdayList] = useState(false)

  // Continuous zero-jitter top-to-bottom Wipe on day switch
  const [dayWipe, setDayWipe] = useState<{
    id: number
    active: boolean
    prev: DaySnapshot | null
    next: DaySnapshot | null
  }>({
    id: 0,
    active: false,
    prev: null,
    next: null,
  })

  const committedDayRef = useRef<DaySnapshot | null>(null)
  const wipeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (wipeTimerRef.current) window.clearTimeout(wipeTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (isLoading) return

    const incoming: DaySnapshot = {
      date: selectedDate,
      meals,
      totals: { ...totals },
    }
    const previous = committedDayRef.current

    if (!previous) {
      committedDayRef.current = incoming
      return
    }

    if (previous.date !== incoming.date) {
      if (wipeTimerRef.current) window.clearTimeout(wipeTimerRef.current)
      committedDayRef.current = incoming

      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

      if (prefersReduced) {
        setDayWipe((w) => ({ id: w.id + 1, active: false, prev: null, next: incoming }))
        return
      }

      setDayWipe((w) => ({
        id: w.id + 1,
        active: true,
        prev: previous,
        next: incoming,
      }))

      wipeTimerRef.current = window.setTimeout(() => {
        setDayWipe((w) => ({ ...w, active: false, prev: null }))
        wipeTimerRef.current = null
      }, DAY_WIPE_CLEANUP_MS)
    } else {
      committedDayRef.current = incoming
      setDayWipe((w) => ({ ...w, next: incoming }))
    }
  }, [
    selectedDate,
    meals,
    totals.calories,
    totals.protein,
    totals.fat,
    totals.carbs,
    isLoading,
  ])

  const fallbackSnap: DaySnapshot = {
    date: selectedDate,
    meals,
    totals,
  }
  const activeSnap =
    isLoading && committedDayRef.current ? committedDayRef.current : dayWipe.next || fallbackSnap

  const isWipeActive = dayWipe.active && !!dayWipe.prev && !!dayWipe.next
  const showInitialSkeleton = isLoading && !committedDayRef.current

  const dailyGoalCalories = user?.daily_calories_goal || 2000
  const dailyGoalProtein = user?.daily_protein_goal || 140
  const dailyGoalFat = user?.daily_fat_goal || 70
  const dailyGoalCarbs = user?.daily_carbs_goal || 250

  const otherDatePendingCount = pendingMeals.filter(
    (p) => p.targetDate !== selectedDate && p.status === 'analyzing'
  ).length

  const breakfastMeals = previousDayMeals.filter(
    (m) => m.meal_time && m.meal_time >= '05:00' && m.meal_time < '12:00'
  )
  const breakfastCalories = Math.round(
    breakfastMeals.reduce((s, m) => s + (m.calories || 0), 0)
  )

  const renderDayContent = (snap: DaySnapshot, interactive: boolean) => {
    const t = snap.totals
    const isOver = t.calories > dailyGoalCalories
    const remCal = Math.max(dailyGoalCalories - t.calories, 0)
    const overCal = Math.max(t.calories - dailyGoalCalories, 0)
    const calRatio = dailyGoalCalories > 0 ? t.calories / dailyGoalCalories : 0
    const protRatio = dailyGoalProtein > 0 ? t.protein / dailyGoalProtein : 0
    const cfRatio =
      dailyGoalFat + dailyGoalCarbs > 0
        ? (t.fat + t.carbs) / (dailyGoalFat + dailyGoalCarbs)
        : 0

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 lg:gap-5 lg:items-start">
        {/* LEFT COLUMN (Mobile Top / Desktop Sticky Bento Summary) */}
        <div className="lg:col-span-5 lg:sticky lg:top-6 space-y-3.5">
          {/* Flagship Nothing X Hero Progress Card */}
          <div className="bg-[#1A1A1D] rounded-[24px] p-2.5 sm:p-3 space-y-2.5">
            <NothingConcentricFrame
              caloriesRatio={calRatio}
              proteinRatio={protRatio}
              carbsFatRatio={cfRatio}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                  <span className="flex items-center gap-2 text-[#F4F4F6] font-medium min-w-0">
                    <span className="w-2 h-2 rounded-full bg-[#E02424] shrink-0" />
                    <span className="truncate">Калории</span>
                  </span>
                  <span className="font-ndot text-base sm:text-lg font-bold tracking-wider shrink-0">
                    <span className={isOver ? 'text-[#E02424]' : 'text-white'}>
                      {Math.round(t.calories)}
                    </span>
                    <span className="text-[#7A7A82]">/{dailyGoalCalories}</span>
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                  <span className="flex items-center gap-2 text-[#E4E4E7] min-w-0">
                    <span className="w-2 h-2 rounded-full bg-white shrink-0" />
                    <span className="truncate">Белки</span>
                  </span>
                  <span className="font-ndot text-sm sm:text-base font-bold tracking-wider shrink-0">
                    <span className="text-white">{Math.round(t.protein)}</span>
                    <span className="text-[#7A7A82]">/{dailyGoalProtein}</span>
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                  <span className="flex items-center gap-2 text-[#A1A1AA] min-w-0">
                    <span className="w-2 h-2 rounded-full bg-[#7A7A82] shrink-0" />
                    <span className="truncate">Жиры · Угл.</span>
                  </span>
                  <span className="font-ndot text-xs sm:text-sm font-bold tracking-wider shrink-0">
                    <span className="text-[#E4E4E7]">{Math.round(t.fat)}</span>
                    <span className="text-[#6E6E75]">/{dailyGoalFat}</span>
                    <span className="text-[#52525B] mx-1">·</span>
                    <span className="text-[#E4E4E7]">{Math.round(t.carbs)}</span>
                    <span className="text-[#6E6E75]">/{dailyGoalCarbs}</span>
                  </span>
                </div>
              </div>
            </NothingConcentricFrame>

            <div className="px-2 pb-1 space-y-2">
              <div className="nothing-dotted-divider" />

              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-[#7A7A82] font-medium">
                  {isOver ? 'Превышение нормы' : 'Осталось на сегодня'}
                </span>
                <span
                  className={`font-ndot text-base font-bold ${
                    isOver ? 'text-[#E02424]' : 'text-white'
                  }`}
                >
                  {isOver ? `+${Math.round(overCal)}` : Math.round(remCal)}{' '}
                  <span className="font-sans text-[11px] font-normal text-[#7A7A82]">ккал</span>
                </span>
              </div>

              {isOver && weeklyBank && weeklyBank.balance > 0 && (
                <div className="flex items-center justify-between text-[11px] text-[#E4E4E7] bg-[#111113] rounded-xl px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-white shrink-0" />
                    <span>Покрыто запасом недели</span>
                  </span>
                  <span className="font-ndot font-bold text-white">+{weeklyBank.balance}</span>
                </div>
              )}
            </div>
          </div>

          {/* Compact Yesterday Repeat Pill (only shown when yesterday had meals) */}
          {previousDayMeals.length > 0 && (
            <div className="bg-[#1A1A1D] rounded-[20px] px-4 py-3 flex items-center justify-between gap-2">
              {breakfastMeals.length > 0 ? (
                <button
                  type="button"
                  onClick={() => interactive && copyMultipleMealsToDate(breakfastMeals.map((m) => m.id))}
                  className="flex items-center gap-2.5 min-w-0 text-left group cursor-pointer active:scale-[0.98] transition-transform"
                >
                  <span className="w-8 h-8 rounded-full bg-[#2A2A2F] flex items-center justify-center text-[#E02424] shrink-0">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white truncate">
                      Повторить завтрак ({breakfastMeals.length})
                    </div>
                    <div className="font-ndot text-[11px] text-[#7A7A82]">
                      {breakfastCalories} ккал · со вчера
                    </div>
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => interactive && copyMealToDate(previousDayMeals[0].id)}
                  className="flex items-center gap-2.5 min-w-0 text-left group cursor-pointer active:scale-[0.98] transition-transform"
                >
                  <span className="w-8 h-8 rounded-full bg-[#2A2A2F] flex items-center justify-center text-[#E02424] shrink-0">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white truncate">
                      {previousDayMeals[0].name}
                    </div>
                    <div className="font-ndot text-[11px] text-[#7A7A82]">
                      {Math.round(previousDayMeals[0].calories)} ккал · со вчера
                    </div>
                  </div>
                </button>
              )}

              <button
                type="button"
                onClick={() => interactive && setShowYesterdayList((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[#111113] text-[11px] text-[#A1A1AA] hover:text-white cursor-pointer transition-colors shrink-0"
              >
                <span className="font-ndot">{previousDayMeals.length}</span>
                {showYesterdayList ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          )}

          {/* Expandable Full Yesterday Dishes Drawer */}
          {showYesterdayList && previousDayMeals.length > 0 && (
            <div className="bg-[#1A1A1D] rounded-[22px] p-3.5 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-white flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-[#E02424]" />
                  <span>Вчерашние блюда</span>
                </span>
                <button
                  type="button"
                  onClick={() => interactive && setShowYesterdayList(false)}
                  className="text-[11px] text-[#7A7A82] hover:text-white cursor-pointer"
                >
                  Свернуть
                </button>
              </div>
              <div className="nothing-dotted-divider" />
              <div className="grid grid-cols-1 gap-1.5">
                {previousDayMeals.map((meal) => (
                  <button
                    key={meal.id}
                    type="button"
                    onClick={() => interactive && copyMealToDate(meal.id)}
                    className="w-full flex items-center justify-between py-2 px-3 rounded-xl bg-[#111113] hover:bg-[#222226] text-left transition-colors cursor-pointer active:scale-[0.99] min-w-0"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                      <Plus className="w-3.5 h-3.5 text-[#E02424] shrink-0" />
                      <span className="text-xs font-medium text-[#E4E4E7] truncate">
                        {meal.name}
                      </span>
                    </div>
                    <span className="font-ndot text-xs font-bold text-white shrink-0">
                      {Math.round(meal.calories)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (Meals Feed) */}
        <div className="lg:col-span-7 space-y-3">
          <MealList meals={snap.meals} isLoading={interactive ? showInitialSkeleton : false} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-16 lg:pb-0">
      {/* Desktop Top Header */}
      <div className="hidden lg:flex items-end justify-between pb-1">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white my-0">Сегодня</h1>
          <p className="text-xs text-[#7A7A82] mt-0.5 my-0">
            Дневник питания, КБЖУ и быстрый ввод
          </p>
        </div>
        <button
          type="button"
          onClick={() => openAddMeal()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white hover:bg-neutral-200 text-black text-xs font-semibold transition-colors cursor-pointer active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Записать блюдо</span>
        </button>
      </div>

      {/* Other-date AI pending banner */}
      {otherDatePendingCount > 0 && (
        <div className="flex items-center justify-between bg-[#1A1A1D] border border-white/[0.08] rounded-[18px] px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2.5 text-white">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E02424] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#E02424]" />
            </span>
            <span>
              AI в фоне анализирует {otherDatePendingCount}{' '}
              {pluralizeRu(otherDatePendingCount, ['блюдо', 'блюда', 'блюд'])}...
            </span>
          </div>
          <button
            type="button"
            onClick={goToToday}
            className="text-xs font-semibold text-white underline underline-offset-4 cursor-pointer"
          >
            К сегодня
          </button>
        </div>
      )}

      {/* 1. Week Strip Calendar */}
      <WeekStripCalendar
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        currentDayCalories={totals.calories}
        dailyGoalCalories={dailyGoalCalories}
        onWeeklyBankChange={setWeeklyBank}
      />

      {/* Top-to-Bottom Zero-Jitter Wipe Container */}
      <div
        className="relative overflow-hidden rounded-[24px]"
        style={{ '--wipe-duration': `${DAY_WIPE_DURATION_MS}ms` } as React.CSSProperties}
      >
        {isWipeActive && dayWipe.prev
          ? renderDayContent(dayWipe.prev, false)
          : renderDayContent(activeSnap, true)}

        {isWipeActive && dayWipe.next && (
          <>
            <div
              key={`today-wipe-layer-${dayWipe.id}`}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-20 bg-black wave-mode-wipe-reveal"
            >
              {renderDayContent(dayWipe.next, false)}
            </div>
            <div
              key={`today-wipe-line-${dayWipe.id}`}
              aria-hidden="true"
              className="wave-mode-wipe-line"
            />
          </>
        )}
      </div>
    </div>
  )
}
