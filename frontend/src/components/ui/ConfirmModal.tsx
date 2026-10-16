import React from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'

export interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  isDangerous?: boolean
  isLoading?: boolean
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Подтвердить',
  cancelText = 'Отмена',
  isDangerous = false,
  isLoading = false,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="sm">
      <div className="text-center py-2 space-y-4">
        <div
          className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center shadow-lg ${
            isDangerous
              ? 'bg-red-500/15 text-red-400 border border-red-500/25 shadow-red-500/10'
              : 'bg-amber-500/15 text-amber-400 border border-amber-500/25 shadow-amber-500/10'
          }`}
        >
          {isDangerous ? (
            <Trash2 className="w-6 h-6" />
          ) : (
            <AlertTriangle className="w-6 h-6" />
          )}
        </div>

        <div className="space-y-1.5 px-2">
          <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
          {description && (
            <p className="text-xs text-neutral-400 leading-relaxed">{description}</p>
          )}
        </div>

        <div className="flex items-center gap-2.5 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="flex-1 text-xs text-neutral-400 hover:text-white"
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={isDangerous ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
            isLoading={isLoading}
            className="flex-1 text-xs font-semibold"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
