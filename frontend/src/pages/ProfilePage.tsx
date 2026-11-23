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
  Download,
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
import {
  APP_VERSION,
  checkServerAppVersion,
  downloadLatestApk,
  isNativeApp,
} from '../utils/platform'

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
    <div className="bg-[#1A1A1D] rounded-[22px] overflow-hidden transition-colors">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-[#222226] transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
          <div className="w-9 h-9 rounded-full bg-[#2A2A2F] flex items-center justify-center shrink-0 text-white">
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white tracking-tight my-0">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[11px] text-[#7A7A82] truncate mt-0.5 my-0">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 text-[#7A7A82]">
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-[#E02424]' : ''
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-3.5 animate-in fade-in duration-150">
          <div className="nothing-dotted-divider" />
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
  const [serverVersion, setServerVersion] = useState<string>(APP_VERSION)
  const [hasAppUpdate, setHasAppUpdate] = useState(false)

  useEffect(() => {
    checkServerAppVersion().then((info) => {
      if (info) {
        setServerVersion(info.remoteVersion)
        setHasAppUpdate(info.hasUpdate)
      }
    })
  }, [])

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
      {/* Desktop Heading */}
      <h1 className="hidden lg:block text-2xl font-semibold tracking-tight text-white my-0">
        Профиль
      </h1>

      {/* User Header Card */}
      <Card variant="default" padding="md" className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-lg font-bold text-black shrink-0">
            {(user?.name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white tracking-tight truncate my-0">
              {user?.name || 'Пользователь'}
            </h2>
            <p className="text-xs text-[#7A7A82] truncate mt-0.5 my-0">{user?.email}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#E02424] hover:bg-[#E02424]/10 rounded-full transition-colors cursor-pointer shrink-0"
          title="Выйти из аккаунта"
        >
          <LogOut className="w-4 h-4" />
          <span>Выйти</span>
        </button>
      </Card>

      {/* Desktop Adaptive 2-Column Bento Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 items-start">
        <div className="space-y-3.5">
          {/* 1. Body Parameters */}
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
                .join(' · ') || 'Рост, вес, возраст, активность'
            }
            icon={<User className="w-4 h-4" />}
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

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#A1A1AA] block">Пол</label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-full bg-[#111113]">
                  <button
                    type="button"
                    onClick={() => setGender('male')}
                    className={`py-2 px-3 text-xs font-semibold rounded-full transition-colors cursor-pointer ${
                      gender === 'male'
                        ? 'bg-white text-black'
                        : 'text-[#8E8E96] hover:text-white'
                    }`}
                  >
                    Мужской
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender('female')}
                    className={`py-2 px-3 text-xs font-semibold rounded-full transition-colors cursor-pointer ${
                      gender === 'female'
                        ? 'bg-white text-black'
                        : 'text-[#8E8E96] hover:text-white'
                    }`}
                  >
                    Женский
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#A1A1AA] block">
                  Уровень активности
                </label>
                <select
                  value={activity}
                  onChange={(e) => setActivity(e.target.value as ActivityLevel)}
                  className="w-full min-h-[44px] bg-[#111113] border border-white/[0.08] text-white rounded-2xl px-3.5 py-2.5 text-xs outline-none focus:border-white/40"
                >
                  <option value="sedentary">Сидячий образ жизни (мало или нет тренировок)</option>
                  <option value="light">Лёгкая активность (1–3 тренировки в неделю)</option>
                  <option value="moderate">Умеренная активность (3–5 тренировок в неделю)</option>
                  <option value="active">Высокая активность (6–7 тренировок в неделю)</option>
                  <option value="very_active">Экстремальная активность (тяжёлый спорт/труд)</option>
                </select>
              </div>

              <Button
                type="button"
                className="w-full"
                size="md"
                isLoading={isSaving}
                onClick={() => handleSaveProfile(undefined, 'Параметры тела сохранены!')}
                leftIcon={<Save className="w-4 h-4" />}
              >
                Сохранить параметры
              </Button>
            </div>
          </AccordionSection>

          {/* 2. KBJU Goals */}
          <AccordionSection
            id="goals"
            title="Дневная цель КБЖУ"
            subtitle={`${goalCalories || 2000} ккал · Б ${goalProtein || 140} · Ж ${goalFat || 70} · У ${goalCarbs || 250}`}
            icon={<Calculator className="w-4 h-4" />}
            isOpen={openSections.goals}
            onToggle={() => toggleSection('goals')}
          >
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#7A7A82]">Суточные нормы</span>
                <button
                  type="button"
                  onClick={handleCalculateMifflinStJeor}
                  disabled={isCalculating}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#2A2A2F] hover:bg-white hover:text-black px-3 py-1 rounded-full transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Mifflin-St Jeor</span>
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
                className="w-full"
                size="md"
                isLoading={isSaving}
                onClick={() => handleSaveProfile(undefined, 'Цели КБЖУ сохранены!')}
                leftIcon={<Save className="w-4 h-4" />}
              >
                Сохранить цели
              </Button>
            </div>
          </AccordionSection>

          {/* 3. Weight Log */}
          <AccordionSection
            id="weight"
            title="Журнал веса"
            subtitle={currentWeight ? `Текущий: ${currentWeight} кг` : 'Ежедневный замер'}
            icon={<Scale className="w-4 h-4" />}
            isOpen={openSections.weight}
            onToggle={() => toggleSection('weight')}
          >
            <div className="space-y-3">
              <p className="text-xs text-[#7A7A82] my-0">
                Внесите текущий вес для обновления графика динамики в статистике
              </p>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  placeholder="Например: 78.5"
                  value={newWeightLog}
                  onChange={(e) => setNewWeightLog(e.target.value)}
                  className="flex-1 min-w-0 min-h-[44px] bg-[#111113] border border-white/[0.08] rounded-full px-4 py-2 font-ndot text-sm font-bold text-white placeholder-[#6E6E75] outline-none focus:border-white/40"
                />
                <Button
                  type="button"
                  size="md"
                  className="shrink-0 whitespace-nowrap"
                  onClick={handleLogQuickWeight}
                  isLoading={isLoggingWeight}
                >
                  Записать
                </Button>
              </div>
            </div>
          </AccordionSection>
        </div>

        <div className="space-y-3.5">
          {/* 4. Telegram Bot */}
          <AccordionSection
            id="telegram"
            title="Telegram-бот"
            subtitle="Добавление еды фото, текстом и голосом"
            icon={<Send className="w-4 h-4" />}
            isOpen={openSections.telegram}
            onToggle={() => toggleSection('telegram')}
          >
            <TelegramBotCard embedded />
          </AccordionSection>

          {/* 5. AI Models Settings */}
          <AccordionSection
            id="ai"
            title="Настройки ИИ-моделей"
            subtitle="Приоритеты Gemini и OpenRouter"
            icon={<Cpu className="w-4 h-4" />}
            isOpen={openSections.ai}
            onToggle={() => toggleSection('ai')}
          >
            <AISettingsCard embedded />
          </AccordionSection>

          {/* 6. Security & Password */}
          <AccordionSection
            id="security"
            title="Пароль и безопасность"
            subtitle="Смена пароля аккаунта"
            icon={<Lock className="w-4 h-4" />}
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
                label="Подтверждение"
                type="password"
                placeholder="Повторите новый пароль"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <Button
                type="submit"
                className="w-full"
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
      </div>

      {/* Download Android App Card */}
      {(!isNativeApp() || hasAppUpdate) && (
        <div className="bg-[#1A1A1D] rounded-[22px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-[#2A2A2F] flex items-center justify-center text-white shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-white my-0">
                  {isNativeApp() ? 'Обновление для Android' : 'KaloriiAI для Android'}
                </h3>
                <span className="font-ndot text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#2A2A2F] text-white">
                  v{serverVersion}
                </span>
                {hasAppUpdate && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E02424] text-white">
                    Обновление
                  </span>
                )}
              </div>
              <p className="text-xs text-[#7A7A82] mt-1 my-0">
                {isNativeApp()
                  ? `Доступна новая версия v${serverVersion}.`
                  : 'Скачайте APK — быстрый запуск, камера и полная синхронизация'}
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => downloadLatestApk(serverVersion)}
            leftIcon={<Download className="w-4 h-4" />}
            className="shrink-0"
          >
            {isNativeApp() || hasAppUpdate ? 'Обновить' : 'Скачать APK'}
          </Button>
        </div>
      )}
    </div>
  )
}
