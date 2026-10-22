import React, { useState, useEffect } from 'react'
import {
  User,
  Calculator,
  Scale,
  LogOut,
  Sparkles,
  Save,
  ChevronDown,
  Send,
  Cpu,
  Lock,
  Smartphone,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { profileApi } from '../api/profile'
import { authApi } from '../api/auth'
import { Gender, ActivityLevel } from '../types'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { AISettingsCard } from '../components/settings/AISettingsCard'
import { TelegramBotCard } from '../components/settings/TelegramBotCard'
import { isNativeApp } from '../utils/platform'

interface AccordionSectionProps {
  id: string
  title: string
  subtitle?: string
  icon: React.ReactNode
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}

const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  subtitle,
  icon,
  isOpen,
  onToggle,
  children,
}) => {
  return (
    <div className="bg-[#18181c] border border-neutral-800/80 rounded-2xl overflow-hidden shadow-sm transition-all">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-neutral-800/30 transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
          <div className="w-8 h-8 rounded-xl bg-neutral-800/80 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white tracking-tight my-0">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[11px] text-neutral-400 truncate mt-0.5 font-medium">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 text-neutral-400">
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-emerald-400' : ''
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-neutral-800/80 p-3.5 sm:p-4 space-y-3.5 animate-in fade-in duration-150">
          {children}
        </div>
      )}
    </div>
  )
}

