import React from 'react'
import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { Header } from './Header'
import { AddMealModal } from '../meals/AddMealModal'
import { EditMealModal } from '../meals/EditMealModal'

export const Layout: React.FC = () => {
  return (
    <div className="relative min-h-screen bg-[#0b0b0e] text-neutral-100 flex flex-col font-sans antialiased selection:bg-emerald-500 selection:text-white overflow-x-hidden">
      {/* Subtle Ambient Background Lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[560px] h-[280px] bg-emerald-500/[0.06] blur-[110px] rounded-full z-0"
      />

      {/* Main Page Header */}
      <Header />

      {/* Main Content Area: Responsive container up to max-w-lg on mobile/tablet */}
      <main className="relative z-10 flex-1 w-full max-w-lg mx-auto px-4 py-4 pb-28">
        <Outlet />
      </main>

      {/* Global Modals */}
      <AddMealModal />
      <EditMealModal />

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  )
}
