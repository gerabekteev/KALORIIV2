import React, { useState, useEffect, useMemo } from 'react'
import {
  Star,
  Plus,
  Search,
  BookOpen,
  Trash2,
  ChevronDown,
  Check,
} from 'lucide-react'
import { Recipe } from '../../types'
import { recipesApi } from '../../api/recipes'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Loading'
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

  const handleDeleteRecipe = async (e: React.MouseEvent, id: number, name: string) => {
    e.stopPropagation()
    if (!window.confirm(`Удалить рецепт "${name}"?`)) return

    try {
      await recipesApi.deleteRecipe(id)
      setRecipes((prev) => prev.filter((r) => r.id !== id))
      addToast(`Рецепт "${name}" удалён`, 'info')
    } catch {
      addToast('Не удалось удалить рецепт', 'error')
    }
  }

  const handleRecipeCreated = (newRecipe: Recipe) => {
    setRecipes((prev) => [newRecipe, ...prev])
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

  const handleQuickLogFullPortion = (recipe: Recipe) => {
    const weight = recipe.total_weight_grams || 100
    onSelectRecipe({
      name: recipe.name,
      calories: Math.round(recipe.total_calories),
      protein: Math.round(recipe.total_protein * 10) / 10,
      fat: Math.round(recipe.total_fat * 10) / 10,
      carbs: Math.round(recipe.total_carbs * 10) / 10,
      weight_grams: Math.round(weight),
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
    })
  }

  return (
    <div className="space-y-3.5">
      {/* Header controls: Search, Favorites Filter & Add Recipe Button */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Поиск по рецептам..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#18181b] border border-neutral-800 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-emerald-500"
          />
        </div>

        <button
          type="button"
          onClick={() => setFilterFavorite(!filterFavorite)}
          className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 border transition-all cursor-pointer ${
            filterFavorite
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/20'
              : 'bg-[#18181b] text-neutral-400 hover:text-white border-neutral-800'
          }`}
          title="Только избранные рецепты"
        >
          <Star
            className={`w-3.5 h-3.5 ${
              filterFavorite ? 'fill-amber-400 text-amber-400' : 'text-neutral-400'
            }`}
          />
          <span className="hidden sm:inline">Избранные</span>
        </button>

        <Button
          type="button"
          size="sm"
          onClick={() => setIsCreateModalOpen(true)}
          className="gap-1 shrink-0 px-2.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Новый</span>
        </Button>
      </div>

      {/* Recipes List */}
      {isLoading ? (
        <div className="space-y-2.5">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : filteredRecipes.length === 0 ? (
        <div className="text-center py-8 bg-[#18181b]/50 border border-neutral-800/80 rounded-2xl p-6">
          <BookOpen className="w-10 h-10 text-neutral-600 mx-auto mb-2.5" />
          <h4 className="text-sm font-semibold text-white">
            {filterFavorite
              ? 'Нет избранных рецептов'
              : searchQuery
              ? 'Рецепты не найдены'
              : 'У вас пока нет сохранённых рецептов'}
          </h4>
          <p className="text-xs text-neutral-400 mt-1 max-w-xs mx-auto">
            {filterFavorite
              ? 'Нажмите на звёздочку возле любого рецепта, чтобы добавить его в избранное'
              : 'Создайте свой первый рецепт или сохраните блюдо из дневника'}
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-3.5 gap-1.5"
            onClick={() => {
              if (filterFavorite) setFilterFavorite(false)
              else setIsCreateModalOpen(true)
            }}
          >
            {filterFavorite ? 'Показать все рецепты' : 'Создать рецепт'}
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
                className={`bg-[#1c1c20] hover:bg-[#202026] border rounded-2xl p-3.5 transition-all ${
                  recipe.is_favorite
                    ? 'border-amber-500/20 bg-gradient-to-r from-[#1c1c20] to-[#211f18]'
                    : 'border-neutral-800/80'
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm font-bold text-white truncate my-0">
                        {recipe.name}
                      </h4>
                      <button
                        type="button"
                        onClick={(e) => handleToggleFavorite(e, recipe.id)}
                        className="text-neutral-500 hover:text-amber-400 transition-colors p-0.5 cursor-pointer"
                        title={
                          recipe.is_favorite
                            ? 'Удалить из избранного'
                            : 'Добавить в избранное'
                        }
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            recipe.is_favorite
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-neutral-500'
                          }`}
                        />
                      </button>
                    </div>

                    {recipe.description && (
                      <p className="text-[11px] text-neutral-400 mt-0.5 line-clamp-1 italic">
                        {recipe.description}
                      </p>
                    )}

                    {/* Macros Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                        {Math.round(recipe.total_calories)} ккал
                      </span>
                      <span className="text-[11px] text-neutral-300 bg-neutral-800/80 px-1.5 py-0.5 rounded-md">
                        {weight} г
                      </span>
                      <span className="text-[10px] text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded-md">
                        Б: {Math.round(recipe.total_protein * 10) / 10}г
                      </span>
                      <span className="text-[10px] text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                        Ж: {Math.round(recipe.total_fat * 10) / 10}г
                      </span>
                      <span className="text-[10px] text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded-md">
                        У: {Math.round(recipe.total_carbs * 10) / 10}г
                      </span>
                    </div>
                  </div>

                  {/* Actions right side */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleQuickLogFullPortion(recipe)}
                      className="px-3 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white rounded-xl shadow-md shadow-emerald-500/20 transition-all cursor-pointer flex items-center gap-1"
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
                        className="text-[11px] text-neutral-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-neutral-800 transition-colors cursor-pointer flex items-center gap-0.5"
                      >
                        <span>Порция</span>
                        <ChevronDown
                          className={`w-3 h-3 transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={(e) =>
                          handleDeleteRecipe(e, recipe.id, recipe.name)
                        }
                        className="text-neutral-500 hover:text-red-400 p-1 rounded transition-colors cursor-pointer"
                        title="Удалить рецепт"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Custom Portion Calculator */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-neutral-800 space-y-2 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between text-xs text-neutral-300">
                      <span>Настроить размер порции:</span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPortionWeight(weight.toString())}
                          className="px-2 py-0.5 text-[10px] bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300 cursor-pointer"
                        >
                          Вся ({weight}г)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPortionWeight(Math.round(weight / 2).toString())
                          }
                          className="px-2 py-0.5 text-[10px] bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300 cursor-pointer"
                        >
                          1/2 ({Math.round(weight / 2)}г)
                        </button>
                        <button
                          type="button"
                          onClick={() => setPortionWeight('100')}
                          className="px-2 py-0.5 text-[10px] bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300 cursor-pointer"
                        >
                          100г
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          placeholder="Вес порции, г"
                          value={portionWeight}
                          onChange={(e) => setPortionWeight(e.target.value)}
                          className="w-full bg-[#121214] border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                        />
                        <span className="absolute right-3 top-1.5 text-xs text-neutral-500">
                          г
                        </span>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleLogCustomPortion(recipe)}
                        leftIcon={<Check className="w-3.5 h-3.5" />}
                      >
                        Записать{' '}
                        {portionWeight && !isNaN(parseFloat(portionWeight))
                          ? `${Math.round(
                              (recipe.total_calories *
                                parseFloat(portionWeight)) /
                                (recipe.total_weight_grams || 100)
                            )} ккал`
                          : ''}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal for creating a new recipe */}
      <CreateRecipeModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onRecipeCreated={handleRecipeCreated}
      />
    </div>
  )
}
