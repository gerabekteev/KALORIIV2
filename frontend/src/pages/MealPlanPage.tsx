import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ChefHat,
  Sparkles,
  Calendar,
  Pin,
  RefreshCw,
  Check,
  Plus,
  Layers,
  ShieldCheck,
  RotateCcw,
  ShoppingCart,
  Send,
  Scale,
  CheckSquare,
  Square,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Zap,
  Flame,
  Utensils,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useMealsStore, getTodayDateString } from '../store/mealsStore'
import { useMealPlanStore } from '../store/mealPlanStore'
import { useUIStore } from '../store/uiStore'
import { mealsApi } from '../api/meals'
import { statsApi } from '../api/stats'
import { telegramApi } from '../api/telegram'
import { generateGroceryListFromItems, GroceryItem } from '../utils/groceryList'
import { PlannedMealItem } from '../types'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { pluralizeRu } from '../utils/pluralize'

const QUICK_PREFERENCE_TAGS = [
  'Быстро до 15 мин',
  'Из простых продуктов',
  'Без готовки',
  'Максимум белка',
  'Без рыбы',
  'Без лактозы',
  'Сладкое ПП к чаю',
]

function getTomorrowDateString(): string {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const MealPlanPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const { addMeal } = useMealsStore()
  const { addToast } = useUIStore()
  const {
    planDate,
    plansByDate,
    isGenerating,
    setPlanDate,
    fetchPlanForDate,
    generatePlan,
    toggleLockMeal,
    markMealAddedToDiary,
  } = useMealPlanStore()

  const todayStr = getTodayDateString()
  const tomorrowStr = getTomorrowDateString()

  const currentPlan = plansByDate[planDate] || null

  // Параметры формы генерации
  const [mealsCount, setMealsCount] = useState<number>(1)
  const [targetCalories, setTargetCalories] = useState<string>('600')
  const [targetProtein, setTargetProtein] = useState<string>('45')
  const [targetFat, setTargetFat] = useState<string>('20')
  const [targetCarbs, setTargetCarbs] = useState<string>('55')
  const [preferences, setPreferences] = useState<string>('')
  const [showAdvancedConfig, setShowAdvancedConfig] = useState<boolean>(false)
  const [activeScenario, setActiveScenario] = useState<'single' | 'protein' | 'remaining' | 'fullday'>('single')

  // Информация о съеденном за выбранный день для подсказки остатка
  const [eatenStats, setEatenStats] = useState<{
    calories: number
    protein: number
    fat: number
    carbs: number
  }>({ calories: 0, protein: 0, fat: 0, carbs: 0 })

  const [addingMealId, setAddingMealId] = useState<string | null>(null)
  const handledPresetRef = useRef<string | null>(null)

  const goalCal = user?.daily_calories_goal || 2000
  const goalProt = user?.daily_protein_goal || 140
  const goalFat = user?.daily_fat_goal || 70
  const goalCarbs = user?.daily_carbs_goal || 250

  const remCalActual = Math.max(0, goalCal - eatenStats.calories)
  const remProtActual = Math.max(0, goalProt - eatenStats.protein)
  const remFatActual = Math.max(0, goalFat - eatenStats.fat)
  const remCarbsActual = Math.max(0, goalCarbs - eatenStats.carbs)

  // Синхронизация даты из URL-параметра при переходе с главной
  useEffect(() => {
    const dateParam = searchParams.get('date')
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam !== planDate) {
      setPlanDate(dateParam)
    }
  }, [searchParams, planDate, setPlanDate])

  // Подгружаем сохранённый план и остаток КБЖУ при смене даты
  useEffect(() => {
    let active = true

    async function loadDayContext() {
      const savedPlan = await fetchPlanForDate(planDate)
      try {
        const daySummary = await mealsApi.getMeals(planDate)
        if (!active) return

        const eatenCal = Math.round(daySummary.total_calories || 0)
        const eatenProt = Math.round(daySummary.total_protein || 0)
        const eatenFat = Math.round(daySummary.total_fat || 0)
        const eatenCarbs = Math.round(daySummary.total_carbs || 0)

        setEatenStats({
          calories: eatenCal,
          protein: eatenProt,
          fat: eatenFat,
          carbs: eatenCarbs,
        })

        const remCal = Math.max(200, goalCal - eatenCal)
        const remProt = Math.max(15, goalProt - eatenProt)
        const remFat = Math.max(10, goalFat - eatenFat)
        const remCarbs = Math.max(15, goalCarbs - eatenCarbs)

        const presetParam = searchParams.get('preset')
        const presetKey = presetParam ? `${planDate}:${presetParam}` : null

        if (presetParam && handledPresetRef.current !== presetKey) {
          handledPresetRef.current = presetKey
          // Очищаем query-параметр, чтобы не перезапускать при ручном обновлении
          const nextParams = new URLSearchParams(searchParams)
          nextParams.delete('preset')
          setSearchParams(nextParams, { replace: true })

          if (presetParam === 'single') {
            setActiveScenario('single')
            setMealsCount(1)
            setTargetCalories(String(remCal))
            setTargetProtein(String(remProt))
            setTargetFat(String(remFat))
            setTargetCarbs(String(remCarbs))
            const pref = 'Сытное блюдо на ужин или перекус из простых продуктов под остаток КБЖУ'
            setPreferences(pref)
            await generatePlan({
              planDate,
              mealsCount: 1,
              targetCalories: remCal,
              targetProtein: remProt,
              targetFat: remFat,
              targetCarbs: remCarbs,
              userPreferences: pref,
              onlyUnlocked: false,
            })
            return
          } else if (presetParam === 'protein') {
            setActiveScenario('protein')
            setMealsCount(1)
            const protTarget = Math.max(30, remProt)
            const calTarget = Math.max(250, Math.min(remCal, protTarget * 9))
            const fatTarget = Math.max(8, Math.min(remFat, 18))
            const carbsTarget = Math.max(10, Math.min(remCarbs, 35))
            const pref = 'Максимум белка, минимум жиров, быстрое блюдо из простых продуктов'
            setTargetCalories(String(calTarget))
            setTargetProtein(String(protTarget))
            setTargetFat(String(fatTarget))
            setTargetCarbs(String(carbsTarget))
            setPreferences(pref)
            await generatePlan({
              planDate,
              mealsCount: 1,
              targetCalories: calTarget,
              targetProtein: protTarget,
              targetFat: fatTarget,
              targetCarbs: carbsTarget,
              userPreferences: pref,
              onlyUnlocked: false,
            })
            return
          } else if (presetParam === 'remaining') {
            setActiveScenario('remaining')
            const count = remCal > 750 ? 2 : 1
            setMealsCount(count)
            setTargetCalories(String(remCal))
            setTargetProtein(String(remProt))
            setTargetFat(String(remFat))
            setTargetCarbs(String(remCarbs))
            await generatePlan({
              planDate,
              mealsCount: count,
              targetCalories: remCal,
              targetProtein: remProt,
              targetFat: remFat,
              targetCarbs: remCarbs,
              userPreferences: preferences || 'Из простых доступных продуктов',
              onlyUnlocked: false,
            })
            return
          }
        }

        // Если на этот день уже есть сохранённый план, подставляем его настройки
        if (savedPlan) {
          setMealsCount(savedPlan.meals_count || 1)
          setTargetCalories(String(Math.round(savedPlan.target_calories)))
          setTargetProtein(String(Math.round(savedPlan.target_protein)))
          setTargetFat(String(Math.round(savedPlan.target_fat)))
          setTargetCarbs(String(Math.round(savedPlan.target_carbs)))
          setPreferences(savedPlan.user_preferences || '')
        } else {
          // Автоматически подставляем остаток КБЖУ пользователя на выбранный день
          const rawRemCal = Math.max(0, goalCal - eatenCal)
          const isSingleMealConvenient = rawRemCal > 0 && rawRemCal <= 850
          setMealsCount(isSingleMealConvenient ? 1 : rawRemCal > 850 ? 2 : 3)
          setActiveScenario(isSingleMealConvenient ? 'single' : rawRemCal >= 200 ? 'remaining' : 'fullday')
          setTargetCalories(String(rawRemCal >= 200 ? rawRemCal : goalCal))
          setTargetProtein(String(rawRemCal >= 200 ? Math.max(15, goalProt - eatenProt) : goalProt))
          setTargetFat(String(rawRemCal >= 200 ? Math.max(10, goalFat - eatenFat) : goalFat))
          setTargetCarbs(String(rawRemCal >= 200 ? Math.max(15, goalCarbs - eatenCarbs) : goalCarbs))
        }
      } catch {
        // Fallback на дневные нормы
      }
    }

    loadDayContext()
    return () => {
      active = false
    }
  }, [planDate, goalCal, goalProt, goalFat, goalCarbs])

  const [isShoppingListOpen, setIsShoppingListOpen] = useState(false)
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([])
  const [isSendingTelegram, setIsSendingTelegram] = useState(false)

  // Быстрый запуск сценария в 1 клик
  const handleRunSmartScenario = async (scenario: 'single' | 'protein' | 'remaining' | 'fullday') => {
    setActiveScenario(scenario)
    const remCal = Math.max(220, goalCal - eatenStats.calories)
    const remProt = Math.max(15, goalProt - eatenStats.protein)
    const remFat = Math.max(10, goalFat - eatenStats.fat)
    const remCarbs = Math.max(15, goalCarbs - eatenStats.carbs)

    let nextCount = 1
    let nextCal = remCal
    let nextProt = remProt
    let nextFat = remFat
    let nextCarbs = remCarbs
    let nextPref = preferences

    if (scenario === 'single') {
      nextCount = 1
      nextCal = remCal
      nextProt = remProt
      nextFat = remFat
      nextCarbs = remCarbs
      if (!nextPref.trim()) {
        nextPref = 'Сытное блюдо на ужин или перекус из простых продуктов'
      }
    } else if (scenario === 'protein') {
      nextCount = 1
      nextProt = Math.max(30, remProt)
      nextCal = Math.max(250, Math.min(remCal, nextProt * 9))
      nextFat = Math.max(8, Math.min(remFat, 18))
      nextCarbs = Math.max(10, Math.min(remCarbs, 35))
      nextPref = 'Максимум белка, минимум жиров, быстрое блюдо из простых продуктов'
    } else if (scenario === 'remaining') {
      nextCount = remCal > 700 ? 2 : 1
      nextCal = remCal
      nextProt = remProt
      nextFat = remFat
      nextCarbs = remCarbs
    } else if (scenario === 'fullday') {
      nextCount = 3
      nextCal = goalCal
      nextProt = goalProt
      nextFat = goalFat
      nextCarbs = goalCarbs
    }

    setMealsCount(nextCount)
    setTargetCalories(String(nextCal))
    setTargetProtein(String(nextProt))
    setTargetFat(String(nextFat))
    setTargetCarbs(String(nextCarbs))
    setPreferences(nextPref)

    await generatePlan({
      planDate,
      mealsCount: nextCount,
      targetCalories: nextCal,
      targetProtein: nextProt,
      targetFat: nextFat,
      targetCarbs: nextCarbs,
      userPreferences: nextPref,
      onlyUnlocked: false,
    })
  }

  const handleToggleQuickPreference = (tagLabel: string) => {
    const cleanTag = tagLabel.replace(/^[^\p{L}\p{N}]+\s*/u, '').trim()
    const current = preferences.trim()
    if (current.toLowerCase().includes(cleanTag.toLowerCase())) {
      const parts = current
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.toLowerCase() !== cleanTag.toLowerCase() && p.length > 0)
      setPreferences(parts.join(', '))
    } else {
      setPreferences(current ? `${current}, ${cleanTag}` : cleanTag)
    }
  }

  const handleFillRemaining = () => {
    const remCal = Math.max(200, goalCal - eatenStats.calories)
    const remProt = Math.max(10, goalProt - eatenStats.protein)
    const remFat = Math.max(10, goalFat - eatenStats.fat)
    const remCarbs = Math.max(10, goalCarbs - eatenStats.carbs)
    setTargetCalories(String(remCal))
    setTargetProtein(String(remProt))
    setTargetFat(String(remFat))
    setTargetCarbs(String(remCarbs))
    addToast('Подставлен остаток КБЖУ на выбранный день', 'info', 2000)
  }

  const handleFillFullDayGoal = () => {
    setTargetCalories(String(goalCal))
    setTargetProtein(String(goalProt))
    setTargetFat(String(goalFat))
    setTargetCarbs(String(goalCarbs))
    addToast('Подставлена полная дневная норма КБЖУ', 'info', 2000)
  }

  // Elastic Weekly Calorie Bank balancer (GC-02)
  const handleBalanceWeek = async () => {
    try {
      const [y, m, d] = planDate.split('-').map(Number)
      const dateObj = new Date(y, m - 1, d)
      const dayOfWeek = dateObj.getDay() // 0 = Sun, 1 = Mon .. 6 = Sat
      const diffToMonday = dateObj.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
      const monday = new Date(y, m - 1, diffToMonday)
      const fmt = (dt: Date) =>
        `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      const weekDates = Array.from({ length: 7 }, (_, i) =>
        fmt(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i))
      )
      const stats = await statsApi.getStats('custom', weekDates[0], weekDates[6])
      const trackedPriorDays = (stats.daily_stats || []).filter(
        (item) => item.date < planDate && item.calories > 0
      )
      const netBankPrior = trackedPriorDays.reduce(
        (acc, item) => acc + (goalCal - item.calories),
        0
      )
      const dayIndex = Math.max(0, weekDates.indexOf(planDate)) // 0..6
      const remainingDaysInWeek = Math.max(1, 7 - dayIndex)
      const balancedDaily = Math.max(
        1000,
        Math.min(4500, Math.round(goalCal + netBankPrior / remainingDaysInWeek))
      )
      const remToday = Math.max(200, balancedDaily - eatenStats.calories)

      setTargetCalories(String(remToday))
      addToast(
        `С учётом банка недели норма на день: ${balancedDaily} ккал (остаток: ${remToday} ккал)`,
        'success',
        3500
      )
    } catch {
      addToast('Не удалось загрузить данные за неделю для балансировки', 'warning')
    }
  }

  // Smart Grocery List (GC-01)
  const handleOpenShoppingList = () => {
    if (!currentPlan) return
    const allIngredients: Array<{ name: string; weightGrams?: number }> = []
    currentPlan.meals.forEach((m) => {
      if (m.ingredients && m.ingredients.length > 0) {
        m.ingredients.forEach((ing) => {
          allIngredients.push({ name: ing.name, weightGrams: ing.weight_grams })
        })
      } else {
        allIngredients.push({ name: m.name, weightGrams: m.weight_grams })
      }
    })

    const generated = generateGroceryListFromItems(allIngredients)
    setGroceryItems(generated)
    setIsShoppingListOpen(true)
  }

  const handleToggleGroceryItem = (id: string) => {
    setGroceryItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item))
    )
  }

  const handleSendToTelegram = async () => {
    if (groceryItems.length === 0) {
      addToast('Список покупок пуст', 'warning')
      return
    }

    setIsSendingTelegram(true)
    try {
      const res = await telegramApi.sendShoppingList({
        items: groceryItems.map((g) => ({
          name: g.name,
          total_grams: g.totalGrams,
          category: g.category,
          checked: g.checked,
        })),
        notes: `План питания на ${planDate}`,
      })
      addToast(res.message || 'Список покупок успешно отправлен в Telegram!', 'success', 4000)
      setIsShoppingListOpen(false)
    } catch (err: any) {
      const msg = err?.message || 'Не удалось отправить список в Telegram. Проверьте привязку бота в профиле.'
      addToast(msg, 'error', 4500)
    } finally {
      setIsSendingTelegram(false)
    }
  }

  const handleGenerate = async (onlyUnlocked: boolean) => {
    const cal = parseFloat(targetCalories) || 0
    if (cal < 100) {
      addToast('Укажите лимит калорий не менее 100 ккал', 'warning')
      return
    }

    await generatePlan({
      planDate,
      mealsCount,
      targetCalories: cal,
      targetProtein: parseFloat(targetProtein) || 0,
      targetFat: parseFloat(targetFat) || 0,
      targetCarbs: parseFloat(targetCarbs) || 0,
      userPreferences: preferences,
      onlyUnlocked,
    })
  }

  const resolvePlannedMealTime = (label: string, index: number): string => {
    const low = (label || '').toLowerCase()
    if (low.includes('завтрак') || low.includes('приём пищи 1')) return '09:00'
    if (low.includes('обед') || low.includes('приём пищи 2')) return '13:30'
    if (low.includes('перекус')) return '17:00'
    if (low.includes('ужин') || low.includes('приём пищи 3')) return '19:30'
    const fallbackTimes = ['09:00', '13:30', '17:00', '19:30', '21:00', '22:00']
    return fallbackTimes[index % fallbackTimes.length]
  }

  const handleAddMealToDiary = async (item: PlannedMealItem, index: number = 0) => {
    setAddingMealId(item.id)
    try {
      await addMeal({
        name: item.name,
        calories: Math.round(item.calories),
        protein: Math.round(item.protein * 10) / 10,
        fat: Math.round(item.fat * 10) / 10,
        carbs: Math.round(item.carbs * 10) / 10,
        weight_grams: Math.round(item.weight_grams),
        ingredients: item.ingredients || [],
        user_comment: `Из AI-плана питания (${item.meal_label})`,
        meal_date: planDate,
        meal_time: resolvePlannedMealTime(item.meal_label, index),
        is_manually_edited: false,
      })
      await markMealAddedToDiary(planDate, item.id)
      addToast(`«${item.name}» добавлено в съеденное за ${planDate}!`, 'success', 3000)
    } catch {
      addToast('Не удалось добавить блюдо в дневник', 'error')
    } finally {
      setAddingMealId(null)
    }
  }

  const lockedCount = currentPlan?.meals.filter((m) => m.locked).length || 0

  return (
    <div className="space-y-4">
      {/* Header & Date Switcher */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2 my-0">
            <ChefHat className="w-5 h-5 text-emerald-400" />
            <span>AI-Ассистент: Что съесть?</span>
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Подбор 1 блюда на ужин или рациона под ваш точный остаток БЖУ
          </p>
        </div>

        {/* Compact Date Switcher */}
        <div className="flex items-center gap-1 bg-[#141418] border border-white/[0.07] p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setPlanDate(todayStr)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
              planDate === todayStr
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Сегодня
          </button>
          <button
            type="button"
            onClick={() => setPlanDate(tomorrowStr)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
              planDate === tomorrowStr
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Завтра
          </button>
        </div>
      </div>

      {/* Live Remaining KBJU Status Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-950/50 via-[#151c19] to-[#141418] border border-emerald-500/25 p-3.5 shadow-lg">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-emerald-300/90 uppercase tracking-wider block">
                Свободный остаток на {planDate === todayStr ? 'сегодня' : planDate === tomorrowStr ? 'завтра' : planDate}
              </span>
              <div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
                <span className="text-lg font-extrabold text-white tracking-tight">
                  {remCalActual} <span className="text-xs font-semibold text-neutral-400">ккал</span>
                </span>
                <span className="text-[11px] text-neutral-500">
                  (съедено {eatenStats.calories} из {goalCal})
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] font-bold text-blue-300">
              Б: {remProtActual}г
            </span>
            <span className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] font-bold text-amber-300">
              Ж: {remFatActual}г
            </span>
            <span className="px-2 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[11px] font-bold text-purple-300">
              У: {remCarbsActual}г
            </span>
          </div>
        </div>
      </div>

      {/* Instant 1-Click Smart Scenarios */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>Быстрый подбор в 1 нажатие:</span>
          </span>
          <span className="text-[11px] text-neutral-500">Нажмите карточку для старта AI</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={isGenerating}
            onClick={() => handleRunSmartScenario('single')}
            className={`text-left p-3 rounded-2xl border transition-all cursor-pointer group relative overflow-hidden ${
              activeScenario === 'single'
                ? 'bg-emerald-500/15 border-emerald-500/50 shadow-[0_8px_25px_-6px_rgba(16,185,129,0.25)]'
                : 'bg-[#151519] border-white/[0.07] hover:border-emerald-500/30 hover:bg-[#19191f]'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                <Utensils className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300">
                1 блюдо
              </span>
            </div>
            <div className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
              На ужин / перекус
            </div>
            <div className="text-[11px] text-neutral-400 mt-0.5 truncate">
              Под остаток {Math.max(220, remCalActual)} ккал
            </div>
          </button>

          <button
            type="button"
            disabled={isGenerating}
            onClick={() => handleRunSmartScenario('protein')}
            className={`text-left p-3 rounded-2xl border transition-all cursor-pointer group relative overflow-hidden ${
              activeScenario === 'protein'
                ? 'bg-blue-500/15 border-blue-500/50 shadow-[0_8px_25px_-6px_rgba(59,130,246,0.25)]'
                : 'bg-[#151519] border-white/[0.07] hover:border-blue-500/30 hover:bg-[#19191f]'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center text-blue-400">
                <Flame className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-300">
                Белковый буст
              </span>
            </div>
            <div className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors">
              Добрать белок
            </div>
            <div className="text-[11px] text-neutral-400 mt-0.5 truncate">
              Цель ~{Math.max(30, remProtActual)}г белка, мин. жиров
            </div>
          </button>

          <button
            type="button"
            disabled={isGenerating}
            onClick={() => handleRunSmartScenario('remaining')}
            className={`text-left p-3 rounded-2xl border transition-all cursor-pointer group relative overflow-hidden ${
              activeScenario === 'remaining'
                ? 'bg-emerald-500/15 border-emerald-500/50 shadow-[0_8px_25px_-6px_rgba(16,185,129,0.25)]'
                : 'bg-[#151519] border-white/[0.07] hover:border-emerald-500/30 hover:bg-[#19191f]'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-emerald-400">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-neutral-800 text-neutral-300">
                2 блюда
              </span>
            </div>
            <div className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
              На остаток дня
            </div>
            <div className="text-[11px] text-neutral-400 mt-0.5 truncate">
              Обед + ужин на {Math.max(220, remCalActual)} ккал
            </div>
          </button>

          <button
            type="button"
            disabled={isGenerating}
            onClick={() => handleRunSmartScenario('fullday')}
            className={`text-left p-3 rounded-2xl border transition-all cursor-pointer group relative overflow-hidden ${
              activeScenario === 'fullday'
                ? 'bg-emerald-500/15 border-emerald-500/50 shadow-[0_8px_25px_-6px_rgba(16,185,129,0.25)]'
                : 'bg-[#151519] border-white/[0.07] hover:border-emerald-500/30 hover:bg-[#19191f]'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-emerald-400">
                <Calendar className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-neutral-800 text-neutral-300">
                3 блюда
              </span>
            </div>
            <div className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
              Полный рацион
            </div>
            <div className="text-[11px] text-neutral-400 mt-0.5 truncate">
              Весь день на {goalCal} ккал
            </div>
          </button>
        </div>
      </div>

      {/* Main Generator Card with Quick Preference Chips & Collapsible Fine-Tuning */}
      <Card variant="default" padding="md" className="space-y-3.5">
        {/* Quick Preference Chips */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-200 block">
            Пожелания к блюдам (нажмите или допишите свои):
          </label>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PREFERENCE_TAGS.map((tag) => {
              const cleanTag = tag.replace(/^[^\p{L}\p{N}]+\s*/u, '').trim()
              const isSelected = preferences.toLowerCase().includes(cleanTag.toLowerCase())
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleToggleQuickPreference(tag)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-[#121216] border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
                  }`}
                >
                  {tag}
                </button>
              )
            })}
          </div>

          <input
            type="text"
            placeholder="Свои пожелания: например, есть творог и яйца, без духовки..."
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            className="w-full bg-[#121216] border border-neutral-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Collapsible Fine-Tuning Toggle */}
        <div className="border-t border-neutral-800/80 pt-2.5">
          <button
            type="button"
            onClick={() => setShowAdvancedConfig((v) => !v)}
            className="w-full flex items-center justify-between text-xs text-neutral-300 hover:text-white py-1 cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                Точная настройка:{' '}
                <b className="text-white">
                  {mealsCount} {pluralizeRu(mealsCount, ['блюдо', 'блюда', 'блюд'])}
                </b>{' '}
                • лимит <b className="text-emerald-400">{targetCalories} ккал</b> (Б:{targetProtein} Ж:{targetFat} У:{targetCarbs})
              </span>
            </span>
            {showAdvancedConfig ? (
              <ChevronUp className="w-4 h-4 text-neutral-400 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
            )}
          </button>

          {showAdvancedConfig && (
            <div className="space-y-3.5 pt-3 mt-2 border-t border-neutral-800/60 animate-in fade-in duration-150">
              {/* Custom Date Picker */}
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Дата плана:</span>
                </label>
                <input
                  type="date"
                  value={planDate}
                  onChange={(e) => e.target.value && setPlanDate(e.target.value)}
                  className="bg-[#121216] border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>

              {/* Number of Meals Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-300 block">
                  Количество блюд:
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setMealsCount(cnt)}
                      className={`py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        mealsCount === cnt
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm'
                          : 'bg-[#121216] border-neutral-800 text-neutral-400 hover:text-white'
                      }`}
                    >
                      {cnt} {pluralizeRu(cnt, ['блюдо', 'блюда', 'блюд'])}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target KBJU Inputs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="text-xs font-medium text-neutral-300">
                    Целевые КБЖУ:
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={handleBalanceWeek}
                      className="text-[10px] font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/20 cursor-pointer flex items-center gap-1"
                      title="Сбалансировать остаток недельного бюджета калорий"
                    >
                      <Scale className="w-2.5 h-2.5" />
                      <span>Баланс недели</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleFillRemaining}
                      className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20 cursor-pointer"
                    >
                      Остаток ({remCalActual} ккал)
                    </button>
                    <button
                      type="button"
                      onClick={handleFillFullDayGoal}
                      className="text-[10px] font-medium text-neutral-400 hover:text-white bg-neutral-800 px-2 py-0.5 rounded-lg cursor-pointer"
                    >
                      Вся норма ({goalCal} ккал)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Input
                    label="Макс. Калории *"
                    type="number"
                    min="100"
                    max="15000"
                    value={targetCalories}
                    onChange={(e) => setTargetCalories(e.target.value)}
                  />
                  <Input
                    label="Белки (г)"
                    type="number"
                    min="0"
                    value={targetProtein}
                    onChange={(e) => setTargetProtein(e.target.value)}
                  />
                  <Input
                    label="Жиры (г)"
                    type="number"
                    min="0"
                    value={targetFat}
                    onChange={(e) => setTargetFat(e.target.value)}
                  />
                  <Input
                    label="Углеводы (г)"
                    type="number"
                    min="0"
                    value={targetCarbs}
                    onChange={(e) => setTargetCarbs(e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/90 bg-emerald-950/30 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>
                    AI строго <b>не выйдет за предел {targetCalories || 0} ккал</b> и укажет граммовки.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons: Generate All vs Regenerate Unlocked */}
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          {lockedCount > 0 && currentPlan ? (
            <>
              <Button
                type="button"
                className="flex-1"
                size="md"
                isLoading={isGenerating}
                onClick={() => handleGenerate(true)}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Заменить незакреплённые (оставить {lockedCount})
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                disabled={isGenerating}
                onClick={() => handleGenerate(false)}
                leftIcon={<RotateCcw className="w-4 h-4" />}
              >
                Всё заново
              </Button>
            </>
          ) : (
            <Button
              type="button"
              className="w-full"
              size="lg"
              isLoading={isGenerating}
              onClick={() => handleGenerate(false)}
              leftIcon={<Sparkles className="w-4 h-4" />}
            >
              {currentPlan
                ? `Подобрать другие варианты (${mealsCount} ${pluralizeRu(mealsCount, ['блюдо', 'блюда', 'блюд'])})`
                : `Подобрать ${mealsCount} ${pluralizeRu(mealsCount, ['блюдо', 'блюда', 'блюд'])} на ${targetCalories} ккал`}
            </Button>
          )}
        </div>
      </Card>

      {/* Step 2: Generated Meal Plan Result */}
      {currentPlan && currentPlan.meals.length > 0 && (
        <div className="space-y-3 animate-in fade-in duration-200">
          {/* Totals Summary Bar */}
          <Card variant="default" padding="sm" className="bg-[#161f1c] border-emerald-500/30">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-[11px] text-emerald-300 font-semibold block">
                  Итого по сгенерированному меню ({currentPlan.meals.length}{' '}
                  {pluralizeRu(currentPlan.meals.length, ['блюдо', 'блюда', 'блюд'])}):
                </span>
                <div className="flex items-center gap-2 mt-0.5 text-xs">
                  <span className="font-extrabold text-white text-sm">
                    {Math.round(currentPlan.total_generated_calories)} /{' '}
                    {Math.round(currentPlan.target_calories)} ккал
                  </span>
                  <span className="text-blue-300">
                    Б: {Math.round(currentPlan.total_generated_protein)}г
                  </span>
                  <span className="text-amber-300">
                    Ж: {Math.round(currentPlan.total_generated_fat)}г
                  </span>
                  <span className="text-purple-300">
                    У: {Math.round(currentPlan.total_generated_carbs)}г
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleOpenShoppingList}
                  className="gap-1.5 text-xs border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 cursor-pointer"
                  leftIcon={<ShoppingCart className="w-3.5 h-3.5 text-emerald-400" />}
                >
                  Список покупок
                </Button>
              </div>
            </div>
          </Card>

          {/* Planned Meal Cards */}
          {currentPlan.meals.map((meal, idx) => (
            <Card
              key={meal.id}
              variant="default"
              padding="md"
              className={`space-y-3 transition-all ${
                meal.locked
                  ? 'border-emerald-500/50 bg-[#18221f]'
                  : 'border-neutral-800/90'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-300">
                      {meal.meal_label}
                    </span>
                    <span className="text-xs text-neutral-400 font-medium">
                      {Math.round(meal.weight_grams)} г
                    </span>
                    {meal.added_to_diary && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <Check className="w-3 h-3" />
                        <span>В дневнике</span>
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-white mt-1">
                    {meal.name}
                  </h3>
                </div>

                {/* Lock / Keep Button */}
                <button
                  type="button"
                  onClick={() => toggleLockMeal(planDate, meal.id)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer shrink-0 ${
                    meal.locked
                      ? 'bg-emerald-500 text-white border-emerald-400 shadow-sm'
                      : 'bg-[#141418] text-neutral-400 hover:text-white border-neutral-700'
                  }`}
                  title="Закрепить это блюдо при перегенерации остальных"
                >
                  <Pin className="w-3.5 h-3.5" />
                  <span>{meal.locked ? 'Оставлено' : 'Оставить'}</span>
                </button>
              </div>

              {/* Macros Row */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                  {Math.round(meal.calories)} ккал
                </span>
                <span className="text-[11px] font-medium text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded-md">
                  Б: {meal.protein}г
                </span>
                <span className="text-[11px] font-medium text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                  Ж: {meal.fat}г
                </span>
                <span className="text-[11px] font-medium text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded-md">
                  У: {meal.carbs}г
                </span>
              </div>

              {/* Recipe = Simple Ingredients Composition */}
              {meal.ingredients && meal.ingredients.length > 0 && (
                <div className="bg-[#141417] border border-neutral-800/80 rounded-xl p-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-300">
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Состав блюда (ингредиенты):</span>
                  </div>
                  <div className="divide-y divide-neutral-800/60">
                    {meal.ingredients.map((ing, i) => (
                      <div
                        key={i}
                        className="py-1 flex items-center justify-between text-xs gap-2"
                      >
                        <span className="text-neutral-200 truncate">{ing.name}</span>
                        <span className="text-neutral-400 font-mono text-[11px] shrink-0">
                          {Math.round(ing.weight_grams)}г • {Math.round(ing.calories)} ккал
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* One-Click Add to Eaten Diary */}
              <div className="pt-1 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant={meal.added_to_diary ? 'secondary' : 'primary'}
                  isLoading={addingMealId === meal.id}
                  onClick={() => handleAddMealToDiary(meal, idx)}
                  leftIcon={
                    meal.added_to_diary ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )
                  }
                >
                  {meal.added_to_diary
                    ? 'Добавить в съеденное ещё раз'
                    : 'Добавить в съеденное'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Shopping List Modal (GC-01) */}
      <Modal
        isOpen={isShoppingListOpen}
        onClose={() => setIsShoppingListOpen(false)}
        title="Список покупок"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-neutral-400 border-b border-neutral-800 pb-2">
            <span>Ингредиенты из меню на {planDate}</span>
            <span className="font-semibold text-white">
              {groceryItems.filter((i) => !i.checked).length} из {groceryItems.length} к покупке
            </span>
          </div>

          {/* Grouped by Aisles */}
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {groceryItems.length === 0 ? (
              <p className="text-xs text-neutral-500 text-center py-6">
                В выбранном меню пока нет ингредиентов
              </p>
            ) : (
              Object.entries(
                groceryItems.reduce((acc, item) => {
                  const cat = item.category || 'Другое'
                  if (!acc[cat]) acc[cat] = []
                  acc[cat].push(item)
                  return acc
                }, {} as Record<string, GroceryItem[]>)
              ).map(([categoryName, items]) => (
                <div key={categoryName} className="space-y-1.5">
                  <span className="text-[11px] font-bold text-neutral-300 uppercase tracking-wider block px-1">
                    {categoryName}
                  </span>
                  <div className="bg-[#141417] rounded-xl border border-neutral-800 divide-y divide-neutral-800/60 overflow-hidden">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleToggleGroceryItem(item.id)}
                        className={`flex items-center justify-between p-2.5 transition-colors cursor-pointer text-xs ${
                          item.checked ? 'bg-neutral-900/60 opacity-60' : 'hover:bg-neutral-850'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {item.checked ? (
                            <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-neutral-500 shrink-0" />
                          )}
                          <span
                            className={`font-medium truncate ${
                              item.checked ? 'line-through text-neutral-500' : 'text-neutral-200'
                            }`}
                          >
                            {item.name}
                          </span>
                        </div>
                        {item.totalGrams > 0 && (
                          <span className="font-mono text-[11px] text-neutral-400 shrink-0 ml-2">
                            {item.totalGrams}г
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Send to Telegram & Close Action Buttons */}
          <div className="pt-2 border-t border-neutral-800 flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="w-1/3"
              onClick={() => setIsShoppingListOpen(false)}
            >
              Закрыть
            </Button>
            <Button
              type="button"
              className="w-2/3"
              isLoading={isSendingTelegram}
              onClick={handleSendToTelegram}
              leftIcon={<Send className="w-4 h-4 text-blue-300" />}
            >
              Отправить в Telegram
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
export default MealPlanPage
