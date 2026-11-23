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
          className={`w-12 h-12 rounded-full mx-auto flex items-center justify-center ${
            isDangerous
              ? 'bg-[#E02424]/15 text-[#E02424]'
              : 'bg-white/10 text-white'
          }`}
        >
          {isDangerous ? (
            <Trash2 className="w-5 h-5" />
          ) : (
            <AlertTriangle className="w-5 h-5" />
          )}
        </div>

        <div className="space-y-1.5 px-2">
          <h3 className="text-base font-semibold text-white tracking-tight">{title}</h3>
          {description && (
            <p className="text-xs text-[#8E8E96] leading-relaxed">{description}</p>
          )}
        </div>

        <div className="nothing-dotted-divider" />

        <div className="flex items-center gap-2.5 pt-1">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="flex-1 text-xs"
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
            className="flex-1 text-xs"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
