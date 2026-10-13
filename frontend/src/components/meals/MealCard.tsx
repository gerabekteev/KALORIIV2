import React, { useState } from 'react'
import { Sparkles, Edit2, Trash2, Clock, Image as ImageIcon, BookmarkPlus } from 'lucide-react'
import { Meal } from '../../types'
import { useUIStore } from '../../store/uiStore'
import { useMealsStore } from '../../store/mealsStore'
import { recipesApi } from '../../api/recipes'

interface MealCardProps {
  meal: Meal
}

export const MealCard: React.FC<MealCardProps> = ({ meal }) => {
  const { openEditMeal, addToast } = useUIStore()
  const { deleteMeal } = useMealsStore()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSavingRecipe, setIsSavingRecipe] = useState(false)
  const [isSavedRecipe, setIsSavedRecipe] = useState(false)

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

  // Format time (HH:MM)
  const displayTime = meal.meal_time
    ? meal.meal_time.slice(0, 5)
    : '—:—'

  return (
    <div className="relative group bg-[#1c1c20] hover:bg-[#222227] border border-neutral-800/80 rounded-2xl p-4 transition-all duration-200 shadow-md shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        {/* Meal Photo or Icon */}
        <div className="relative w-14 h-14 rounded-xl bg-neutral-800 border border-neutral-700/60 overflow-hidden shrink-0 flex items-center justify-center">
          {meal.photo_path ? (
            <img
              src={
                meal.photo_path.startsWith('http') || meal.photo_path.startsWith('/uploads/')
                  ? meal.photo_path
                  : meal.photo_path.startsWith('uploads/')
                  ? `/${meal.photo_path}`
                  : `/uploads/${meal.photo_path.replace(/^\/+/, '')}`
              }
              alt={meal.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                // fallback to icon if image fails loading
                (e.target as HTMLElement).style.display = 'none'
              }}
            />
          ) : (
            <ImageIcon className="w-6 h-6 text-neutral-600" />
          )}

          {!meal.is_manually_edited && meal.ai_raw_response && (
            <div className="absolute top-1 right-1 bg-emerald-500/90 text-white p-0.5 rounded-full shadow-sm">
              <Sparkles className="w-2.5 h-2.5" />
            </div>
          )}
        </div>

        {/* Meal Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white truncate">
              {meal.name}
            </h3>
            <span className="text-xs text-neutral-400 flex items-center gap-1 shrink-0 font-medium">
              <Clock className="w-3 h-3 text-neutral-500" />
              {displayTime}
            </span>
          </div>

          {/* Weight & comment */}
          <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-400">
            {meal.weight_grams ? (
              <span className="font-medium text-neutral-300">
                {meal.weight_grams} г
              </span>
            ) : null}
            {meal.user_comment ? (
              <span className="truncate italic text-[11px] text-neutral-400">
                "{meal.user_comment}"
              </span>
            ) : null}
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

        {/* Actions */}
        <div className="flex flex-col gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleSaveAsRecipe}
            disabled={isSavingRecipe}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isSavedRecipe
                ? 'text-amber-400 bg-amber-500/10'
                : 'text-neutral-400 hover:text-amber-400 hover:bg-neutral-800'
            }`}
            title="Сохранить как рецепт"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => openEditMeal(meal)}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Редактировать"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
            title="Удалить"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
