import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card } from '../components/ui/Card'

export const LoginPage: React.FC = () => {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const { addToast } = useUIStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errors: { email?: string; password?: string } = {}
    if (!email.trim()) errors.email = 'Введите email'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errors.email = 'Некорректный формат email'
    if (!password) errors.password = 'Введите пароль'

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})

    setIsLoading(true)
    try {
      await login({ email, password })
      addToast('Добро пожаловать!', 'success')
      navigate('/')
    } catch (err: any) {
      addToast(err.message || 'Неверный email или пароль', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-black flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Nothing Brand Header */}
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#1A1A1D]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E02424]" />
            <span className="font-ndot text-lg font-bold tracking-wider text-white">
              KALORII<span className="text-[#7A7A82]">.AI</span>
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white my-0">
            Вход в аккаунт
          </h1>
          <p className="text-xs text-[#7A7A82]">
            Умный подсчёт калорий и макронутриентов
          </p>
        </div>

        {/* Login Form Card */}
        <Card variant="default" padding="lg" className="space-y-4">
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="name@example.com"
              value={email}
              error={fieldErrors.email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }))
              }}
              leftIcon={<Mail className="w-4 h-4" />}
              autoComplete="email"
              required
            />

            <Input
              label="Пароль"
              type="password"
              placeholder="••••••••"
              value={password}
              error={fieldErrors.password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }))
              }}
              leftIcon={<Lock className="w-4 h-4" />}
              autoComplete="current-password"
              required
            />

            <div className="nothing-dotted-divider pt-1" />

            <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
              Войти
            </Button>
          </form>
        </Card>

        {/* Register Link */}
        <div className="text-center">
          <p className="text-xs text-[#7A7A82]">
            Нет аккаунта?{' '}
            <Link
              to="/register"
              className="font-semibold text-white hover:text-[#E4E4E7] underline underline-offset-4"
            >
              Зарегистрироваться
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
