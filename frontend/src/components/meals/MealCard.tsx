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
import { getMealAIModelBadge } from '../../utils/aiModelBadge'

interface MealCardProps {
  meal: Meal
}

export const MealCard: React.FC<MealCardProps> = ({ meal }) => {
  const { openEditMeal, addToast } = useUIStore()
  const { deleteMealWithUndo, updateMeal, copyMealToDate, recalculateMeal } = useMealsStore()

  const [isSavingRecipe, setIsSavingRecipe] = useState(false)
  const [isSavedRecipe, setIsSavedRecipe] = useState(false)
  const [isIngredientsOpen, setIsIngredientsOpen] = useState(false)

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [openMenuUpward, setOpenMenuUpward] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)

  const [isEditingComment, setIsEditingComment] = useState(false)
  const [commentText, setCommentText] = useState(meal.user_comment || '')
  const [isRecalculating, setIsRecalculating] = useState(false)

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

  useEffect(() => {
    setCommentText(meal.user_comment || '')
  }, [meal.user_comment])

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

  const handleToggleMenu = () => {
    if (isMenuOpen) {
      setIsMenuOpen(false)
      return
    }
    if (menuRef.current && typeof window !== 'undefined') {
      const rect = menuRef.current.getBoundingClientRect()
      const isMobile = window.innerWidth < 1024
      const topSafe = isMobile ? 68 : 24
      const bottomSafe = isMobile ? 148 : 24
      const estimatedMenuHeight = 270
      const spaceBelow = window.innerHeight - bottomSafe - rect.bottom
      const spaceAbove = rect.top - topSafe
      setOpenMenuUpward(spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow)
    } else {
      setOpenMenuUpward(false)
    }
    setIsMenuOpen(true)
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
        `КБЖУ "${updated.name}" пересчитано через AI (${Math.round(updated.calories)} ккал)`,
        'success'
      )
      setIsEditingComment(false)
    } catch (err: any) {
      addToast(err.message || 'Ошибка пересчёта КБЖУ через AI', 'error', 5000)
    } finally {
      setIsRecalculating(false)
    }
  }

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
        `Порция ×${factor}: ${newTotalCalories} ккал${newTotalWeight ? ` · ${newTotalWeight} г` : ''}`,
        'info',
        2000
      )
    } catch {
      addToast('Не удалось масштабировать порцию', 'error')
    }
  }

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

    try {
      await updateMeal(meal.id, {
        ingredients: updatedIngredients,
        calories: Math.round(updatedIngredients.reduce((s, i) => s + i.calories, 0)),
        protein: Math.round(updatedIngredients.reduce((s, i) => s + i.protein, 0) * 10) / 10,
        fat: Math.round(updatedIngredients.reduce((s, i) => s + i.fat, 0) * 10) / 10,
        carbs: Math.round(updatedIngredients.reduce((s, i) => s + i.carbs, 0) * 10) / 10,
        weight_grams: Math.round(updatedIngredients.reduce((s, i) => s + (i.weight_grams || 0), 0)),
        is_manually_edited: true,
      })
    } catch {
      addToast('Не удалось обновить ингредиент', 'error')
    }
  }

  const handleRemoveIngredient = async (idx: number) => {
    if (!meal.ingredients || meal.ingredients.length === 0) return
    const updatedIngredients = meal.ingredients.filter((_, i) => i !== idx)

    try {
      await updateMeal(meal.id, {
        ingredients: updatedIngredients,
        calories: Math.round(updatedIngredients.reduce((s, i) => s + i.calories, 0)),
        protein: Math.round(updatedIngredients.reduce((s, i) => s + i.protein, 0) * 10) / 10,
        fat: Math.round(updatedIngredients.reduce((s, i) => s + i.fat, 0) * 10) / 10,
        carbs: Math.round(updatedIngredients.reduce((s, i) => s + i.carbs, 0) * 10) / 10,
        weight_grams: Math.round(updatedIngredients.reduce((s, i) => s + (i.weight_grams || 0), 0)),
        is_manually_edited: true,
      })
    } catch {
      addToast('Не удалось удалить ингредиент', 'error')
    }
  }

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
        haptics.warning()
        deleteMealWithUndo(meal.id)
      } else if (swipeOffset > 60) {
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
  const photoUrl = resolveMediaUrl(meal.photo_path)
  const hasIngredients = Array.isArray(meal.ingredients) && meal.ingredients.length > 0
  const aiBadge = getMealAIModelBadge(meal)

  return (
    <>
      <div
        data-no-tab-swipe="true"
        className={`relative rounded-[22px] select-none ${
          isMenuOpen ? 'overflow-visible z-30' : 'overflow-hidden'
        }`}
      >
        {/* Swipe Action Background */}
        <div className="absolute inset-0 flex items-center justify-between px-5 pointer-events-none rounded-[22px] bg-[#111113]">
          <div
            className={`flex items-center gap-1.5 text-xs font-semibold text-white transition-opacity ${
              swipeOffset > 20 ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <Copy className="w-4 h-4" />
            <span>Повторить</span>
          </div>
          <div
            className={`flex items-center gap-1.5 text-xs font-semibold text-[#E02424] transition-opacity ${
              swipeOffset < -20 ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <span>Удалить</span>
            <Trash2 className="w-4 h-4" />
          </div>
        </div>

        {/* Foreground Nothing Bento Card */}
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
          className="relative group bg-[#1A1A1D] hover:bg-[#222226] rounded-[22px] p-3.5 sm:p-4 transition-colors duration-150 cursor-pointer select-none touch-pan-y"
          title="Нажмите для редактирования блюда"
        >
          <div className="flex items-start gap-3">
            {/* Thumbnail / Lightbox Trigger */}
            <div
              onClick={(e) => {
                if (photoUrl) {
                  e.stopPropagation()
                  setIsLightboxOpen(true)
                }
              }}
              className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#111113] overflow-hidden shrink-0 flex items-center justify-center transition-all ${
                photoUrl ? 'cursor-pointer hover:ring-1 hover:ring-white/40 group/photo active:scale-95' : ''
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
                  <div className="absolute inset-0 bg-black/45 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center">
                    <Maximize2 className="w-3.5 h-3.5 text-white" />
                  </div>
                </>
              ) : (
                <Utensils className="w-4 h-4 text-[#7A7A82]" />
              )}

              {!meal.is_manually_edited && (meal.ai_raw_response || meal.ai_model) && (
                <span
                  className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#E02424] ring-2 ring-[#111113]"
                  title={aiBadge?.tooltip || 'Распознано через AI'}
                />
              )}
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-white leading-snug line-clamp-2 my-0">
                    {meal.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-[#7A7A82]">
                    <span className="font-ndot flex items-center gap-1" title={`${timeMeta.label} (${displayTime})`}>
                      <Clock className="w-3 h-3" />
                      {displayTime}
                    </span>
                    {meal.weight_grams ? (
                      <span className="font-ndot text-[#A1A1AA]">{meal.weight_grams}г</span>
                    ) : null}
                    {aiBadge && (
                      <span
                        className="font-ndot text-[10px] px-1.5 py-0.5 rounded-full bg-[#2A2A2F] text-[#D4D4D8]"
                        title={aiBadge.tooltip}
                      >
                        {aiBadge.shortLabel}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Prominent Dot-Matrix Calories + 3-Dots Menu */}
                <div
                  className="flex items-start gap-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="text-right pr-0.5">
                    <div className="font-ndot text-lg font-bold text-white leading-none">
                      {Math.round(meal.calories)}
                    </div>
                    <div className="text-[10px] text-[#7A7A82] mt-0.5">ккал</div>
                  </div>

                  <div className="relative" ref={menuRef}>
                    <button
                      type="button"
                      onClick={handleToggleMenu}
                      className="w-8 h-8 -mr-1 text-[#7A7A82] hover:text-white hover:bg-[#2A2A2F] rounded-full transition-colors cursor-pointer flex items-center justify-center"
                      title="Действия с блюдом"
                      aria-label="Действия с блюдом"
                      aria-expanded={isMenuOpen}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {isMenuOpen && (
                      <div
                        className={`absolute right-0 z-40 w-52 bg-[#111113] border border-white/[0.1] rounded-[20px] shadow-[0_16px_50px_rgba(0,0,0,0.9)] p-1.5 max-h-[calc(100dvh-160px)] overflow-y-auto animate-in fade-in zoom-in-95 duration-150 ${
                          openMenuUpward
                            ? 'bottom-9 origin-bottom-right'
                            : 'top-9 origin-top-right'
                        }`}
                      >
                        {aiBadge && (
                          <div
                            className="px-3 py-1.5 text-[11px] text-[#7A7A82] mb-1 flex items-center justify-between"
                            title={aiBadge.tooltip}
                          >
                            <span>AI модель</span>
                            <span className="font-ndot font-bold text-white truncate max-w-[110px]">
                              {aiBadge.shortLabel}
                            </span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setIsMenuOpen(false)
                            openEditMeal(meal)
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#E4E4E7] hover:text-white hover:bg-[#1E1E22] rounded-xl transition-colors cursor-pointer min-h-[38px]"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-[#A1A1AA]" />
                          <span>Редактировать</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setIsMenuOpen(false)
                            handleCopyMeal()
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#E4E4E7] hover:text-white hover:bg-[#1E1E22] rounded-xl transition-colors cursor-pointer min-h-[38px]"
                        >
                          <Copy className="w-3.5 h-3.5 text-[#A1A1AA]" />
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
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#E4E4E7] hover:text-white hover:bg-[#1E1E22] rounded-xl transition-colors cursor-pointer min-h-[38px]"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-[#A1A1AA]" />
                          <span>Пересчитать через AI</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            setIsMenuOpen(false)
                            handleSaveAsRecipe(e)
                          }}
                          disabled={isSavingRecipe}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#E4E4E7] hover:text-white hover:bg-[#1E1E22] rounded-xl transition-colors cursor-pointer min-h-[38px]"
                        >
                          <BookmarkPlus className="w-3.5 h-3.5 text-[#A1A1AA]" />
                          <span>{isSavedRecipe ? 'Сохранено' : 'В «Мои рецепты»'}</span>
                        </button>

                        <div className="nothing-dotted-divider my-1.5" />

                        <button
                          type="button"
                          onClick={(e) => {
                            setIsMenuOpen(false)
                            handleDelete(e)
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[#E02424] hover:bg-[#E02424]/10 rounded-xl transition-colors cursor-pointer min-h-[38px]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Удалить запись</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Macros Row (Clean Nothing Monochrome) */}
              <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5">
                <div className="flex items-center gap-2 text-[11px] font-ndot tabular-nums">
                  <span className="text-white">
                    Б <span className="font-bold">{meal.protein}</span>
                  </span>
                  <span className="text-[#52525B]">·</span>
                  <span className="text-[#A1A1AA]">
                    Ж <span className="font-bold">{meal.fat}</span>
                  </span>
                  <span className="text-[#52525B]">·</span>
                  <span className="text-[#7A7A82]">
                    У <span className="font-bold">{meal.carbs}</span>
                  </span>
                </div>

                {/* Comment trigger / pill */}
                <div onClick={(e) => e.stopPropagation()} className="min-w-0 max-w-full">
                  {meal.user_comment ? (
                    <button
                      type="button"
                      onClick={() => setIsEditingComment(true)}
                      className="max-w-[200px] truncate italic text-[11px] text-[#A1A1AA] hover:text-white bg-[#111113] px-2.5 py-0.5 rounded-full transition-colors cursor-pointer"
                      title="Изменить комментарий"
                    >
                      "{meal.user_comment}"
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditingComment(true)}
                      className="text-[11px] text-[#6E6E75] hover:text-white inline-flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>AI-уточнение</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Expandable Ingredients Section */}
          {hasIngredients && (
            <div className="mt-3 pt-2.5" onClick={(e) => e.stopPropagation()}>
              <div className="nothing-dotted-divider mb-2" />
              <button
                type="button"
                onClick={() => setIsIngredientsOpen(!isIngredientsOpen)}
                className="w-full flex items-center justify-between py-0.5 text-[11px] font-medium text-[#A1A1AA] hover:text-white transition-colors cursor-pointer"
              >
                <span>Состав ({meal.ingredients?.length})</span>
                {isIngredientsOpen ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {isIngredientsOpen && (
                <div className="mt-2 space-y-2 bg-[#111113] p-3 rounded-[16px]">
                  <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-white/[0.06]">
                    <span className="text-[10px] font-medium text-[#7A7A82]">Масштаб порции:</span>
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
                          className="font-ndot px-2 py-0.5 rounded-full bg-[#222226] hover:bg-white hover:text-black text-[#D4D4D8] text-[10px] font-bold transition-colors cursor-pointer active:scale-95"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {meal.ingredients?.map((ing, idx) => (
                    <div
                      key={idx}
                      className="py-1.5 border-b border-white/[0.05] last:border-0 space-y-1"
                    >
                      <p className="font-medium text-white text-xs truncate my-0">{ing.name}</p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-ndot text-[10px] text-[#7A7A82] my-0">
                          {Math.round(ing.calories)} ккал · Б{ing.protein} Ж{ing.fat} У{ing.carbs}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleAdjustIngredientWeight(idx, -25)}
                            className="w-7 h-7 rounded-full bg-[#222226] hover:bg-[#2F2F36] text-white flex items-center justify-center font-bold text-xs cursor-pointer active:scale-95"
                            title="-25г"
                          >
                            -
                          </button>
                          <span className="min-w-[38px] text-center font-ndot text-xs text-white">
                            {ing.weight_grams}г
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAdjustIngredientWeight(idx, 25)}
                            className="w-7 h-7 rounded-full bg-[#222226] hover:bg-[#2F2F36] text-white flex items-center justify-center font-bold text-xs cursor-pointer active:scale-95"
                            title="+25г"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveIngredient(idx)}
                            className="w-7 h-7 rounded-full text-[#7A7A82] hover:text-[#E02424] hover:bg-[#E02424]/10 flex items-center justify-center transition-colors cursor-pointer ml-0.5"
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

          {/* Inline Comment & AI Recalculate */}
          {isEditingComment && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mt-3 pt-2.5 space-y-2.5 animate-in fade-in duration-150"
            >
              <div className="nothing-dotted-divider" />
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#E02424]" />
                  <span>Уточнение для AI-пересчёта</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsEditingComment(false)}
                  className="text-[#7A7A82] hover:text-white p-1 rounded-full cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Например: Добавил 50г сыра, без соуса..."
                className="w-full bg-[#111113] border border-white/[0.1] rounded-2xl px-3.5 py-2.5 text-xs text-white placeholder-[#6E6E75] outline-none focus:border-white/40 transition-colors"
              />

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditingComment(false)}
                  disabled={isRecalculating}
                >
                  Отмена
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleRecalculateAI}
                  isLoading={isRecalculating}
                  leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                >
                  Пересчитать AI
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Photo Lightbox Modal */}
      {isLightboxOpen && photoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative max-w-2xl max-h-[90vh] w-full flex flex-col items-center bg-[#111113] border border-white/[0.1] rounded-[26px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between px-4 py-3.5 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-white truncate">{meal.name}</span>
                {meal.weight_grams ? (
                  <span className="font-ndot text-xs text-[#7A7A82]">{meal.weight_grams}г</span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setIsLightboxOpen(false)}
                className="w-8 h-8 rounded-full bg-[#1E1E22] text-[#A1A1AA] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Закрыть (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 w-full flex items-center justify-center bg-black overflow-hidden">
              <img
                src={photoUrl}
                alt={meal.name}
                className="max-h-[65vh] w-auto max-w-full object-contain rounded-2xl"
              />
            </div>

            <div className="w-full px-4 py-3 border-t border-white/[0.06] flex items-center justify-between text-xs">
              <div className="flex items-center gap-3 font-ndot">
                <span className="font-bold text-white">{Math.round(meal.calories)} ккал</span>
                <span className="text-[#A1A1AA]">Б {meal.protein}</span>
                <span className="text-[#A1A1AA]">Ж {meal.fat}</span>
                <span className="text-[#A1A1AA]">У {meal.carbs}</span>
              </div>
              <span className="font-ndot text-[#7A7A82] flex items-center gap-1 text-[11px]">
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
