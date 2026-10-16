import React from 'react'
import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { Header } from './Header'
import { AddMealModal } from '../meals/AddMealModal'
import { EditMealModal } from '../meals/EditMealModal'
import { AIResultModal } from '../meals/AIResultModal'

export const Layout: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-neutral-100 flex flex-col font-sans antialiased selection:bg-emerald-500 selection:text-white">
      {/* Main Page Header */}
      <Header />

      {/* Main Content Area: Responsive container up to max-w-lg on mobile/tablet */}
      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-4 pb-28">
        <Outlet />
      </main>

      {/* Global Modals */}
      <AddMealModal />
      <EditMealModal />
      <AIResultModal />

      {/* 3-Tab Bottom Navigation */}
      <BottomNav />
    </div>
  )
}
