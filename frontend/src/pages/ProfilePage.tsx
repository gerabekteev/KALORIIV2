import React, { useState, useEffect } from 'react'
import {
  User,
  Calculator,
  Scale,
  LogOut,
  Sparkles,
  Save,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { profileApi } from '../api/profile'
import { Gender, ActivityLevel } from '../types'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { AISettingsCard } from '../components/settings/AISettingsCard'

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

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
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
        daily_calories_goal: parseInt(goalCalories, 10) || 2200,
        daily_protein_goal: parseInt(goalProtein, 10) || 140,
        daily_fat_goal: parseInt(goalFat, 10) || 73,
        daily_carbs_goal: parseInt(goalCarbs, 10) || 275,
      })
      setUser(updatedUser)
      addToast('Профиль и цели сохранены!', 'success')
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

      <form onSubmit={handleSaveProfile} className="space-y-4">
        {/* Body Parameters */}
        <Card variant="default" padding="md" className="space-y-3.5">
          <div className="flex items-center gap-2 border-b border-neutral-800 pb-2">
            <User className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Параметры тела</h3>
          </div>

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
                    : 'bg-[#18181b] border-neutral-800 text-neutral-400 hover:text-white'
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
                    : 'bg-[#18181b] border-neutral-800 text-neutral-400 hover:text-white'
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
              className="w-full bg-[#18181b] border border-neutral-800 text-white rounded-xl px-3 py-2.5 text-xs outline-none focus:border-emerald-500"
            >
              <option value="sedentary">Сидячий образ жизни (мало или нет тренировок)</option>
              <option value="light">Легкая активность (тренировки 1-3 раза в неделю)</option>
              <option value="moderate">Умеренная активность (тренировки 3-5 раз в неделю)</option>
              <option value="active">Высокая активность (тренировки 6-7 раз в неделю)</option>
              <option value="very_active">Экстремальная активность (тяжелый спорт/труд)</option>
            </select>
          </div>
        </Card>

        {/* KBJU Goals & Calculator */}
        <Card variant="default" padding="md" className="space-y-3.5">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Дневные цели КБЖУ</h3>
            </div>
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

          <div className="grid grid-cols-3 gap-2">
            <Input
              label="Белки (г/день)"
              type="number"
              value={goalProtein}
              onChange={(e) => setGoalProtein(e.target.value)}
            />
            <Input
              label="Жиры (г/день)"
              type="number"
              value={goalFat}
              onChange={(e) => setGoalFat(e.target.value)}
            />
            <Input
              label="Углеводы (г/день)"
              type="number"
              value={goalCarbs}
              onChange={(e) => setGoalCarbs(e.target.value)}
            />
          </div>
        </Card>

        {/* Save Button */}
        <Button
          type="submit"
          className="w-full"
          size="lg"
          isLoading={isSaving}
          leftIcon={<Save className="w-4 h-4" />}
        >
          Сохранить профиль и цели
        </Button>
      </form>

      {/* Quick Weight Log Entry */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex items-center gap-2 border-b border-neutral-800 pb-2">
          <Scale className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-bold text-white">Журнал веса</h3>
        </div>

        <p className="text-xs text-neutral-400">
          Внесите текущий вес сегодня для отслеживания динамики на графике
        </p>

        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.1"
            placeholder="Например: 78.5"
            value={newWeightLog}
            onChange={(e) => setNewWeightLog(e.target.value)}
            className="flex-1 bg-[#18181b] border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-emerald-500"
          />
          <Button
            type="button"
            size="md"
            variant="secondary"
            onClick={handleLogQuickWeight}
            isLoading={isLoggingWeight}
          >
            Записать вес
          </Button>
        </div>
      </Card>

      {/* Interactive AI Model Settings & Providers */}
      <AISettingsCard />
    </div>
  )
}
