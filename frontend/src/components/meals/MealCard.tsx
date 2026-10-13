import React, { useState, useEffect, useRef } from 'react'
import {
  Sparkles,
  Edit2,
  Trash2,
  Clock,
  Utensils,
  Image as ImageIcon,
  BookmarkPlus,
  RotateCcw,
  Maximize2,
  X,
  MessageSquare,
  MoreVertical,
} from 'lucide-react'
import { Meal } from '../../types'
import { useUIStore } from '../../store/uiStore'
import { useMealsStore } from '../../store/mealsStore'
import { recipesApi } from '../../api/recipes'
import { Button } from '../ui/Button'

interface MealCardProps {
  meal: Meal
}

export const MealCard: React.FC<MealCardProps> = ({ meal }) => {
  const { openEditMeal, addToast } = useUIStore()
  const { deleteMeal, recalculateMeal } = useMealsStore()

  const [isDeleting, setIsDeleting] = useState(false)
  const [isSavingRecipe, setIsSavingRecipe] = useState(false)
  const [isSavedRecipe, setIsSavedRecipe] = useState(false)

  // 3-Dots Action Menu state
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Photo Lightbox state
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)

  // Comment edit & AI recalculation state
  const [isEditingComment, setIsEditingComment] = useState(false)
  const [commentText, setCommentText] = useState(meal.user_comment || '')
  const [isRecalculating, setIsRecalculating] = useState(false)

  // Close menu on click outside
  useEffect(() => {
    if (!isMenuOpen) return
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [isMenuOpen])

  // Keep comment text in sync if meal updates
  useEffect(() => {
    setCommentText(meal.user_comment || '')
  }, [meal.user_comment])

  // Close lightbox on Escape key
  useEffect(() => {
    if (!isLightboxOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsLightboxOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLightboxOpen])

  const getPhotoUrl = (path: string | null | undefined) => {
    if (!path) return ''
    if (path.startsWith('http://') || path.startsWith('https://')) return path
    if (path.startsWith('/uploads/')) return path
    if (path.startsWith('uploads/')) return `/${path}`
    return `/uploads/${path.replace(/^\/+/, '')}`
  }

  const handleSaveAsRecipe = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsSavingRecipe(true)
    try {
      await recipesApi.saveMealAsRecipe(meal)
      setIsSavedRecipe(true)
      addToast(`"${meal.name}" сохранено в Мои рецепты!`, 'success')
    } catch {
      addToast('Не удалось сохранить блюдо как рецепт', 'error')
    } finally {
      setIsSavingRecipe(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm(`Удалить "${meal.name}"?`)) return

    setIsDeleting(true)
    try {
      await deleteMeal(meal.id)
      addToast('Запись удалена', 'info')
    } catch {
      addToast('Не удалось удалить запись', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleRecalculateAI = async () => {
    setIsRecalculating(true)
    try {
      const updated = await recalculateMeal(meal.id, commentText.trim() || undefined)
      addToast(
        `КБЖУ "${updated.name}" успешно пересчитано через AI! (${Math.round(updated.calories)} ккал)`,
        'success'
      )
      setIsEditingComment(false)
    } catch (err: any) {
      addToast(err.message || 'Ошибка пересчёта КБЖУ через AI', 'error', 5000)
    } finally {
      setIsRecalculating(false)
    }
  }

  // Format time (HH:MM)
  const displayTime = meal.meal_time ? meal.meal_time.slice(0, 5) : '—:—'
  const photoUrl = getPhotoUrl(meal.photo_path)

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => openEditMeal(meal)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openEditMeal(meal)
          }
        }}
        className="relative group bg-[#1c1c20] hover:bg-[#222227] hover:border-emerald-500/40 border border-neutral-800/80 rounded-2xl p-3.5 transition-all duration-200 shadow-sm cursor-pointer select-none"
        title="Нажмите в любое место карточки для редактирования блюда"
      >
        <div className="flex items-start gap-3">
          {/* Meal Photo or Utensils Icon with expressive Lightbox trigger */}
          <div
            onClick={(e) => {
              if (photoUrl) {
                e.stopPropagation()
                setIsLightboxOpen(true)
              }
            }}
            className={`relative w-14 h-14 rounded-xl bg-neutral-800/90 border border-neutral-700/60 overflow-hidden shrink-0 flex items-center justify-center transition-all ${
              photoUrl
                ? 'cursor-pointer hover:ring-2 hover:ring-emerald-400 group/photo active:scale-95 shadow-sm'
                : ''
            }`}
            title={photoUrl ? 'Нажмите для просмотра фото' : undefined}
          >
            {photoUrl ? (
              <>
                <img
                  src={photoUrl}
                  alt={meal.name}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover/photo:scale-105"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none'
                  }}
                />
                {/* Hover overlay hint */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center">
                  <Maximize2 className="w-3.5 h-3.5 text-white drop-shadow" />
                </div>
              </>
            ) : (
              <Utensils className="w-5 h-5 text-neutral-500" />
            )}

            {!meal.is_manually_edited && meal.ai_raw_response && (
              <div className="absolute top-1 right-1 bg-emerald-500/90 text-white p-0.5 rounded-full shadow-sm">
                <Sparkles className="w-2 h-2" />
              </div>
            )}
          </div>

          {/* Meal Details */}
          <div className="flex-1 min-w-0">
            {/* Title & Top Action Bar */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm sm:text-[15px] font-semibold text-white leading-snug line-clamp-2 group-hover:text-emerald-300 transition-colors">
                {meal.name}
              </h3>

              {/* Time & 3-Dots Menu */}
              <div
                className="flex items-center gap-1 shrink-0 -mt-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-[11px] text-neutral-400 flex items-center gap-1 font-medium mr-0.5">
                  <Clock className="w-3 h-3 text-neutral-500" />
                  {displayTime}
                </span>

                {/* 3-Dots Button */}
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer active:scale-95 min-w-[32px] min-h-[32px] flex items-center justify-center"
                    title="Действия с блюдом"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {/* Dropdown Menu */}
                  {isMenuOpen && (
                    <div className="absolute right-0 top-8 z-40 w-52 bg-[#222227] border border-neutral-700/80 rounded-2xl shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-150">
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false)
                          openEditMeal(meal)
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-neutral-200 hover:text-white hover:bg-neutral-800/80 rounded-xl transition-colors cursor-pointer min-h-[38px]"
                      >
                        <Edit2 className="w-4 h-4 text-emerald-400" />
                        <span>Редактировать блюдо</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false)
                          setIsEditingComment(true)
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-neutral-200 hover:text-white hover:bg-neutral-800/80 rounded-xl transition-colors cursor-pointer min-h-[38px]"
                      >
                        <RotateCcw className="w-4 h-4 text-emerald-400" />
                        <span>Пересчитать через AI</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          setIsMenuOpen(false)
                          handleSaveAsRecipe(e)
                        }}
                        disabled={isSavingRecipe}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-neutral-200 hover:text-white hover:bg-neutral-800/80 rounded-xl transition-colors cursor-pointer min-h-[38px]"
                      >
                        <BookmarkPlus className="w-4 h-4 text-amber-400" />
                        <span>{isSavedRecipe ? 'Сохранено в рецепты' : 'В «Мои рецепты»'}</span>
                      </button>

                      <div className="my-1 border-t border-neutral-800" />

                      <button
                        type="button"
                        onClick={(e) => {
                          setIsMenuOpen(false)
                          handleDelete(e)
                        }}
                        disabled={isDeleting}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer min-h-[38px]"
                      >
                        <Trash2 className="w-4 h-4 text-rose-400" />
                        <span>Удалить запись</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Weight and Comment */}
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-neutral-400">
              {meal.weight_grams ? (
                <span className="font-medium text-neutral-300">
                  {meal.weight_grams} г
                </span>
              ) : null}

              {meal.user_comment ? (
                <div
                  className="flex items-center gap-1 max-w-full"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span
                    onClick={() => setIsEditingComment(true)}
                    className="truncate italic text-[11px] text-neutral-300 bg-neutral-900/90 hover:bg-neutral-800 px-2 py-0.5 rounded-md border border-neutral-800 cursor-pointer transition-colors"
                    title="Нажмите, чтобы изменить комментарий"
                  >
                    "{meal.user_comment}"
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditingComment(true)}
                    className="text-neutral-500 hover:text-emerald-400 p-0.5 transition-colors cursor-pointer"
                    title="Изменить комментарий"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsEditingComment(true)
                  }}
                  className="text-[11px] text-neutral-500 hover:text-emerald-400 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <MessageSquare className="w-3 h-3 text-neutral-600" />
                  <span>+ комментарий</span>
                </button>
              )}
            </div>

            {/* Macros Pills */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                {Math.round(meal.calories)} ккал
              </span>
              <span className="text-[11px] font-medium text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded-md">
                Б: {meal.protein}г
              </span>
              <span className="text-[11px] font-medium text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                Ж: {meal.fat}г
              </span>
              <span className="text-[11px] font-medium text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded-md">
                У: {meal.carbs}г
              </span>
            </div>
          </div>
        </div>

        {/* Comment edit & AI recalculate section */}
        {isEditingComment && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-3 pt-3 border-t border-neutral-800/80 space-y-2.5 animate-in fade-in duration-200"
          >
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Пояснение для AI пересчёта:</span>
              </label>
              <button
                type="button"
                onClick={() => setIsEditingComment(false)}
                className="text-neutral-500 hover:text-neutral-300 p-0.5 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Например: Добавил 50г сыра, половина банана, без соуса..."
              className="w-full bg-[#141417] border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-emerald-500 transition-colors"
            />

            <div className="flex items-center justify-between pt-0.5">
              <span className="text-[11px] text-neutral-500">
                AI пересчитает калории и БЖУ
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingComment(false)}
                  disabled={isRecalculating}
                  className="px-2.5 py-1 text-xs text-neutral-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <Button
                  size="sm"
                  onClick={handleRecalculateAI}
                  isLoading={isRecalculating}
                  leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                  className="text-xs"
                >
                  Пересчитать через AI
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Expressive Photo Lightbox Modal */}
      {isLightboxOpen && photoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative max-w-2xl max-h-[90vh] w-full flex flex-col items-center bg-[#18181c] border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Lightbox Header */}
            <div className="w-full flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-[#141416]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-white truncate">
                  {meal.name}
                </span>
                {meal.weight_grams ? (
                  <span className="text-xs text-neutral-400">
                    ({meal.weight_grams} г)
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setIsLightboxOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Закрыть (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lightbox Full Photo */}
            <div className="p-3 w-full flex items-center justify-center bg-black/40 overflow-hidden">
              <img
                src={photoUrl}
                alt={meal.name}
                className="max-h-[65vh] w-auto max-w-full object-contain rounded-xl shadow-lg"
              />
            </div>

            {/* Lightbox Footer */}
            <div className="w-full px-4 py-3 bg-[#141416] border-t border-neutral-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                  {Math.round(meal.calories)} ккал
                </span>
                <span className="text-neutral-300">Б: {meal.protein}г</span>
                <span className="text-neutral-300">Ж: {meal.fat}г</span>
                <span className="text-neutral-300">У: {meal.carbs}г</span>
              </div>
              <span className="text-neutral-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {displayTime}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
