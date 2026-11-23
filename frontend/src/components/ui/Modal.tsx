import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'

const modalStack: Array<() => void> = []
const customBackHandlers: Array<() => boolean> = []

export function registerBackHandler(handler: () => boolean): () => void {
  customBackHandlers.push(handler)
  return () => {
    const idx = customBackHandlers.lastIndexOf(handler)
    if (idx !== -1) customBackHandlers.splice(idx, 1)
  }
}

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

const EXIT_DURATION_MS = 240

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'md',
  hideBackdrop = false,
}) => {
  const [depth, setDepth] = useState(1)
  const [shouldRender, setShouldRender] = useState(isOpen)
  const [isVisible, setIsVisible] = useState(false)

  // Smooth mount -> enter (double rAF) -> exit -> unmount lifecycle
  useEffect(() => {
    let raf1 = 0
    let raf2 = 0
    let unmountTimer = 0

    if (isOpen) {
      setShouldRender(true)
      raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => {
          setIsVisible(true)
        })
      })
    } else {
      setIsVisible(false)
      unmountTimer = window.setTimeout(() => {
        setShouldRender(false)
      }, EXIT_DURATION_MS)
    }

    return () => {
      if (raf1) window.cancelAnimationFrame(raf1)
      if (raf2) window.cancelAnimationFrame(raf2)
      if (unmountTimer) window.clearTimeout(unmountTimer)
    }
  }, [isOpen])

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

  if (!shouldRender) return null

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
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-end sm:items-center justify-center p-0 sm:p-4 ${
        isVisible ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      {/* Smooth Fading Backdrop */}
      {!hideBackdrop && (
        <div
          className={`fixed inset-0 transition-opacity duration-[260ms] ease-out ${
            isTopModal ? 'bg-black/55' : 'bg-black/80 backdrop-blur-[4px]'
          } ${isVisible ? 'opacity-100' : 'opacity-0'}`}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Smooth Rising Mobile Bottom-Sheet / Scaling Desktop Dialog */}
      <div
        className={`relative w-full ${maxWidthClasses[maxWidth]} bg-[#111113] border border-white/[0.08] rounded-t-[28px] sm:rounded-[26px] shadow-[0_24px_80px_rgba(0,0,0,0.9)] overflow-hidden max-h-[90dvh] flex flex-col z-10 will-change-transform transition-[transform,opacity] ${
          isVisible
            ? 'duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] translate-y-0 sm:scale-100 opacity-100'
            : 'duration-[230ms] ease-[cubic-bezier(0.32,0.72,0,1)] translate-y-full sm:translate-y-5 sm:scale-[0.96] sm:opacity-0'
        }`}
        style={{
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
        }}
        role="dialog"
        aria-modal="true"
      >
        {/* Mobile grab handle */}
        <button
          type="button"
          onClick={onClose}
          className="w-full flex items-center justify-center py-2.5 sm:hidden shrink-0 cursor-pointer focus:outline-none"
          aria-label="Закрыть окно"
        >
          <span className="w-10 h-1 bg-[#3A3A40] rounded-full" />
        </button>

        {(title || description) && (
          <div className="px-4 sm:px-6 pt-1 sm:pt-4 pb-3 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                {title && (
                  <h2 className="text-lg font-semibold text-white tracking-tight truncate">
                    {title}
                  </h2>
                )}
                {description && (
                  <p className="text-xs text-[#7A7A82] mt-0.5">{description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-[#1E1E22] hover:bg-[#2A2A30] text-[#A1A1AA] hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="nothing-dotted-divider mt-3" />
          </div>
        )}

        <div className="px-4 sm:px-6 py-3.5 overflow-y-auto overflow-x-hidden flex-1 text-[#E4E4E7]">
          {children}
        </div>
      </div>
    </div>
  )
}
