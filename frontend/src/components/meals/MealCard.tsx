import React, { useState, useEffect, useRef } from 'react'
import {
  Sparkles,
  Edit2,
  Trash2,
  Clock,
  Utensils,
  BookmarkPlus,
  RotateCcw,
  Maximize2,
  X,
  MessageSquare,
  MoreVertical,
  ChevronDown,
  ChevronUp,
  Copy,
  Plus,
  Minus,
} from 'lucide-react'
import { Meal } from '../../types'
import { useUIStore } from '../../store/uiStore'
import { useMealsStore, getTodayDateString } from '../../store/mealsStore'
import { recipesApi } from '../../api/recipes'
import { Button } from '../ui/Button'
import { haptics } from '../../utils/haptics'
import { resolveMediaUrl } from '../../utils/platform'
import { registerBackHandler } from '../ui/Modal'
import { getMealTimeMeta } from '../../utils/timeSlots'

interface MealCardProps {
  meal: Meal
}

export const MealCard: React.FC<MealCardProps> = ({ meal }) => {
  const { openEditMeal, addToast } = useUIStore()
  const { deleteMealWithUndo, updateMeal, copyMealToDate, recalculateMeal, selectedDate } = useMealsStore()

  const [isSavingRecipe, setIsSavingRecipe] = useState(false)
  const [isSavedRecipe, setIsSavedRecipe] = useState(false)

  // Ingredients toggle state
  const [isIngredientsOpen, setIsIngredientsOpen] = useState(false)

  // 3-Dots Action Menu state
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Photo Lightbox state
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)

  // Comment edit & AI recalculation state
  const [isEditingComment, setIsEditingComment] = useState(false)
  const [commentText, setCommentText] = useState(meal.user_comment || '')
  const [isRecalculating, setIsRecalculating] = useState(false)

  // Swipe gesture state & rubber-band physics (UX-04)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const touchStartXRef = useRef(0)
  const touchStartYRef = useRef(0)
  const isSwipingRef = useRef(false)
  const isVerticalScrollRef = useRef(false)
  const didSwipeRef = useRef(false)
  const hasCrossedThresholdRef = useRef(false)

  const applyRubberBand = (dx: number): number => {
    const threshold = 60
    const abs = Math.abs(dx)
    if (abs <= threshold) return dx
    return Math.sign(dx) * (threshold + (abs - threshold) * 0.28)
  }

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

  // Close lightbox on Escape key or Android Back button
  useEffect(() => {
    if (!isLightboxOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsLightboxOpen(false)
    }
    const unregisterBack = registerBackHandler(() => {
      setIsLightboxOpen(false)
      return true
    })
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      unregisterBack()
    }
  }, [isLightboxOpen])

  const getPhotoUrl = (path: string | null | undefined) => {
    return resolveMediaUrl(path)
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

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    deleteMealWithUndo(meal.id)
  }

  const handleCopyMeal = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    try {
      await copyMealToDate(meal.id, getTodayDateString())
    } catch {
      // Handled in store
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

  // Scale the entire meal (weight, calories, macros, and all ingredients) by a factor
  const handleScaleWholeMeal = async (factor: number) => {
    if (factor <= 0 || factor === 1) return
    const updatedIngredients = Array.isArray(meal.ingredients)
      ? meal.ingredients.map((ing) => ({
          ...ing,
          weight_grams: Math.max(1, Math.round((ing.weight_grams || 0) * factor)),
          calories: Math.round(ing.calories * factor * 10) / 10,
          protein: Math.round(ing.protein * factor * 10) / 10,
          fat: Math.round(ing.fat * factor * 10) / 10,
          carbs: Math.round(ing.carbs * factor * 10) / 10,
        }))
      : undefined

    const newTotalCalories = Math.round(meal.calories * factor)
    const newTotalProtein = Math.round(meal.protein * factor * 10) / 10
    const newTotalFat = Math.round(meal.fat * factor * 10) / 10
    const newTotalCarbs = Math.round(meal.carbs * factor * 10) / 10
    const newTotalWeight = meal.weight_grams
      ? Math.max(1, Math.round(meal.weight_grams * factor))
      : updatedIngredients && updatedIngredients.length > 0
      ? Math.round(updatedIngredients.reduce((s, i) => s + (i.weight_grams || 0), 0))
      : undefined

    try {
      await updateMeal(meal.id, {
        calories: newTotalCalories,
        protein: newTotalProtein,
        fat: newTotalFat,
        carbs: newTotalCarbs,
        weight_grams: newTotalWeight,
        ingredients: updatedIngredients,
        is_manually_edited: true,
      })
      addToast(
        `Порция масштабирована (×${factor}): ${newTotalCalories} ккал${
          newTotalWeight ? ` • ${newTotalWeight} г` : ''
        }`,
        'info',
        2000
      )
    } catch {
      addToast('Не удалось масштабировать порцию', 'error')
    }
  }

  // Adjust ingredient weight (-25g, +25g) and recalculate totals
  const handleAdjustIngredientWeight = async (idx: number, delta: number) => {
    if (!meal.ingredients || meal.ingredients.length === 0) return
    const currentIng = meal.ingredients[idx]
    const oldWeight = currentIng.weight_grams || 100
    const newWeight = Math.max(10, Math.round(oldWeight + delta))
    if (newWeight === oldWeight) return

    const factor = newWeight / oldWeight
    const updatedIngredients = meal.ingredients.map((ing, i) => {
      if (i !== idx) return ing
      return {
        ...ing,
        weight_grams: newWeight,
        calories: Math.round(ing.calories * factor * 10) / 10,
        protein: Math.round(ing.protein * factor * 10) / 10,
        fat: Math.round(ing.fat * factor * 10) / 10,
        carbs: Math.round(ing.carbs * factor * 10) / 10,
      }
    })

    const newTotalCalories = Math.round(updatedIngredients.reduce((s, i) => s + i.calories, 0))
    const newTotalProtein = Math.round(updatedIngredients.reduce((s, i) => s + i.protein, 0) * 10) / 10
    const newTotalFat = Math.round(updatedIngredients.reduce((s, i) => s + i.fat, 0) * 10) / 10
    const newTotalCarbs = Math.round(updatedIngredients.reduce((s, i) => s + i.carbs, 0) * 10) / 10
    const newTotalWeight = Math.round(updatedIngredients.reduce((s, i) => s + (i.weight_grams || 0), 0))

    try {
      await updateMeal(meal.id, {
        ingredients: updatedIngredients,
        calories: newTotalCalories,
        protein: newTotalProtein,
        fat: newTotalFat,
        carbs: newTotalCarbs,
        weight_grams: newTotalWeight,
        is_manually_edited: true,
      })
    } catch {
      addToast('Не удалось обновить ингредиент', 'error')
    }
  }

  // Remove single ingredient
  const handleRemoveIngredient = async (idx: number) => {
    if (!meal.ingredients || meal.ingredients.length === 0) return
    const updatedIngredients = meal.ingredients.filter((_, i) => i !== idx)
    const newTotalCalories = Math.round(updatedIngredients.reduce((s, i) => s + i.calories, 0))
    const newTotalProtein = Math.round(updatedIngredients.reduce((s, i) => s + i.protein, 0) * 10) / 10
    const newTotalFat = Math.round(updatedIngredients.reduce((s, i) => s + i.fat, 0) * 10) / 10
    const newTotalCarbs = Math.round(updatedIngredients.reduce((s, i) => s + i.carbs, 0) * 10) / 10
    const newTotalWeight = Math.round(updatedIngredients.reduce((s, i) => s + (i.weight_grams || 0), 0))

    try {
      await updateMeal(meal.id, {
        ingredients: updatedIngredients,
        calories: newTotalCalories,
        protein: newTotalProtein,
        fat: newTotalFat,
        carbs: newTotalCarbs,
        weight_grams: newTotalWeight,
        is_manually_edited: true,
      })
    } catch {
      addToast('Не удалось удалить ингредиент', 'error')
    }
  }

  // Touch handlers for swipe actions with rubber-band physics & haptic ticks
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX
    touchStartYRef.current = e.touches[0].clientY
    isSwipingRef.current = false
    isVerticalScrollRef.current = false
    hasCrossedThresholdRef.current = false
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isVerticalScrollRef.current) return
    const dx = e.touches[0].clientX - touchStartXRef.current
    const dy = e.touches[0].clientY - touchStartYRef.current

    // If vertical movement dominates early, lock gesture into native scroll
    if (!isSwipingRef.current && Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
      isVerticalScrollRef.current = true
      return
    }

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      isSwipingRef.current = true
      const rubberOffset = applyRubberBand(dx)
      setSwipeOffset(rubberOffset)

      const crossed = Math.abs(rubberOffset) >= 60
      if (crossed && !hasCrossedThresholdRef.current) {
        haptics.threshold()
        hasCrossedThresholdRef.current = true
      } else if (!crossed && hasCrossedThresholdRef.current) {
        haptics.release()
        hasCrossedThresholdRef.current = false
      }
    }
  }

  const handleTouchEnd = () => {
    if (isSwipingRef.current) {
      didSwipeRef.current = true
      if (swipeOffset < -60) {
        // Swiped Left -> Delete with undo
        haptics.warning()
        deleteMealWithUndo(meal.id)
      } else if (swipeOffset > 60) {
        // Swiped Right -> Repeat / Copy
        haptics.success()
        handleCopyMeal()
      } else {
        haptics.release()
      }
    }
    setSwipeOffset(0)
    isSwipingRef.current = false
    isVerticalScrollRef.current = false
    hasCrossedThresholdRef.current = false
  }

  const handleTouchCancel = () => {
    setSwipeOffset(0)
    isSwipingRef.current = false
    isVerticalScrollRef.current = false
    hasCrossedThresholdRef.current = false
  }

  const handleCardClick = () => {
    if (didSwipeRef.current) {
      didSwipeRef.current = false
      return
    }
    openEditMeal(meal)
  }

  const displayTime = meal.meal_time ? meal.meal_time.slice(0, 5) : '—:—'
  const timeMeta = getMealTimeMeta(meal.meal_time, meal.calories)
  const photoUrl = getPhotoUrl(meal.photo_path)
  const hasIngredients = Array.isArray(meal.ingredients) && meal.ingredients.length > 0

  return (
    <>
      <div
        className={`relative rounded-2xl select-none ${
          isMenuOpen ? 'overflow-visible z-30' : 'overflow-hidden'
        }`}
      >
        {/* Swipe Action Background Indicators */}
        <div className="absolute inset-0 flex items-center justify-between px-4 pointer-events-none rounded-2xl bg-neutral-900 border border-neutral-800">
          <div
            className={`flex items-center gap-1.5 text-xs font-semibold text-emerald-400 transition-all ${
              swipeOffset > 20 ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              transform: `scale(${Math.min(1.15, Math.max(0.85, 0.85 + (Math.max(0, swipeOffset) / 80) * 0.3))})`,
            }}
          >
            <Copy className="w-4 h-4" />
            <span>Повторить</span>
          </div>
          <div
            className={`flex items-center gap-1.5 text-xs font-semibold text-rose-400 transition-all ${
              swipeOffset < -20 ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              transform: `scale(${Math.min(1.15, Math.max(0.85, 0.85 + (Math.max(0, -swipeOffset) / 80) * 0.3))})`,
            }}
          >
            <span>Удалить</span>
            <Trash2 className="w-4 h-4" />
          </div>
        </div>

        {/* Foreground Card */}
        <div
          role="button"
          tabIndex={0}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
          style={{
            transform: `translateX(${swipeOffset}px)`,
            transition: isSwipingRef.current ? 'none' : 'transform 0.2s ease-out',
          }}
          onClick={handleCardClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              openEditMeal(meal)
            }
          }}
          className="relative group bg-gradient-to-b from-[#1d1d23] to-[#17171c] hover:from-[#22232a] hover:to-[#1b1c22] hover:border-emerald-500/40 border border-white/[0.07] rounded-2xl p-3.5 transition-all duration-200 shadow-[0_4px_20px_rgba(0,0,0,0.28)] cursor-pointer select-none touch-pan-y"
          title="Нажмите в любое место карточки для редактирования блюда"
        >
          <div className="flex items-start gap-3">
            {/* Meal Photo or Utensils Icon with Lightbox trigger */}
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
                      ;(e.target as HTMLElement).style.display = 'none'
                    }}
                  />
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
                  <span
                    className="text-[11px] text-neutral-400 flex items-center gap-1 font-medium mr-0.5"
                    title={`${timeMeta.label} (${displayTime})`}
                  >
                    <span className="text-xs select-none" aria-hidden="true">
                      {timeMeta.icon}
                    </span>
                    <span>{displayTime}</span>
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
                            handleCopyMeal()
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-neutral-200 hover:text-white hover:bg-neutral-800/80 rounded-xl transition-colors cursor-pointer min-h-[38px]"
                        >
                          <Copy className="w-4 h-4 text-sky-400" />
                          <span>
                            {meal.meal_date === getTodayDateString()
                              ? 'Повторить блюдо'
                              : 'Скопировать в сегодня'}
                          </span>
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
                      className="truncate italic text-[11px] text-neutral-300 bg-neutral-900/90 hover:bg-neutral-800 px-2 py-1 rounded-md border border-neutral-800 cursor-pointer transition-colors"
                      title="Нажмите, чтобы изменить комментарий"
                    >
                      "{meal.user_comment}"
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditingComment(true)}
                      className="text-neutral-500 hover:text-emerald-400 p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center transition-colors cursor-pointer"
                      title="Изменить комментарий"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsEditingComment(true)
                    }}
                    className="text-[11px] text-neutral-500 hover:text-emerald-400 flex items-center gap-1.5 py-1 px-1.5 min-h-[32px] rounded-lg hover:bg-neutral-800/40 transition-colors cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-neutral-600" />
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

          {/* Expandable Ingredients Section (FEAT-01) - Full card width */}
          {hasIngredients && (
            <div className="mt-2.5 pt-2 border-t border-neutral-800/60" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setIsIngredientsOpen(!isIngredientsOpen)}
                className="w-full flex items-center justify-between py-1 px-1 -mx-1 rounded-lg hover:bg-neutral-800/40 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <span>Состав ({meal.ingredients?.length})</span>
                </span>
                {isIngredientsOpen ? (
                  <ChevronUp className="w-4 h-4 text-neutral-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-neutral-400" />
                )}
              </button>

              {isIngredientsOpen && (
                <div className="mt-2 space-y-2 bg-[#121317] p-2.5 rounded-xl border border-neutral-800/90">
                  {/* Quick Whole-Portion Scale Bar */}
                  <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-neutral-800/80">
                    <span className="text-[10px] font-semibold text-neutral-400">
                      Масштаб всей порции:
                    </span>
                    <div className="flex items-center gap-1">
                      {[
                        { label: '×0.5', factor: 0.5 },
                        { label: '×0.75', factor: 0.75 },
                        { label: '×1.5', factor: 1.5 },
                        { label: '×2', factor: 2 },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => handleScaleWholeMeal(item.factor)}
                          className="px-2 py-0.5 rounded-md bg-neutral-800/90 hover:bg-emerald-500/20 text-neutral-300 hover:text-emerald-300 border border-neutral-700/70 hover:border-emerald-500/40 text-[10px] font-bold transition-colors cursor-pointer active:scale-95"
                          title={`Умножить порцию на ${item.factor}`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {meal.ingredients?.map((ing, idx) => (
                    <div
                      key={idx}
                      className="py-1.5 border-b border-neutral-800/60 last:border-0 space-y-1"
                    >
                      {/* Row 1: Ingredient name full width */}
                      <p className="font-medium text-neutral-200 text-xs truncate">
                        {ing.name}
                      </p>

                      {/* Row 2: KBJU on left, buttons on right */}
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] text-neutral-400">
                          {Math.round(ing.calories)} ккал • Б:{ing.protein} Ж:{ing.fat} У:{ing.carbs}
                        </p>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleAdjustIngredientWeight(idx, -25)}
                            className="w-7 h-7 rounded-lg bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-200 flex items-center justify-center font-bold text-xs cursor-pointer active:scale-95 touch-manipulation"
                            title="-25г"
                          >
                            -
                          </button>
                          <span className="min-w-[36px] text-center font-mono text-xs text-white">
                            {ing.weight_grams}г
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAdjustIngredientWeight(idx, 25)}
                            className="w-7 h-7 rounded-lg bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-200 flex items-center justify-center font-bold text-xs cursor-pointer active:scale-95 touch-manipulation"
                            title="+25г"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveIngredient(idx)}
                            className="w-7 h-7 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition-colors cursor-pointer ml-1 active:scale-95 touch-manipulation"
                            title="Удалить ингредиент"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
              <span className="text-neutral-400 flex items-center gap-1 text-[11px]">
                <span className="text-xs select-none">{timeMeta.icon}</span>
                <span>{displayTime}</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
