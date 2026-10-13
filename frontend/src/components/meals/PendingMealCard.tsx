import React from 'react'
import {
  Sparkles,
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
      className={`relative overflow-hidden rounded-2xl p-3.5 transition-all duration-300 shadow-md ${
        isAnalyzing
          ? 'bg-[#1b1c21] border border-emerald-500/50 shadow-emerald-950/20 ring-1 ring-emerald-500/20'
          : 'bg-[#22181a] border border-rose-500/50 shadow-rose-950/20'
      }`}
    >
      {/* Background subtle animated gradient sheen for analyzing state */}
      {isAnalyzing && (
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/5 to-emerald-500/0 animate-pulse pointer-events-none" />
      )}

      <div className="relative flex items-start gap-3">
        {/* Thumbnail / Icon container */}
        <div className="relative w-14 h-14 rounded-xl bg-neutral-800 border border-neutral-700/60 overflow-hidden shrink-0 flex items-center justify-center">
          {isPhoto && pendingMeal.previewUrl ? (
            <>
              <img
                src={pendingMeal.previewUrl}
                alt="Загруженное фото"
                className="w-full h-full object-cover"
              />
              {isAnalyzing && (
                <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px] flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-950/50 to-neutral-900">
              {isAnalyzing ? (
                <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
              ) : isPhoto ? (
                <ImageIcon className="w-6 h-6 text-rose-400" />
              ) : (
                <MessageSquare className="w-6 h-6 text-emerald-400" />
              )}
            </div>
          )}

          {/* AI badge in corner */}
          <div
            className={`absolute top-1 right-1 p-0.5 rounded-full shadow-sm ${
              isAnalyzing ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
            }`}
          >
            {isAnalyzing ? (
              <Sparkles className="w-2.5 h-2.5" />
            ) : (
              <AlertCircle className="w-2.5 h-2.5" />
            )}
          </div>
        </div>

        {/* Info & progress section */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white truncate">
              {titleText}
            </h3>
            <span className="text-xs text-neutral-400 flex items-center gap-1 shrink-0 font-medium">
              <Clock className="w-3 h-3 text-neutral-500" />
              {pendingMeal.targetTime}
            </span>
          </div>

          {/* Status line */}
          {isAnalyzing ? (
            <div className="mt-1.5 space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-medium">
                <Sparkles className="w-3 h-3 animate-spin text-emerald-300" />
                <span>Искусственный интеллект определяет КБЖУ...</span>
              </div>

              {/* Skeleton macro pills preview */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <div className="h-4 w-16 bg-neutral-800/80 border border-neutral-700/40 rounded-md animate-pulse" />
                <div className="h-4 w-12 bg-neutral-800/80 border border-neutral-700/40 rounded-md animate-pulse" />
                <div className="h-4 w-12 bg-neutral-800/80 border border-neutral-700/40 rounded-md animate-pulse" />
                <div className="h-4 w-12 bg-neutral-800/80 border border-neutral-700/40 rounded-md animate-pulse" />
              </div>

              <p className="text-[11px] text-neutral-400">
                Загрузка идёт в фоне — можно смотреть другие разделы или добавить ещё еды.
              </p>
            </div>
          ) : isError ? (
            <div className="mt-1.5 space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-medium">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                <span className="truncate max-w-[220px] sm:max-w-xs">
                  {pendingMeal.errorMessage || 'Ошибка обработки AI'}
                </span>
              </div>

              {/* Retry & Dismiss action buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onRetry(pendingMeal.id)}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-all font-medium cursor-pointer active:scale-95"
                  title="Повторить запрос к AI"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Повторить</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDismiss(pendingMeal.id)}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-all font-medium cursor-pointer active:scale-95"
                  title="Удалить карточку"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Отмена</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
