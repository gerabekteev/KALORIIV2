import React from 'react'
import {
  Clock,
  AlertCircle,
  RotateCcw,
  Trash2,
  Loader2,
  MessageSquare,
  Image as ImageIcon,
} from 'lucide-react'
import { PendingAIMeal } from '../../types'

interface PendingMealCardProps {
  pendingMeal: PendingAIMeal
  onRetry: (id: string) => void
  onDismiss: (id: string) => void
}

export const PendingMealCard: React.FC<PendingMealCardProps> = ({
  pendingMeal,
  onRetry,
  onDismiss,
}) => {
  const isAnalyzing = pendingMeal.status === 'analyzing'
  const isError = pendingMeal.status === 'error'
  const isPhoto = pendingMeal.type === 'photo'

  const titleText = isPhoto
    ? pendingMeal.comment?.trim() || 'Распознавание фото блюда...'
    : pendingMeal.textDescription?.trim() || 'Расчёт КБЖУ по описанию...'

  return (
    <div
      className={`relative overflow-hidden rounded-[22px] p-3.5 transition-all duration-200 ${
        isError
          ? 'bg-[#1A1A1D] border border-[#E02424]/50'
          : 'bg-[#1A1A1D] border border-white/[0.1]'
      }`}
    >
      <div className="relative flex items-start gap-3">
        {/* Thumbnail */}
        <div className="relative w-14 h-14 rounded-2xl bg-[#111113] overflow-hidden shrink-0 flex items-center justify-center">
          {isPhoto && pendingMeal.previewUrl ? (
            <>
              <img
                src={pendingMeal.previewUrl}
                alt="Загруженное фото"
                className="w-full h-full object-cover opacity-80"
              />
              {isAnalyzing && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#222226]">
              {isAnalyzing ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : isPhoto ? (
                <ImageIcon className="w-5 h-5 text-[#E02424]" />
              ) : (
                <MessageSquare className="w-5 h-5 text-white" />
              )}
            </div>
          )}

          {/* Surgical red live/error dot */}
          <span
            className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#E02424] ${
              isAnalyzing ? 'animate-pulse' : ''
            }`}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white truncate my-0">
              {titleText}
            </h3>
            <span className="font-ndot text-xs text-[#7A7A82] flex items-center gap-1 shrink-0">
              <Clock className="w-3 h-3" />
              {pendingMeal.targetTime}
            </span>
          </div>

          {isAnalyzing ? (
            <div className="mt-2 space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#2A2A2F] text-white text-[11px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E02424] animate-ping" />
                <span>AI определяет КБЖУ...</span>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="h-3.5 w-14 bg-[#2A2A2F] rounded-full animate-pulse" />
                <div className="h-3.5 w-10 bg-[#2A2A2F] rounded-full animate-pulse" />
                <div className="h-3.5 w-10 bg-[#2A2A2F] rounded-full animate-pulse" />
              </div>
            </div>
          ) : isError ? (
            <div className="mt-2 space-y-2">
              <div className="inline-flex items-center gap-1.5 text-[#E02424] text-xs font-medium">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[230px] sm:max-w-xs">
                  {pendingMeal.errorMessage || 'Ошибка обработки AI'}
                </span>
              </div>

              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => onRetry(pendingMeal.id)}
                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-white hover:bg-neutral-200 text-black font-semibold transition-colors cursor-pointer active:scale-95"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Повторить</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDismiss(pendingMeal.id)}
                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-[#2A2A2F] hover:bg-[#34343B] text-[#E4E4E7] font-medium transition-colors cursor-pointer active:scale-95"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Убрать</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
