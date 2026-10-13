import React from 'react'
import { NavLink } from 'react-router-dom'
import { Utensils, BarChart3, User } from 'lucide-react'

export const BottomNav: React.FC = () => {
  const navItems = [
    {
      to: '/',
      label: 'Сегодня',
      icon: Utensils,
    },
    {
      to: '/stats',
      label: 'Статистика',
      icon: BarChart3,
    },
    {
      to: '/profile',
      label: 'Профиль',
      icon: User,
    },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#141418]/95 backdrop-blur-xl border-t border-neutral-800/80 px-4 py-2 safe-bottom">
      <div className="max-w-md mx-auto flex items-center justify-around h-14">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 py-1 px-2 rounded-xl transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'text-emerald-400 font-semibold'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`relative p-1 rounded-xl transition-all ${
                      isActive ? 'bg-emerald-500/10' : ''
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 transition-transform duration-200 ${
                        isActive ? 'scale-110 stroke-[2.3]' : 'stroke-[1.8]'
                      }`}
                    />
                    {isActive && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-400 rounded-full" />
                    )}
                  </div>
                  <span className="text-[11px] mt-0.5 tracking-tight">
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