export const ProfilePage: React.FC = () => {
  const { user, setUser, logout } = useAuthStore()
  const { addToast } = useUIStore()

  // Form state
  const [name, setName] = useState('')
  const [height, setHeight] = useState('')
  const [currentWeight, setCurrentWeight] = useState('')
  const [targetWeight, setTargetWeight] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState<Gender>('male')
  const [activity, setActivity] = useState<ActivityLevel>('moderate')

  // Goals state
  const [goalCalories, setGoalCalories] = useState('')
  const [goalProtein, setGoalProtein] = useState('')
  const [goalFat, setGoalFat] = useState('')
  const [goalCarbs, setGoalCarbs] = useState('')

  // Quick weight log state
  const [newWeightLog, setNewWeightLog] = useState('')
  const [isLoggingWeight, setIsLoggingWeight] = useState(false)

  // Loading states
  const [isSaving, setIsSaving] = useState(false)
  const [isCalculating, setIsCalculating] = useState(false)

  useEffect(() => {
    if (user) {
      setName(user.name || '')
      setHeight(user.height_cm?.toString() || '')
      setCurrentWeight(user.current_weight_kg?.toString() || '')
      setTargetWeight(user.target_weight_kg?.toString() || '')
      setAge(user.age?.toString() || '')
      setGender(user.gender || 'male')
      setActivity(user.activity_level || 'moderate')

      setGoalCalories(user.daily_calories_goal?.toString() || '2000')
      setGoalProtein(user.daily_protein_goal?.toString() || '140')
      setGoalFat(user.daily_fat_goal?.toString() || '70')
      setGoalCarbs(user.daily_carbs_goal?.toString() || '250')
    }
  }, [user])

  // Formula Mifflin-St Jeor calculation
  const handleCalculateMifflinStJeor = async () => {
    const w = parseFloat(currentWeight)
    const h = parseFloat(height)
    const a = parseInt(age, 10)

    if (!w || !h || !a) {
      addToast('Заполните вес, рост и возраст для расчёта', 'warning')
      return
    }

    setIsCalculating(true)
    const targetW = parseFloat(targetWeight)
    const goal = targetW && targetW - w < -0.5 ? 'lose_weight' : targetW && targetW - w > 0.5 ? 'gain_weight' : 'maintain'

    try {
      // First try server calculation
      const calculated = await profileApi.calculateGoals({
        gender,
        height_cm: h,
        weight_kg: w,
        current_weight_kg: w,
        target_weight_kg: targetW || w,
        age: a,
        activity_level: activity,
        goal,
      })

      setGoalCalories(calculated.daily_calories_goal.toString())
      setGoalProtein(calculated.daily_protein_goal.toString())
      setGoalFat(calculated.daily_fat_goal.toString())
      setGoalCarbs(calculated.daily_carbs_goal.toString())
      addToast('Норма КБЖУ рассчитана по формуле Mifflin-St Jeor', 'success')
    } catch {
      // Fallback calculation directly in frontend exactly matching backend nutrition.py
      let bmr = 10 * w + 6.25 * h - 5 * a
      if (gender === 'male') {
        bmr += 5
      } else {
        bmr -= 161
      }

      const activityMultipliers: Record<ActivityLevel, number> = {
        sedentary: 1.2,
        light: 1.375,
        moderate: 1.55,
        active: 1.725,
        very_active: 1.9,
      }

      const tdee = bmr * (activityMultipliers[activity] || 1.2)

      // Adjust for weight target
      let goalMultiplier = 1.0
      if (goal === 'lose_weight') {
        goalMultiplier = 0.82
      } else if (goal === 'gain_weight') {
        goalMultiplier = 1.15
      }

      const targetCaloriesVal = Math.max(1200, Math.round(tdee * goalMultiplier))

      let proteinGPerKg = 1.6
      let fatRatio = 0.30
      if (goal === 'lose_weight') {
        proteinGPerKg = 2.0
        fatRatio = 0.25
      } else if (goal === 'gain_weight') {
        proteinGPerKg = 1.9
        fatRatio = 0.25
      }

      const finalProtein = Math.max(50, Math.round(w * proteinGPerKg))
      const finalFat = Math.max(Math.round(w * 0.7), Math.round((targetCaloriesVal * fatRatio) / 9.0))
      const remainingCal = Math.max(0, targetCaloriesVal - finalProtein * 4 - finalFat * 9)
      const finalCarbs = Math.round(remainingCal / 4.0)

      setGoalCalories(targetCaloriesVal.toString())
      setGoalProtein(finalProtein.toString())
      setGoalFat(finalFat.toString())
      setGoalCarbs(finalCarbs.toString())
      addToast('КБЖУ успешно рассчитано!', 'success')
    } finally {
      setIsCalculating(false)
    }
  }

  // Collapsible Accordion sections state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    body: false,
    goals: false,
    weight: false,
    telegram: false,
    ai: false,
    security: false,
  })

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  const handleChangePassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!currentPassword || !newPassword) {
      addToast('Заполните текущий и новый пароль', 'warning')
      return
    }
    if (newPassword.length < 6) {
      addToast('Новый пароль должен содержать не менее 6 символов', 'warning')
      return
    }
    if (newPassword !== confirmPassword) {
      addToast('Новые пароли не совпадают', 'warning')
      return
    }

    setIsChangingPassword(true)
    try {
      const authRes = await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      })
      useAuthStore.getState().updateSessionFromAuthResponse(authRes)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      addToast('Пароль успешно изменён!', 'success')
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Не удалось сменить пароль. Проверьте текущий пароль.'
      addToast(typeof msg === 'string' ? msg : 'Ошибка смены пароля', 'error')
    } finally {
      setIsChangingPassword(false)
    }
  }

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleSaveProfile = async (e?: React.FormEvent, customMsg = 'Профиль и цели сохранены!') => {
    if (e) e.preventDefault()
    setIsSaving(true)
    try {
      const updatedUser = await profileApi.updateProfile({
        name: name.trim() || undefined,
        height_cm: height ? parseFloat(height) : undefined,
        current_weight_kg: currentWeight ? parseFloat(currentWeight) : undefined,
        target_weight_kg: targetWeight ? parseFloat(targetWeight) : undefined,
        age: age ? parseInt(age, 10) : undefined,
        gender,
        activity_level: activity,
        daily_calories_goal: parseInt(goalCalories, 10) || 2000,
        daily_protein_goal: parseInt(goalProtein, 10) || 140,
        daily_fat_goal: parseInt(goalFat, 10) || 70,
        daily_carbs_goal: parseInt(goalCarbs, 10) || 250,
      })
      setUser(updatedUser)
      addToast(customMsg, 'success')
    } catch {
      addToast('Ошибка сохранения профиля', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleLogQuickWeight = async () => {
    const val = parseFloat(newWeightLog)
    if (!val || val <= 0) {
      addToast('Введите корректный вес', 'warning')
      return
    }

    setIsLoggingWeight(true)
    try {
      await profileApi.logWeight(val)
      setCurrentWeight(val.toString())
      setNewWeightLog('')
      addToast('Вес успешно записан в журнал!', 'success')
    } catch {
      addToast('Не удалось записать вес', 'error')
    } finally {
      setIsLoggingWeight(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* User Header Card */}
      <Card variant="default" padding="md" className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-lg font-bold text-white shadow-lg shadow-emerald-500/20">
            {(user?.name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight my-0">
              {user?.name || 'Пользователь'}
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">{user?.email}</p>
          </div>
        </div>

        <button
          onClick={logout}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
          title="Выйти из аккаунта"
        >
          <LogOut className="w-4 h-4" />
          <span>Выйти</span>
        </button>
      </Card>

      {!isNativeApp() && (
        <div className="bg-gradient-to-r from-emerald-500/10 via-[#18181c] to-[#18181c] border border-emerald-500/25 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white my-0">Приложение KaloriiAI для Android</h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Установите APK на телефон — мгновенный запуск, сканер и синхронизация с вашим аккаунтом
              </p>
            </div>
          </div>
          <a
            href="/kalorii-ai.apk"
            download="KaloriiAI.apk"
            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs transition-colors"
          >
            Скачать APK
          </a>
        </div>
      )}

      {/* 1. Accordion: Body Parameters */}
      <AccordionSection
        id="body"
        title="Параметры тела"
        subtitle={
          [
            currentWeight && `${currentWeight} кг`,
            height && `${height} см`,
            age && `${age} лет`,
          ]
            .filter(Boolean)
            .join(' • ') || 'Рост, вес, возраст, уровень активности'
        }
        icon={<User className="w-4 h-4 text-emerald-400" />}
        isOpen={openSections.body}
        onToggle={() => toggleSection('body')}
      >
        <div className="space-y-3.5">
          <Input
            label="Имя"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ваше имя"
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Рост (см)"
              type="number"
              placeholder="175"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
            <Input
              label="Возраст"
              type="number"
              placeholder="25"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Текущий вес (кг)"
              type="number"
              step="0.1"
              placeholder="80"
              value={currentWeight}
              onChange={(e) => setCurrentWeight(e.target.value)}
            />
            <Input
              label="Целевой вес (кг)"
              type="number"
              step="0.1"
              placeholder="72"
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
            />
          </div>

          {/* Gender selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-300 block">
              Пол
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGender('male')}
                className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                  gender === 'male'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                    : 'bg-[#141417] border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                Мужской
              </button>
              <button
                type="button"
                onClick={() => setGender('female')}
                className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                  gender === 'female'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                    : 'bg-[#141417] border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                Женский
              </button>
            </div>
          </div>

          {/* Activity Level */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-300 block">
              Уровень активности
            </label>
            <select
              value={activity}
              onChange={(e) => setActivity(e.target.value as ActivityLevel)}
              className="w-full bg-[#141417] border border-neutral-800 text-white rounded-xl px-3 py-2.5 text-xs outline-none focus:border-emerald-500"
            >
              <option value="sedentary">Сидячий образ жизни (мало или нет тренировок)</option>
              <option value="light">Легкая активность (тренировки 1-3 раза в неделю)</option>
              <option value="moderate">Умеренная активность (тренировки 3-5 раз в неделю)</option>
              <option value="active">Высокая активность (тренировки 6-7 раз в неделю)</option>
              <option value="very_active">Экстремальная активность (тяжелый спорт/труд)</option>
            </select>
          </div>

          <Button
            type="button"
            className="w-full mt-2"
            size="md"
            isLoading={isSaving}
            onClick={() => handleSaveProfile(undefined, 'Параметры тела успешно сохранены!')}
            leftIcon={<Save className="w-4 h-4" />}
          >
            Сохранить параметры тела
          </Button>
        </div>
      </AccordionSection>

      {/* 2. Accordion: KBJU Goals */}
      <AccordionSection
        id="goals"
        title="Дневная цель КБЖУ"
        subtitle={`${goalCalories || 2000} ккал • Б:${goalProtein || 140}г Ж:${goalFat || 70}г У:${goalCarbs || 250}г`}
        icon={<Calculator className="w-4 h-4 text-sky-400" />}
        isOpen={openSections.goals}
        onToggle={() => toggleSection('goals')}
      >
        <div className="space-y-3.5">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs text-neutral-400">
              Целевые суточные нормы питания
            </span>
            <button
              type="button"
              onClick={handleCalculateMifflinStJeor}
              disabled={isCalculating}
              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Рассчитать (Mifflin)</span>
            </button>
          </div>

          <Input
            label="Калории (ккал/день) *"
            type="number"
            value={goalCalories}
            onChange={(e) => setGoalCalories(e.target.value)}
            required
          />

          <div className="grid grid-cols-3 gap-2 items-end">
            <Input
              label="Белки (г)"
              type="number"
              value={goalProtein}
              onChange={(e) => setGoalProtein(e.target.value)}
            />
            <Input
              label="Жиры (г)"
              type="number"
              value={goalFat}
              onChange={(e) => setGoalFat(e.target.value)}
            />
            <Input
              label="Углеводы (г)"
              type="number"
              value={goalCarbs}
              onChange={(e) => setGoalCarbs(e.target.value)}
            />
          </div>

          <Button
            type="button"
            className="w-full mt-2"
            size="md"
            isLoading={isSaving}
            onClick={() => handleSaveProfile(undefined, 'Цели КБЖУ успешно сохранены!')}
            leftIcon={<Save className="w-4 h-4" />}
          >
            Сохранить цели КБЖУ
          </Button>
        </div>
      </AccordionSection>

      {/* 3. Accordion: Weight Log */}
      <AccordionSection
        id="weight"
        title="Журнал веса"
        subtitle={currentWeight ? `Текущий вес: ${currentWeight} кг` : 'Внесение ежедневного замера'}
        icon={<Scale className="w-4 h-4 text-amber-400" />}
        isOpen={openSections.weight}
        onToggle={() => toggleSection('weight')}
      >
        <div className="space-y-3">
          <p className="text-xs text-neutral-400">
            Внесите текущий вес сегодня для отслеживания динамики на графике статистики
          </p>

          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              placeholder="Например: 78.5"
              value={newWeightLog}
              onChange={(e) => setNewWeightLog(e.target.value)}
              className="flex-1 min-w-0 bg-[#141417] border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-emerald-500"
            />
            <Button
              type="button"
              size="md"
              variant="secondary"
              className="shrink-0 whitespace-nowrap"
              onClick={handleLogQuickWeight}
              isLoading={isLoggingWeight}
            >
              Записать вес
            </Button>
          </div>
        </div>
      </AccordionSection>

      {/* 4. Accordion: Telegram Bot */}
      <AccordionSection
        id="telegram"
        title="Telegram-бот"
        subtitle="Уведомления и добавление еды через бота"
        icon={<Send className="w-4 h-4 text-sky-400" />}
        isOpen={openSections.telegram}
        onToggle={() => toggleSection('telegram')}
      >
        <TelegramBotCard embedded />
      </AccordionSection>

      {/* 5. Accordion: AI Models Settings */}
      <AccordionSection
        id="ai"
        title="Настройки ИИ-моделей"
        subtitle="Приоритеты моделей Gemini и OpenRouter"
        icon={<Cpu className="w-4 h-4 text-purple-400" />}
        isOpen={openSections.ai}
        onToggle={() => toggleSection('ai')}
      >
        <AISettingsCard embedded />
      </AccordionSection>

      {/* 6. Accordion: Security & Password */}
      <AccordionSection
        id="security"
        title="Пароль и безопасность"
        subtitle="Смена пароля аккаунта"
        icon={<Lock className="w-4 h-4 text-rose-400" />}
        isOpen={openSections.security}
        onToggle={() => toggleSection('security')}
      >
        <form onSubmit={handleChangePassword} className="space-y-3.5">
          <Input
            label="Текущий пароль"
            type="password"
            placeholder="••••••••"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <Input
            label="Новый пароль"
            type="password"
            placeholder="Минимум 6 символов"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <Input
            label="Подтверждение нового пароля"
            type="password"
            placeholder="Повторите новый пароль"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          <Button
            type="submit"
            className="w-full mt-2"
            size="md"
            variant="secondary"
            isLoading={isChangingPassword}
            leftIcon={<Lock className="w-4 h-4" />}
          >
            Сменить пароль
          </Button>
        </form>
      </AccordionSection>
    </div>
  )
}
