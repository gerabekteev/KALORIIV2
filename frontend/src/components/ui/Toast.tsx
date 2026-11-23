import React from 'react'
import { X } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useUIStore()

  if (toasts.length === 0) return null

  const dotColors = {
    success: 'bg-white',
    error: 'bg-[#E02424]',
    info: 'bg-[#A1A1AA]',
    warning: 'bg-[#E02424]',
  }

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 lg:left-[calc(50%+114px)] z-[999] w-[92%] max-w-md flex flex-col gap-2 pointer-events-none"
      style={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom, 0px))' }}
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-full bg-[#1A1A1D]/95 border border-white/[0.12] backdrop-blur-xl shadow-[0_14px_40px_rgba(0,0,0,0.8)] transition-all duration-200 animate-in fade-in slide-in-from-bottom-3"
        >
          <div className="flex items-center gap-2.5 overflow-hidden">
            <span className={`w-2 h-2 rounded-full shrink-0 ${dotColors[toast.type]}`} />
            <p className="text-xs sm:text-sm font-medium text-white truncate">
              {toast.message}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick()
                  removeToast(toast.id)
                }}
                className="min-h-[32px] px-3 py-1 text-xs font-semibold text-black bg-white hover:bg-neutral-200 active:scale-95 rounded-full transition-all cursor-pointer"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="p-1.5 text-[#7A7A82] hover:text-white rounded-full transition-colors cursor-pointer"
              aria-label="Закрыть уведомление"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
