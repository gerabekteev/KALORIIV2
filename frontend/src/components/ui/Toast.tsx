import React from 'react'
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useUIStore()

  if (toasts.length === 0) return null

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />,
    info: <Info className="w-5 h-5 text-blue-400 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
  }

  const borderColors = {
    success: 'border-emerald-500/30 bg-[#162720]/95',
    error: 'border-red-500/30 bg-[#291717]/95',
    info: 'border-blue-500/30 bg-[#171f2e]/95',
    warning: 'border-amber-500/30 bg-[#2b2214]/95',
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[999] w-[90%] max-w-md flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border backdrop-blur-md shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-top-3 ${
            borderColors[toast.type]
          }`}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            {icons[toast.type]}
            <p className="text-sm font-medium text-neutral-100 truncate">
              {toast.message}
            </p>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="p-1 text-neutral-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
