import React, { useEffect } from 'react'
import { X } from 'lucide-react'

const modalStack: Array<() => void> = []
const customBackHandlers: Array<() => boolean> = []

/**
 * Регистрирует приоритетный обработчик кнопки «Назад» (например, для возврата из подрежима в хаб AddMealModal или закрытия лайтбокса).
 */
export function registerBackHandler(handler: () => boolean): () => void {
  customBackHandlers.push(handler)
  return () => {
    const idx = customBackHandlers.lastIndexOf(handler)
    if (idx !== -1) customBackHandlers.splice(idx, 1)
  }
}

/**
 * Закрывает верхний активный слой (подрежим или модальное окно).
 * Возвращает true, если что-то было закрыто, иначе false.
 */
export function closeTopModal(): boolean {
  for (let i = customBackHandlers.length - 1; i >= 0; i--) {
    if (customBackHandlers[i]()) {
      return true
    }
  }
  if (modalStack.length > 0) {
    const topClose = modalStack[modalStack.length - 1]
    if (topClose) {
      topClose()
      return true
    }
  }
  return false
}

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  hideBackdrop?: boolean
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'md',
  hideBackdrop = false,
}) => {
  const [depth, setDepth] = React.useState(1)

  useEffect(() => {
    if (!isOpen) return
    modalStack.push(onClose)
    setDepth(modalStack.length)
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const topClose = modalStack[modalStack.length - 1]
        if (topClose === onClose) {
          onClose()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      const idx = modalStack.lastIndexOf(onClose)
      if (idx !== -1) modalStack.splice(idx, 1)
      if (modalStack.length === 0) {
        document.body.style.overflow = ''
      }
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-full',
  }

  const isTopModal = depth > 1
  const zIndexClass = isTopModal ? 'z-[60]' : 'z-50'

  return (
    <div className={`fixed inset-0 ${zIndexClass} flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200`}>
      {/* Backdrop */}
      {!hideBackdrop && (
        <div
          className={`fixed inset-0 transition-opacity ${
            isTopModal ? 'bg-black/40' : 'bg-black/75 backdrop-blur-sm'
          }`}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Modal Dialog / Mobile Bottom Sheet */}
      <div
        className={`relative w-full ${maxWidthClasses[maxWidth]} bg-gradient-to-b from-[#1d1d24] to-[#141419] border border-white/[0.09] rounded-t-3xl sm:rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.85)] overflow-hidden max-h-[90dvh] flex flex-col z-10 transition-transform duration-200 ease-out`}
        style={{
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
        }}
        role="dialog"
        aria-modal="true"
      >
        {/* Mobile handle indicator */}
        <button
          type="button"
          onClick={onClose}
          className="w-full flex items-center justify-center py-2.5 sm:hidden shrink-0 cursor-pointer focus:outline-none"
          aria-label="Смахнуть вниз"
        >
          <span className="w-12 h-1.5 bg-neutral-700/80 rounded-full" />
        </button>

        {/* Header */}
        {(title || description) && (
          <div className="flex items-center justify-between px-4 sm:px-6 pt-1 sm:pt-4 pb-3 border-b border-neutral-800/80 shrink-0">
            <div>
              {title && <h2 className="text-lg font-semibold text-white tracking-tight">{title}</h2>}
              {description && (
                <p className="text-xs text-neutral-400 mt-0.5">{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800/80 rounded-xl transition-colors cursor-pointer"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="px-4 sm:px-6 py-4 overflow-y-auto overflow-x-hidden flex-1 text-neutral-200">
          {children}
        </div>
      </div>
    </div>
  )
}
