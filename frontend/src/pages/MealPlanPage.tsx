import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
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
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
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
        ai_provider: currentPlan?.provider_used || null,
        ai_model: currentPlan?.model_used || null,
        ai_raw_response: currentPlan?.model_used
          ? JSON.stringify({
              provider: currentPlan.provider_used,
              model: currentPlan.model_used,
              source: 'meal_plan',
            })
          : null,
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
          <h1 className="hidden lg:block text-2xl font-semibold tracking-tight text-white my-0">
            Что съесть
          </h1>
          <p className="text-xs text-[#7A7A82] my-0 lg:mt-0.5">
            AI-подбор 1 блюда или полного рациона под точный остаток КБЖУ
          </p>
        </div>

        <div className="flex items-center gap-1 bg-[#1A1A1D] p-1 rounded-full">
          <button
            type="button"
            onClick={() => setPlanDate(todayStr)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
              planDate === todayStr
                ? 'bg-white text-black'
                : 'text-[#8E8E96] hover:text-white'
            }`}
          >
            Сегодня
          </button>
          <button
            type="button"
            onClick={() => setPlanDate(tomorrowStr)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
              planDate === tomorrowStr
                ? 'bg-white text-black'
                : 'text-[#8E8E96] hover:text-white'
            }`}
          >
            Завтра
          </button>
        </div>
      </div>

      {/* Desktop Adaptive 2-col Bento: Left = Generator & Controls, Right = Generated Menu */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:items-start">
        <div className={`${currentPlan && currentPlan.meals.length > 0 ? 'lg:col-span-5' : 'lg:col-span-12 max-w-2xl'} space-y-3.5`}>
          {/* Live Remaining KBJU Card */}
          <div className="rounded-[22px] bg-[#1A1A1D] p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <span className="text-[11px] font-medium text-[#7A7A82] block">
                  Свободный остаток ({planDate === todayStr ? 'сегодня' : planDate === tomorrowStr ? 'завтра' : planDate})
                </span>
                <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                  <span className="font-ndot text-2xl font-bold text-white leading-none">
                    {remCalActual}
                  </span>
                  <span className="text-xs text-[#7A7A82]">
                    ккал · съедено {eatenStats.calories}/{goalCal}
                  </span>
                </div>
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-[#E02424] shrink-0" />
            </div>

            <div className="nothing-dotted-divider" />

            <div className="flex items-center gap-3 font-ndot text-xs">
              <span className="text-white font-bold">Б {remProtActual}г</span>
              <span className="text-[#52525B]">·</span>
              <span className="text-[#A1A1AA] font-bold">Ж {remFatActual}г</span>
              <span className="text-[#52525B]">·</span>
              <span className="text-[#7A7A82] font-bold">У {remCarbsActual}г</span>
            </div>
          </div>

          {/* 2×2 Quick 1-Click Smart Scenarios */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-medium text-[#A1A1AA] flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-[#E02424]" />
                <span>Быстрый подбор в 1 клик</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {[
                {
                  key: 'single' as const,
                  tag: '1 блюдо',
                  title: 'На ужин / перекус',
                  sub: `до ${Math.max(220, remCalActual)} ккал`,
                  icon: <Utensils className="w-4 h-4" />,
                },
                {
                  key: 'protein' as const,
                  tag: 'Белок',
                  title: 'Добрать белок',
                  sub: `~${Math.max(30, remProtActual)}г белка`,
                  icon: <Flame className="w-4 h-4" />,
                },
                {
                  key: 'remaining' as const,
                  tag: '2 блюда',
                  title: 'На остаток дня',
                  sub: `${Math.max(220, remCalActual)} ккал`,
                  icon: <Layers className="w-4 h-4" />,
                },
                {
                  key: 'fullday' as const,
                  tag: '3 блюда',
                  title: 'Полный рацион',
                  sub: `${goalCal} ккал`,
                  icon: <Calendar className="w-4 h-4" />,
                },
              ].map((s) => {
                const isActive = activeScenario === s.key
                return (
                  <button
                    key={s.key}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => handleRunSmartScenario(s.key)}
                    className={`text-left p-3.5 rounded-[20px] transition-all cursor-pointer active:scale-[0.98] ${
                      isActive
                        ? 'bg-[#1A1A1D] ring-1 ring-[#E02424]'
                        : 'bg-[#1A1A1D] hover:bg-[#222226]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          isActive ? 'bg-[#E02424] text-white' : 'bg-[#2A2A2F] text-white'
                        }`}
                      >
                        {s.icon}
                      </div>
                      <span className="font-ndot text-[10px] font-bold text-[#7A7A82] uppercase">
                        {s.tag}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-white truncate">{s.title}</div>
                    <div className="font-ndot text-[11px] text-[#7A7A82] mt-0.5 truncate">
                      {s.sub}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Generator Card: Preferences & Fine-Tuning */}
          <Card variant="default" padding="md" className="space-y-3.5">
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#A1A1AA] block">
                Пожелания к блюдам
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
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-white text-black'
                          : 'bg-[#111113] text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      {tag}
                    </button>
                  )
                })}
              </div>

              <input
                type="text"
                placeholder="Например: есть творог и яйца, без духовки..."
                value={preferences}
                onChange={(e) => setPreferences(e.target.value)}
                className="w-full bg-[#111113] border border-white/[0.08] rounded-2xl px-3.5 py-2.5 text-xs text-white placeholder-[#6E6E75] outline-none focus:border-white/40 transition-colors"
              />
            </div>

            <div className="nothing-dotted-divider" />

            {/* Collapsible Fine-Tuning */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvancedConfig((v) => !v)}
                className="w-full flex items-center justify-between text-xs text-[#A1A1AA] hover:text-white py-1 cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-2 font-medium truncate">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-white shrink-0" />
                  <span className="truncate">
                    Настройка:{' '}
                    <span className="font-ndot text-white font-bold">
                      {mealsCount} · {targetCalories} ккал
                    </span>
                  </span>
                </span>
                {showAdvancedConfig ? (
                  <ChevronUp className="w-4 h-4 text-[#7A7A82] shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#7A7A82] shrink-0" />
                )}
              </button>

              {showAdvancedConfig && (
                <div className="space-y-3.5 pt-3 mt-2 border-t border-white/[0.06] animate-in fade-in duration-150">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-[#A1A1AA] flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Дата плана</span>
                    </label>
                    <input
                      type="date"
                      value={planDate}
                      onChange={(e) => e.target.value && setPlanDate(e.target.value)}
                      className="bg-[#111113] border border-white/[0.1] rounded-full px-3 py-1.5 font-ndot text-xs text-white outline-none focus:border-white/40"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#A1A1AA] block">
                      Количество блюд
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[1, 2, 3, 4, 5].map((cnt) => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => setMealsCount(cnt)}
                          className={`py-2 rounded-full font-ndot text-xs font-bold transition-colors cursor-pointer ${
                            mealsCount === cnt
                              ? 'bg-white text-black'
                              : 'bg-[#111113] text-[#8E8E96] hover:text-white'
                          }`}
                        >
                          {cnt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-1.5">
                      <span className="text-xs font-medium text-[#A1A1AA]">Целевые КБЖУ</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={handleBalanceWeek}
                          className="text-[10px] font-semibold text-white bg-[#2A2A2F] hover:bg-white hover:text-black px-2.5 py-1 rounded-full cursor-pointer flex items-center gap-1 transition-colors"
                        >
                          <Scale className="w-2.5 h-2.5" />
                          <span>Баланс</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleFillRemaining}
                          className="text-[10px] font-semibold text-white bg-[#2A2A2F] hover:bg-white hover:text-black px-2.5 py-1 rounded-full cursor-pointer transition-colors"
                        >
                          Остаток ({remCalActual})
                        </button>
                        <button
                          type="button"
                          onClick={handleFillFullDayGoal}
                          className="text-[10px] font-semibold text-[#A1A1AA] hover:text-white bg-[#111113] px-2.5 py-1 rounded-full cursor-pointer"
                        >
                          Норма ({goalCal})
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Input
                        label="Калории *"
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

                    <div className="flex items-center gap-2 text-[11px] text-[#A1A1AA] bg-[#111113] px-3 py-2 rounded-2xl">
                      <ShieldCheck className="w-4 h-4 text-white shrink-0" />
                      <span>
                        AI строго уложится в{' '}
                        <b className="font-ndot text-white">{targetCalories || 0} ккал</b>
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
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
                    Заменить незакреплённые ({lockedCount})
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
                    ? `Другие варианты (${mealsCount} ${pluralizeRu(mealsCount, ['блюдо', 'блюда', 'блюд'])})`
                    : `Подобрать ${mealsCount} ${pluralizeRu(mealsCount, ['блюдо', 'блюда', 'блюд'])} · ${targetCalories} ккал`}
                </Button>
              )}
            </div>
          </Card>
        </div>

        {/* Right Column: Generated Meal Plan Result */}
        {currentPlan && currentPlan.meals.length > 0 && (
          <div className="lg:col-span-7 space-y-3 animate-in fade-in duration-200">
            {/* Totals Bar */}
            <div className="bg-[#1A1A1D] rounded-[22px] p-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <span className="text-[11px] text-[#7A7A82] font-medium block">
                  Сгенерированное меню ({currentPlan.meals.length}{' '}
                  {pluralizeRu(currentPlan.meals.length, ['блюдо', 'блюда', 'блюд'])})
                </span>
                <div className="flex items-center gap-3 mt-1 font-ndot text-xs">
                  <span className="font-bold text-white text-base">
                    {Math.round(currentPlan.total_generated_calories)}/
                    {Math.round(currentPlan.target_calories)}
                  </span>
                  <span className="text-[#D4D4D8]">Б {Math.round(currentPlan.total_generated_protein)}</span>
                  <span className="text-[#A1A1AA]">Ж {Math.round(currentPlan.total_generated_fat)}</span>
                  <span className="text-[#7A7A82]">У {Math.round(currentPlan.total_generated_carbs)}</span>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleOpenShoppingList}
                leftIcon={<ShoppingCart className="w-3.5 h-3.5" />}
              >
                Список покупок
              </Button>
            </div>

            {/* Planned Meal Cards */}
            {currentPlan.meals.map((meal, idx) => (
              <Card
                key={meal.id}
                variant="default"
                padding="md"
                className={`space-y-3 ${meal.locked ? 'ring-1 ring-[#E02424]' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-ndot text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-[#2A2A2F] text-white">
                        {meal.meal_label}
                      </span>
                      <span className="font-ndot text-xs text-[#7A7A82]">
                        {Math.round(meal.weight_grams)}г
                      </span>
                      {meal.added_to_diary && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white text-black">
                          <Check className="w-3 h-3" />
                          <span>В дневнике</span>
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm sm:text-base font-semibold text-white mt-1.5 my-0">
                      {meal.name}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleLockMeal(planDate, meal.id)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                      meal.locked
                        ? 'bg-[#E02424] text-white'
                        : 'bg-[#2A2A2F] text-[#A1A1AA] hover:text-white'
                    }`}
                    title="Закрепить это блюдо при перегенерации"
                  >
                    <Pin className="w-3 h-3" />
                    <span>{meal.locked ? 'Закреплено' : 'Оставить'}</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 font-ndot text-xs">
                  <span className="font-bold text-white text-sm">
                    {Math.round(meal.calories)} ккал
                  </span>
                  <span className="text-[#52525B]">·</span>
                  <span className="text-[#D4D4D8]">Б {meal.protein}г</span>
                  <span className="text-[#A1A1AA]">Ж {meal.fat}г</span>
                  <span className="text-[#7A7A82]">У {meal.carbs}г</span>
                </div>

                {meal.ingredients && meal.ingredients.length > 0 && (
                  <div className="bg-[#111113] rounded-[16px] p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#A1A1AA]">
                      <Layers className="w-3.5 h-3.5" />
                      <span>Состав блюда</span>
                    </div>
                    <div className="divide-y divide-white/[0.06]">
                      {meal.ingredients.map((ing, i) => (
                        <div key={i} className="py-1.5 flex items-center justify-between text-xs gap-2">
                          <span className="text-[#E4E4E7] truncate">{ing.name}</span>
                          <span className="font-ndot text-[11px] text-[#7A7A82] shrink-0">
                            {Math.round(ing.weight_grams)}г · {Math.round(ing.calories)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-1 flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant={meal.added_to_diary ? 'secondary' : 'primary'}
                    isLoading={addingMealId === meal.id}
                    onClick={() => handleAddMealToDiary(meal, idx)}
                    leftIcon={
                      meal.added_to_diary ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )
                    }
                  >
                    {meal.added_to_diary ? 'Добавить ещё раз' : 'В съеденное'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Shopping List Modal */}
      <Modal
        isOpen={isShoppingListOpen}
        onClose={() => setIsShoppingListOpen(false)}
        title="Список покупок"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-[#7A7A82]">
            <span>Ингредиенты на {planDate}</span>
            <span className="font-ndot font-bold text-white">
              {groceryItems.filter((i) => !i.checked).length}/{groceryItems.length}
            </span>
          </div>

          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {groceryItems.length === 0 ? (
              <p className="text-xs text-[#7A7A82] text-center py-6">
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
                  <span className="font-ndot text-[10px] font-bold text-[#7A7A82] uppercase tracking-wider block px-1">
                    {categoryName}
                  </span>
                  <div className="bg-[#1A1A1D] rounded-[18px] divide-y divide-white/[0.06] overflow-hidden">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleToggleGroceryItem(item.id)}
                        className={`flex items-center justify-between p-3 transition-colors cursor-pointer text-xs ${
                          item.checked ? 'opacity-45' : 'hover:bg-[#222226]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {item.checked ? (
                            <CheckSquare className="w-4 h-4 text-white shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-[#6E6E75] shrink-0" />
                          )}
                          <span
                            className={`font-medium truncate ${
                              item.checked ? 'line-through text-[#7A7A82]' : 'text-white'
                            }`}
                          >
                            {item.name}
                          </span>
                        </div>
                        {item.totalGrams > 0 && (
                          <span className="font-ndot text-[11px] text-[#A1A1AA] shrink-0 ml-2">
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

          <div className="nothing-dotted-divider" />

          <div className="flex gap-2">
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
              leftIcon={<Send className="w-4 h-4" />}
            >
              В Telegram
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
export default MealPlanPage
