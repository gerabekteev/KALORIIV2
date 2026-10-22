import React, { useEffect, useState, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import { Download, X } from 'lucide-react'
import { BottomNav } from './BottomNav'
import { Header } from './Header'
import { AddMealModal } from '../meals/AddMealModal'
import { EditMealModal } from '../meals/EditMealModal'
import {
  APP_VERSION,
  checkServerAppVersion,
  downloadLatestApk,
  isNativeApp,
} from '../../utils/platform'

const DISMISSED_UPDATE_KEY = 'kalorii_dismissed_update_version'

export const Layout: React.FC = () => {
  const [availableUpdateVersion, setAvailableUpdateVersion] = useState<string | null>(null)

  const checkForUpdate = useCallback(async () => {
    const info = await checkServerAppVersion()
    if (!info || !info.hasUpdate) {
      setAvailableUpdateVersion(null)
      return
    }
    try {
      const dismissed = sessionStorage.getItem(DISMISSED_UPDATE_KEY)
      if (dismissed === info.remoteVersion) return
    } catch {
      // Ignore storage errors
    }
    setAvailableUpdateVersion(info.remoteVersion)
  }, [])

  useEffect(() => {
    checkForUpdate()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', checkForUpdate)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', checkForUpdate)
    }
  }, [checkForUpdate])

  const handleDismissUpdate = () => {
    if (availableUpdateVersion) {
      try {
        sessionStorage.setItem(DISMISSED_UPDATE_KEY, availableUpdateVersion)
      } catch {
        // Ignore storage errors
      }
    }
    setAvailableUpdateVersion(null)
  }

  const handleUpdateAction = () => {
    const targetVersion = availableUpdateVersion || APP_VERSION
    if (isNativeApp()) {
      downloadLatestApk(targetVersion)
    } else {
      downloadLatestApk(targetVersion)
    }
  }

  return (
    <div className="relative min-h-screen bg-[#0b0b0e] text-neutral-100 flex flex-col font-sans antialiased selection:bg-emerald-500 selection:text-white overflow-x-hidden">
      {/* Subtle Ambient Background Lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[560px] h-[280px] bg-emerald-500/[0.06] blur-[110px] rounded-full z-0"
      />

      {/* Main Page Header */}
      <Header />

      {/* Background Update Notification Banner */}
      {availableUpdateVersion && (
        <div className="relative z-20 w-full max-w-lg mx-auto px-4 pt-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="bg-gradient-to-r from-emerald-500/15 via-[#181a1f] to-[#18181c] border border-emerald-500/35 rounded-2xl p-3 flex items-center justify-between gap-2.5 shadow-lg shadow-emerald-950/20">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <Download className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white leading-tight truncate my-0">
                  Доступно обновление v{availableUpdateVersion}
                </p>
                <p className="text-[11px] text-neutral-400 leading-tight truncate mt-0.5 my-0">
                  Скачайте новую версию приложения KaloriiAI
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleUpdateAction}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs transition-colors cursor-pointer active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Скачать</span>
              </button>
              <button
                type="button"
                onClick={handleDismissUpdate}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition-colors cursor-pointer"
                title="Скрыть уведомление"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

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
