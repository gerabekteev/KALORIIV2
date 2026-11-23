import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, User } from 'lucide-react'
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
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errors.email = 'Некорректный формат email'
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
    <div className="min-h-dvh bg-black flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Nothing Brand Header */}
        <div className="text-center space-y-3">
          <img
            src="/icon.svg?v=2.0.2"
            alt="KaloriiAI"
            className="w-16 h-16 mx-auto rounded-[18px] border border-white/[0.08] shadow-[0_8px_24px_rgba(0,0,0,0.65)]"
          />
          <div className="font-ndot text-lg font-bold tracking-wider text-white">
            KALORII<span className="text-[#7A7A82]">.AI</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white my-0">
            Создать аккаунт
          </h1>
          <p className="text-xs text-[#7A7A82]">
            Начните вести учёт питания с искусственным интеллектом
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
                if (fieldErrors.confirmPassword)
                  setFieldErrors((p) => ({ ...p, confirmPassword: undefined }))
              }}
              leftIcon={<Lock className="w-4 h-4" />}
              autoComplete="new-password"
              required
            />

            <div className="nothing-dotted-divider pt-1" />

            <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
              Зарегистрироваться
            </Button>
          </form>
        </Card>

        {/* Login Link */}
        <div className="text-center">
          <p className="text-xs text-[#7A7A82]">
            Уже есть аккаунт?{' '}
            <Link
              to="/login"
              className="font-semibold text-white hover:text-[#E4E4E7] underline underline-offset-4"
            >
              Войти
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
