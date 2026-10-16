import React from 'react'
import { Flame, Sparkles } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

interface HeaderProps {
  title?: string
  subtitle?: string
  showDate?: boolean
  selectedDate?: string
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
}) => {
  const { user } = useAuthStore()

  return (
    <header className="sticky top-0 z-30 bg-[#0f0f0f]/90 backdrop-blur-xl border-b border-neutral-800/60 px-4 pt-[max(0.875rem,env(safe-area-inset-top))] pb-3.5 transition-all">
      <div className="max-w-lg mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Flame className="w-5 h-5 text-white fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base tracking-tight text-white">
                {title || 'KaloriiAI'}
              </span>
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                <Sparkles className="w-2.5 h-2.5" /> AI
              </span>
            </div>
            {subtitle && (
              <p className="text-[11px] text-neutral-400 font-medium leading-none mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {user && (
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end">
              <span className="text-xs font-semibold text-neutral-200">
                {user.name || user.email.split('@')[0]}
              </span>
              {user.daily_calories_goal ? (
                <span className="text-[10px] text-neutral-400">
                  цель: {user.daily_calories_goal} ккал
                </span>
              ) : null}
            </div>
            <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xs font-bold text-emerald-400 shadow-inner">
              {(user.name?.[0] || user.email[0] || 'U').toUpperCase()}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
