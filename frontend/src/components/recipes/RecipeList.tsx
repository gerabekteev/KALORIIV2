import React, { useState, useEffect, useMemo } from 'react'
import {
  Star,
  Plus,
  Search,
  BookOpen,
  Trash2,
  ChevronDown,
  Check,
  Edit2,
} from 'lucide-react'
import { Recipe } from '../../types'
import { recipesApi } from '../../api/recipes'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Loading'
import { ConfirmModal } from '../ui/ConfirmModal'
import { useUIStore } from '../../store/uiStore'
import { CreateRecipeModal } from './CreateRecipeModal'

interface RecipeListProps {
  onSelectRecipe: (data: {
    name: string
    calories: number
    protein: number
    fat: number
    carbs: number
    weight_grams: number
    ingredients?: Array<{
      name: string
      weight_grams: number
      calories: number
      protein: number
      fat: number
      carbs: number
    }>
  }) => void
}

export const RecipeList: React.FC<RecipeListProps> = ({ onSelectRecipe }) => {
  const { addToast } = useUIStore()

  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterFavorite, setFilterFavorite] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  // Expanded portion selector for a specific recipe
  const [expandedRecipeId, setExpandedRecipeId] = useState<number | null>(null)
  const [portionWeight, setPortionWeight] = useState<string>('100')
  const [recipeToDelete, setRecipeToDelete] = useState<{ id: number; name: string } | null>(null)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)

  const fetchRecipes = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await recipesApi.getRecipes()
      setRecipes(data)
    } catch {
      addToast('Ошибка загрузки рецептов', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    fetchRecipes()
  }, [fetchRecipes])

  const handleToggleFavorite = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    try {
      const updated = await recipesApi.toggleFavorite(id)
      setRecipes((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_favorite: updated.is_favorite } : r))
      )
      addToast(
        updated.is_favorite
          ? 'Рецепт добавлен в избранное'
          : 'Рецепт удалён из избранного',
        'info',
        2000
      )
    } catch {
      addToast('Не удалось обновить статус избранного', 'error')
    }
  }

  const confirmDelete = async () => {
    if (!recipeToDelete) return
    try {
      await recipesApi.deleteRecipe(recipeToDelete.id)
      setRecipes((prev) => prev.filter((r) => r.id !== recipeToDelete.id))
      addToast(`Рецепт "${recipeToDelete.name}" удалён`, 'info')
    } catch {
      addToast('Не удалось удалить рецепт', 'error')
    } finally {
      setRecipeToDelete(null)
    }
  }

  const handleRecipeCreated = (recipe: Recipe) => {
    setRecipes((prev) => {
      const exists = prev.some((r) => r.id === recipe.id)
      if (exists) {
        return prev.map((r) => (r.id === recipe.id ? recipe : r))
      }
      return [recipe, ...prev]
    })
    setEditingRecipe(null)
  }

  // Filtered recipes
  const filteredRecipes = useMemo(() => {
    return recipes.filter((r) => {
      const matchesSearch = r.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase().trim())
      const matchesFavorite = filterFavorite ? r.is_favorite : true
      return matchesSearch && matchesFavorite
    })
  }, [recipes, searchQuery, filterFavorite])

  const buildIngredients = (recipe: Recipe, ratio: number) => {
    if (recipe.items && recipe.items.length > 0) {
      return recipe.items.map((it) => {
        const ingRatio = (it.weight_grams * ratio) / 100.0
        return {
          name: it.product?.name || 'Ингредиент',
          weight_grams: Math.round(it.weight_grams * ratio),
          calories: Math.round((it.product?.calories_per_100g || 0) * ingRatio),
          protein: Math.round((it.product?.protein_per_100g || 0) * ingRatio * 10) / 10,
          fat: Math.round((it.product?.fat_per_100g || 0) * ingRatio * 10) / 10,
          carbs: Math.round((it.product?.carbs_per_100g || 0) * ingRatio * 10) / 10,
        }
      })
    }
    if (recipe.ingredients && recipe.ingredients.length > 0) {
      return recipe.ingredients.map((ing) => ({
        name: ing.name,
        weight_grams: Math.round(ing.weight_grams * ratio),
        calories: Math.round(ing.calories * ratio),
        protein: Math.round(ing.protein * ratio * 10) / 10,
        fat: Math.round(ing.fat * ratio * 10) / 10,
        carbs: Math.round(ing.carbs * ratio * 10) / 10,
      }))
    }
    return undefined
  }

  const handleQuickLogFullPortion = (recipe: Recipe) => {
    const weight = recipe.total_weight_grams || 100
    onSelectRecipe({
      name: recipe.name,
      calories: Math.round(recipe.total_calories),
      protein: Math.round(recipe.total_protein * 10) / 10,
      fat: Math.round(recipe.total_fat * 10) / 10,
      carbs: Math.round(recipe.total_carbs * 10) / 10,
      weight_grams: Math.round(weight),
      ingredients: buildIngredients(recipe, 1.0),
    })
  }

  const handleLogCustomPortion = (recipe: Recipe) => {
    const targetWeight = parseFloat(portionWeight)
    if (!targetWeight || targetWeight <= 0) {
      addToast('Введите вес порции', 'warning')
      return
    }

    const baseWeight = recipe.total_weight_grams > 0 ? recipe.total_weight_grams : 100
    const ratio = targetWeight / baseWeight

    onSelectRecipe({
      name: recipe.name,
      calories: Math.round(recipe.total_calories * ratio),
      protein: Math.round(recipe.total_protein * ratio * 10) / 10,
      fat: Math.round(recipe.total_fat * ratio * 10) / 10,
      carbs: Math.round(recipe.total_carbs * ratio * 10) / 10,
      weight_grams: Math.round(targetWeight),
      ingredients: buildIngredients(recipe, ratio),
    })
  }

  return (
    <div className="space-y-3.5">
      {/* Header controls */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-[#7A7A82] absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Поиск по рецептам..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1A1A1D] border border-white/[0.08] rounded-full pl-9 pr-3 py-2 text-xs text-white placeholder-[#6E6E75] outline-none focus:border-white/40"
          />
        </div>

        <button
          type="button"
          onClick={() => setFilterFavorite(!filterFavorite)}
          className={`px-3 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
            filterFavorite
              ? 'bg-white text-black'
              : 'bg-[#1A1A1D] text-[#A1A1AA] hover:text-white'
          }`}
          title="Только избранные рецепты"
        >
          <Star
            className={`w-3.5 h-3.5 ${
              filterFavorite ? 'fill-black text-black' : 'text-[#A1A1AA]'
            }`}
          />
          <span className="hidden sm:inline">Избранные</span>
        </button>

        <Button
          type="button"
          size="sm"
          onClick={() => setIsCreateModalOpen(true)}
          className="gap-1 shrink-0 px-3"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Новый</span>
        </Button>
      </div>

      {/* Recipes List */}
      {isLoading ? (
        <div className="space-y-2.5">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : filteredRecipes.length === 0 ? (
        <div className="text-center py-8 bg-[#1A1A1D] rounded-[20px] p-6">
          <BookOpen className="w-8 h-8 text-[#7A7A82] mx-auto mb-2.5" />
          <h4 className="text-sm font-semibold text-white my-0">
            {filterFavorite
              ? 'Нет избранных рецептов'
              : searchQuery
              ? 'Рецепты не найдены'
              : 'У вас пока нет рецептов'}
          </h4>
          <p className="text-xs text-[#7A7A82] mt-1 max-w-xs mx-auto">
            {filterFavorite
              ? 'Нажмите на звёздочку у рецепта, чтобы добавить в избранное'
              : 'Создайте рецепт или сохраните блюдо из дневника'}
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-3.5"
            onClick={() => {
              if (filterFavorite) setFilterFavorite(false)
              else setIsCreateModalOpen(true)
            }}
          >
            {filterFavorite ? 'Показать все' : 'Создать рецепт'}
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
          {filteredRecipes.map((recipe) => {
            const isExpanded = expandedRecipeId === recipe.id
            const weight = Math.round(recipe.total_weight_grams || 100)

            return (
              <div
                key={recipe.id}
                className="bg-[#1A1A1D] hover:bg-[#222226] rounded-[20px] p-3.5 transition-colors"
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm font-semibold text-white truncate my-0">
                        {recipe.name}
                      </h4>
                      <button
                        type="button"
                        onClick={(e) => handleToggleFavorite(e, recipe.id)}
                        className="p-0.5 cursor-pointer"
                        title={recipe.is_favorite ? 'Убрать из избранного' : 'В избранное'}
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            recipe.is_favorite
                              ? 'fill-[#E02424] text-[#E02424]'
                              : 'text-[#6E6E75] hover:text-white'
                          }`}
                        />
                      </button>
                    </div>

                    {recipe.description && (
                      <p className="text-[11px] text-[#7A7A82] mt-0.5 line-clamp-1 italic my-0">
                        {recipe.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 mt-2 font-ndot text-[11px]">
                      <span className="font-bold text-white">
                        {Math.round(recipe.total_calories)} ккал
                      </span>
                      <span className="text-[#52525B]">·</span>
                      <span className="text-[#A1A1AA]">{weight}г</span>
                      <span className="text-[#52525B]">·</span>
                      <span className="text-[#D4D4D8]">Б {Math.round(recipe.total_protein * 10) / 10}</span>
                      <span className="text-[#A1A1AA]">Ж {Math.round(recipe.total_fat * 10) / 10}</span>
                      <span className="text-[#7A7A82]">У {Math.round(recipe.total_carbs * 10) / 10}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleQuickLogFullPortion(recipe)}
                      className="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-neutral-200 active:scale-95 text-black rounded-full transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Записать</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (isExpanded) {
                            setExpandedRecipeId(null)
                          } else {
                            setExpandedRecipeId(recipe.id)
                            setPortionWeight(weight.toString())
                          }
                        }}
                        className="text-[11px] text-[#A1A1AA] hover:text-white px-2 py-0.5 rounded-full hover:bg-[#2A2A2F] transition-colors cursor-pointer flex items-center gap-0.5"
                      >
                        <span>Порция</span>
                        <ChevronDown
                          className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingRecipe(recipe)
                          setIsCreateModalOpen(true)
                        }}
                        className="text-[#7A7A82] hover:text-white p-1 rounded-full transition-colors cursor-pointer"
                        title="Редактировать"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setRecipeToDelete({ id: recipe.id, name: recipe.name })
                        }}
                        className="text-[#7A7A82] hover:text-[#E02424] p-1 rounded-full transition-colors cursor-pointer"
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-2.5 space-y-2.5 animate-in fade-in duration-150">
                    <div className="nothing-dotted-divider" />
                    <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
                      <span>Размер порции:</span>
                      <div className="flex gap-1.5 font-ndot">
                        <button
                          type="button"
                          onClick={() => setPortionWeight(weight.toString())}
                          className="px-2 py-0.5 text-[10px] bg-[#2A2A2F] hover:bg-white hover:text-black rounded-full text-white cursor-pointer"
                        >
                          {weight}г
                        </button>
                        <button
                          type="button"
                          onClick={() => setPortionWeight(Math.round(weight / 2).toString())}
                          className="px-2 py-0.5 text-[10px] bg-[#2A2A2F] hover:bg-white hover:text-black rounded-full text-white cursor-pointer"
                        >
                          ½ ({Math.round(weight / 2)}г)
                        </button>
                        <button
                          type="button"
                          onClick={() => setPortionWeight('100')}
                          className="px-2 py-0.5 text-[10px] bg-[#2A2A2F] hover:bg-white hover:text-black rounded-full text-white cursor-pointer"
                        >
                          100г
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          placeholder="Вес, г"
                          value={portionWeight}
                          onChange={(e) => setPortionWeight(e.target.value)}
                          className="w-full bg-[#111113] border border-white/[0.1] rounded-full px-3.5 py-1.5 font-ndot text-xs text-white outline-none focus:border-white/40"
                        />
                        <span className="absolute right-3.5 top-1.5 text-xs text-[#7A7A82]">г</span>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleLogCustomPortion(recipe)}
                        leftIcon={<Check className="w-3.5 h-3.5" />}
                      >
                        {portionWeight && !isNaN(parseFloat(portionWeight))
                          ? `${Math.round(
                              (recipe.total_calories * parseFloat(portionWeight)) /
                                (recipe.total_weight_grams || 100)
                            )} ккал`
                          : 'Записать'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal for creating / editing a recipe */}
      <CreateRecipeModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false)
          setEditingRecipe(null)
        }}
        onRecipeCreated={handleRecipeCreated}
        editingRecipe={editingRecipe}
      />

      {/* Confirmation modal for recipe deletion */}
      <ConfirmModal
        isOpen={!!recipeToDelete}
        onClose={() => setRecipeToDelete(null)}
        onConfirm={confirmDelete}
        title={`Удалить рецепт "${recipeToDelete?.name}"?`}
        description="Рецепт будет навсегда удалён из вашей кулинарной книги."
        confirmText="Удалить"
        cancelText="Отмена"
        isDangerous
      />
    </div>
  )
}
