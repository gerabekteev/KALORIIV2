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
    <header className="sticky top-0 z-30 bg-[#0b0b0e]/80 backdrop-blur-2xl border-b border-white/[0.06] px-4 pt-[max(0.875rem,env(safe-area-inset-top))] pb-3 transition-all">
      <div className="max-w-lg mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.28)] ring-1 ring-white/20">
            <Flame className="w-5 h-5 text-white fill-white drop-shadow-sm" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-white via-neutral-100 to-neutral-300 bg-clip-text text-transparent">
                {title || 'KaloriiAI'}
              </span>
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 shadow-[0_0_10px_rgba(16,185,129,0.12)]">
                <Sparkles className="w-2.5 h-2.5 text-emerald-400" /> AI
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
          <div className="flex items-center gap-2.5 bg-white/[0.03] border border-white/[0.07] pl-3 pr-1.5 py-1 rounded-full">
            <div className="flex flex-col items-end">
              <span className="text-xs font-semibold text-neutral-100 leading-tight">
                {user.name || user.email.split('@')[0]}
              </span>
              {user.daily_calories_goal ? (
                <span className="text-[10px] text-emerald-400/90 font-medium leading-tight">
                  {user.daily_calories_goal} ккал
                </span>
              ) : null}
            </div>
            <div className="w-7 h-7 rounded-full bg-gradient-to-b from-neutral-700 to-neutral-800 border border-white/10 flex items-center justify-center text-xs font-bold text-emerald-400 shadow-inner">
              {(user.name?.[0] || user.email[0] || 'U').toUpperCase()}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
