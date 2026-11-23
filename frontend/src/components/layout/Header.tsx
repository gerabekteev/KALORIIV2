import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useMealsStore } from '../../store/mealsStore'

interface HeaderProps {
  title?: string
  subtitle?: string
}

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Сегодня',
  '/meal-plan': 'Что съесть',
  '/stats': 'Статистика',
  '/profile': 'Профиль',
}

export const Header: React.FC<HeaderProps> = ({ title }) => {
  const { user } = useAuthStore()
  const { pendingMeals } = useMealsStore()
  const location = useLocation()
  const navigate = useNavigate()

  const pageTitle = title || ROUTE_TITLES[location.pathname] || 'KaloriiAI'
  const hasAnalyzing = pendingMeals.some((p) => p.status === 'analyzing')

  return (
    <header className="lg:hidden sticky top-0 z-30 bg-black/90 backdrop-blur-xl px-4 pt-[max(0.875rem,env(safe-area-inset-top))] pb-2.5">
      <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-white truncate my-0">
            {pageTitle}
          </h1>
          {hasAnalyzing && (
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#1A1A1D] text-[10px] font-ndot font-bold text-white"
              title="ИИ анализирует блюдо в фоне"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E02424] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#E02424]" />
              </span>
              AI
            </span>
          )}
        </div>

        {user && (
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2 bg-[#1A1A1D] hover:bg-[#222226] pl-3 pr-1.5 py-1 rounded-full transition-colors cursor-pointer shrink-0 active:scale-95"
            aria-label="Открыть профиль"
          >
            {user.daily_calories_goal ? (
              <span className="font-ndot text-xs font-bold text-[#A1A1AA]">
                {user.daily_calories_goal}
              </span>
            ) : null}
            <div className="w-7 h-7 rounded-full bg-[#2A2A2F] flex items-center justify-center text-xs font-semibold text-white">
              {(user.name?.[0] || user.email[0] || 'U').toUpperCase()}
            </div>
          </button>
        )}
      </div>
    </header>
  )
}
