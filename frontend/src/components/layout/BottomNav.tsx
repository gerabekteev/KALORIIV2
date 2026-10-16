import React from 'react'
import { NavLink } from 'react-router-dom'
import { Utensils, BarChart3, User, Plus, ChefHat } from 'lucide-react'
import { useMealsStore } from '../../store/mealsStore'
import { useUIStore } from '../../store/uiStore'

export const BottomNav: React.FC = () => {
  const { pendingMeals } = useMealsStore()
  const { openAddMeal } = useUIStore()
  const hasAnalyzingMeals = pendingMeals.some((p) => p.status === 'analyzing')

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#141418]/95 backdrop-blur-xl border-t border-neutral-800/80 px-4 py-1.5 safe-bottom">
      <div className="max-w-lg mx-auto flex items-center justify-around h-14">
        {/* Tab 1: Сегодня */}
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-200 cursor-pointer ${
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
                <Utensils
                  className={`w-5 h-5 transition-transform duration-200 ${
                    isActive ? 'scale-110 stroke-[2.3]' : 'stroke-[1.8]'
                  }`}
                />
                {hasAnalyzingMeals && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
                  </span>
                )}
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-400 rounded-full" />
                )}
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">Сегодня</span>
            </>
          )}
        </NavLink>

        {/* Tab 2: Что съесть (AI Меню) */}
        <NavLink
          to="/meal-plan"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-200 cursor-pointer ${
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
                <ChefHat
                  className={`w-5 h-5 transition-transform duration-200 ${
                    isActive ? 'scale-110 stroke-[2.3]' : 'stroke-[1.8]'
                  }`}
                />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-400 rounded-full" />
                )}
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">Что съесть</span>
            </>
          )}
        </NavLink>

        {/* Central Action: Добавить еду */}
        <button
          type="button"
          onClick={openAddMeal}
          className="flex flex-col items-center justify-center flex-1 py-1 px-1 cursor-pointer group active:scale-95 transition-transform"
          title="Добавить еду в дневник"
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-500 to-emerald-400 flex items-center justify-center text-white shadow-lg shadow-emerald-500/25 group-hover:scale-105 transition-transform -mt-2 border-2 border-[#141418]">
            <Plus className="w-5 h-5 stroke-[2.8]" />
          </div>
          <span className="text-[10px] font-semibold text-emerald-400 mt-0.5 tracking-tight">
            Добавить
          </span>
        </button>

        {/* Tab 2: Статистика */}
        <NavLink
          to="/stats"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-200 cursor-pointer ${
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
                <BarChart3
                  className={`w-5 h-5 transition-transform duration-200 ${
                    isActive ? 'scale-110 stroke-[2.3]' : 'stroke-[1.8]'
                  }`}
                />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-400 rounded-full" />
                )}
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">Статистика</span>
            </>
          )}
        </NavLink>

        {/* Tab 3: Профиль */}
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-200 cursor-pointer ${
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
                <User
                  className={`w-5 h-5 transition-transform duration-200 ${
                    isActive ? 'scale-110 stroke-[2.3]' : 'stroke-[1.8]'
                  }`}
                />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-400 rounded-full" />
                )}
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">Профиль</span>
            </>
          )}
        </NavLink>
      </div>
    </nav>
  )
}
