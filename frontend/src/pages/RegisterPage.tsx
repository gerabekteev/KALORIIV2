import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Flame, Mail, Lock, User, Sparkles } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card } from '../components/ui/Card'

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate()
  const { register } = useAuthStore()
  const { addToast } = useUIStore()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string
    email?: string
    password?: string
    confirmPassword?: string
  }>({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errors: typeof fieldErrors = {}

    if (!name.trim()) errors.name = 'Введите ваше имя'
    if (!email.trim()) errors.email = 'Введите email'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Некорректный формат email'
    if (!password) errors.password = 'Введите пароль'
    else if (password.length < 6) errors.password = 'Пароль должен быть не менее 6 символов'
    if (password !== confirmPassword) errors.confirmPassword = 'Пароли не совпадают'

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})

    setIsLoading(true)
    try {
      await register({ name, email, password })
      addToast('Регистрация прошла успешно!', 'success')
      navigate('/')
    } catch (err: any) {
      addToast(err.message || 'Ошибка регистрации', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-400 shadow-xl shadow-emerald-500/20 mb-2">
            <Flame className="w-8 h-8 text-white fill-white" />
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-white my-0">
              Создать аккаунт
            </h1>
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
              <Sparkles className="w-3 h-3" /> AI
            </span>
          </div>
          <p className="text-xs text-neutral-400">
            Начните вести учет питания с искусственным интеллектом
          </p>
        </div>

        {/* Register Form Card */}
        <Card variant="default" padding="lg">
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <Input
              label="Ваше имя *"
              placeholder="Введите ваше имя"
              value={name}
              error={fieldErrors.name}
              onChange={(e) => {
                setName(e.target.value)
                if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: undefined }))
              }}
              leftIcon={<User className="w-4 h-4" />}
              required
            />

            <Input
              label="Email *"
              type="email"
              placeholder="name@example.com"
              value={email}
              error={fieldErrors.email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }))
              }}
              leftIcon={<Mail className="w-4 h-4" />}
              autoComplete="email"
              required
            />

            <Input
              label="Пароль *"
              type="password"
              placeholder="Минимум 6 символов"
              value={password}
              error={fieldErrors.password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }))
              }}
              leftIcon={<Lock className="w-4 h-4" />}
              autoComplete="new-password"
              required
            />

            <Input
              label="Повторите пароль *"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              error={fieldErrors.confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                if (fieldErrors.confirmPassword) setFieldErrors((p) => ({ ...p, confirmPassword: undefined }))
              }}
              leftIcon={<Lock className="w-4 h-4" />}
              autoComplete="new-password"
              required
            />

            <Button
              type="submit"
              className="w-full mt-2"
              size="lg"
              isLoading={isLoading}
            >
              Зарегистрироваться
            </Button>
          </form>
        </Card>

        {/* Login Link */}
        <div className="text-center">
          <p className="text-xs text-neutral-400">
            Уже есть аккаунт?{' '}
            <Link
              to="/login"
              className="font-semibold text-emerald-400 hover:text-emerald-300 underline underline-offset-4"
            >
              Войти
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
