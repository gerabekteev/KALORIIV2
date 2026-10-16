import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Search, Loader2, X } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Product, Recipe } from '../../types'
import { productsApi } from '../../api/products'
import { recipesApi } from '../../api/recipes'
import { useUIStore } from '../../store/uiStore'

interface CreateRecipeModalProps {
  isOpen: boolean
  onClose: () => void
  onRecipeCreated: (recipe: Recipe) => void
}

interface IngredientRow {
  product: Product
  weight_grams: number
}

export const CreateRecipeModal: React.FC<CreateRecipeModalProps> = ({
  isOpen,
  onClose,
  onRecipeCreated,
}) => {
  const { addToast } = useUIStore()

  const [mode, setMode] = useState<'quick' | 'ingredients'>('quick')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Quick mode form
  const [quickForm, setQuickForm] = useState({
    name: '',
    description: '',
    calories: '',
    protein: '',
    fat: '',
    carbs: '',
    weight_grams: '100',
  })

  // Ingredients mode form
  const [ingName, setIngName] = useState('')
  const [ingDescription, setIngDescription] = useState('')
  const [ingredients, setIngredients] = useState<IngredientRow[]>([])

  // Product search state for ingredients mode
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [ingredientWeight, setIngredientWeight] = useState('100')

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const prods = await productsApi.getProducts(searchQuery.trim(), 10)
        setSearchResults(prods)
      } catch {
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Calculate ingredients totals
  const ingredientsTotals = ingredients.reduce(
    (acc, item) => {
      const ratio = item.weight_grams / 100.0
      return {
        calories: acc.calories + item.product.calories_per_100g * ratio,
        protein: acc.protein + item.product.protein_per_100g * ratio,
        fat: acc.fat + item.product.fat_per_100g * ratio,
        carbs: acc.carbs + item.product.carbs_per_100g * ratio,
        weight: acc.weight + item.weight_grams,
      }
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0, weight: 0 }
  )

  const handleAddIngredient = () => {
    if (!selectedProduct) return
    const w = parseFloat(ingredientWeight)
    if (!w || w <= 0) {
      addToast('Укажите корректный вес ингредиента', 'warning')
      return
    }

    setIngredients((prev) => [
      ...prev,
      { product: selectedProduct, weight_grams: w },
    ])
    setSelectedProduct(null)
    setSearchQuery('')
    setIngredientWeight('100')
  }

  const handleRemoveIngredient = (index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index))
  }

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickForm.name.trim()) {
      addToast('Введите название рецепта', 'warning')
      return
    }

    setIsSubmitting(true)
    try {
      const recipe = await recipesApi.createQuickRecipe({
        name: quickForm.name.trim(),
        description: quickForm.description.trim() || undefined,
        calories: parseFloat(quickForm.calories) || 0,
        protein: parseFloat(quickForm.protein) || 0,
        fat: parseFloat(quickForm.fat) || 0,
        carbs: parseFloat(quickForm.carbs) || 0,
        weight_grams: parseFloat(quickForm.weight_grams) || 100,
      })

      addToast(`Рецепт "${recipe.name}" успешно создан!`, 'success')
      onRecipeCreated(recipe)
      onClose()
      // reset
      setQuickForm({
        name: '',
        description: '',
        calories: '',
        protein: '',
        fat: '',
        carbs: '',
        weight_grams: '100',
      })
    } catch {
      addToast('Не удалось создать рецепт', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleIngredientsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ingName.trim()) {
      addToast('Введите название рецепта', 'warning')
      return
    }
    if (ingredients.length === 0) {
      addToast('Добавьте хотя бы один ингредиент', 'warning')
      return
    }

    setIsSubmitting(true)
    try {
      const recipe = await recipesApi.createRecipe({
        name: ingName.trim(),
        description: ingDescription.trim() || undefined,
        items: ingredients.map((item) => ({
          product_id: item.product.id,
          weight_grams: item.weight_grams,
        })),
      })

      addToast(`Рецепт "${recipe.name}" успешно создан!`, 'success')
      onRecipeCreated(recipe)
      onClose()
      // reset
      setIngName('')
      setIngDescription('')
      setIngredients([])
    } catch {
      addToast('Не удалось создать рецепт', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Новый рецепт" maxWidth="md">
      <div className="space-y-4">
        {/* Mode Selector */}
        <div className="flex bg-[#141417] p-1 rounded-xl border border-neutral-800">
          <button
            type="button"
            onClick={() => setMode('quick')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              mode === 'quick'
                ? 'bg-emerald-500 text-white shadow-md'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Быстрый ввод КБЖУ
          </button>
          <button
            type="button"
            onClick={() => setMode('ingredients')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              mode === 'ingredients'
                ? 'bg-emerald-500 text-white shadow-md'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Из ингредиентов
          </button>
        </div>

        {/* Quick Mode */}
        {mode === 'quick' && (
          <form onSubmit={handleQuickSubmit} className="space-y-3">
            <Input
              label="Название рецепта *"
              placeholder="Например: Протеиновый смузи"
              value={quickForm.name}
              onChange={(e) =>
                setQuickForm({ ...quickForm, name: e.target.value })
              }
              required
            />

            <Input
              label="Описание (опционально)"
              placeholder="Краткое описание или заметка"
              value={quickForm.description}
              onChange={(e) =>
                setQuickForm({ ...quickForm, description: e.target.value })
              }
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Калории (ккал) *"
                type="number"
                min="0"
                placeholder="0"
                value={quickForm.calories}
                onChange={(e) =>
                  setQuickForm({ ...quickForm, calories: e.target.value })
                }
                required
              />
              <Input
                label="Общий вес (г)"
                type="number"
                placeholder="100"
                value={quickForm.weight_grams}
                onChange={(e) =>
                  setQuickForm({ ...quickForm, weight_grams: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Input
                label="Белки (г)"
                type="number"
                step="0.1"
                min="0"
                placeholder="0"
                value={quickForm.protein}
                onChange={(e) =>
                  setQuickForm({ ...quickForm, protein: e.target.value })
                }
              />
              <Input
                label="Жиры (г)"
                type="number"
                step="0.1"
                min="0"
                placeholder="0"
                value={quickForm.fat}
                onChange={(e) =>
                  setQuickForm({ ...quickForm, fat: e.target.value })
                }
              />
              <Input
                label="Углеводы (г)"
                type="number"
                step="0.1"
                min="0"
                placeholder="0"
                value={quickForm.carbs}
                onChange={(e) =>
                  setQuickForm({ ...quickForm, carbs: e.target.value })
                }
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                className="w-1/2"
                onClick={onClose}
              >
                Отмена
              </Button>
              <Button type="submit" className="w-1/2" isLoading={isSubmitting}>
                Сохранить
              </Button>
            </div>
          </form>
        )}

        {/* Ingredients Mode */}
        {mode === 'ingredients' && (
          <form onSubmit={handleIngredientsSubmit} className="space-y-3.5">
            <Input
              label="Название рецепта *"
              placeholder="Например: Салат 'Цезарь' домашний"
              value={ingName}
              onChange={(e) => setIngName(e.target.value)}
              required
            />

            <Input
              label="Описание"
              placeholder="Способ приготовления или заметка"
              value={ingDescription}
              onChange={(e) => setIngDescription(e.target.value)}
            />

            {/* Add ingredient box */}
            <div className="p-3 rounded-xl bg-[#18181c] border border-neutral-800 space-y-2.5">
              <span className="text-xs font-semibold text-neutral-300 block">
                Добавить ингредиент
              </span>

              {!selectedProduct ? (
                <div className="relative">
                  <div className="relative">
                    <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="Поиск продукта в базе..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-[#121214] border border-neutral-700/80 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-emerald-500"
                    />
                    {isSearching && (
                      <Loader2 className="w-3.5 h-3.5 text-emerald-400 absolute right-3 top-3 animate-spin" />
                    )}
                  </div>

                  {searchResults.length > 0 && (
                    <div className="mt-2 bg-[#202025] border border-neutral-700 rounded-xl max-h-44 overflow-y-auto shadow-lg">
                      {searchResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedProduct(p)
                            setSearchResults([])
                            setSearchQuery('')
                          }}
                          className="w-full text-left p-2 hover:bg-neutral-800 text-xs text-white flex items-center justify-between border-b border-neutral-800 last:border-0 cursor-pointer"
                        >
                          <span className="font-medium truncate">{p.name}</span>
                          <span className="text-neutral-400 text-[11px] shrink-0 ml-2">
                            {p.calories_per_100g} ккал / 100г
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center justify-between bg-[#121214] border border-emerald-500/50 rounded-xl px-3 py-1.5 text-xs text-emerald-300 font-medium truncate">
                    <span className="truncate">{selectedProduct.name} ({selectedProduct.calories_per_100g} ккал/100г)</span>
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(null)}
                      className="text-neutral-400 hover:text-white p-0.5 ml-1 transition-colors cursor-pointer shrink-0"
                      title="Отменить выбор"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="number"
                    placeholder="Вес, г"
                    value={ingredientWeight}
                    onChange={(e) => setIngredientWeight(e.target.value)}
                    className="w-20 bg-[#121214] border border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none text-center focus:border-emerald-500"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddIngredient}
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                  >
                    OK
                  </Button>
                </div>
              )}
            </div>

            {/* Added ingredients list */}
            {ingredients.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-neutral-400">
                  Состав рецепта ({ingredients.length}):
                </span>
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {ingredients.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-[#19191d] border border-neutral-800 px-3 py-1.5 rounded-lg text-xs"
                    >
                      <div className="truncate mr-2">
                        <span className="font-medium text-white">{item.product.name}</span>
                        <span className="text-neutral-400 text-[11px] ml-1.5">
                          ({item.weight_grams}г •{' '}
                          {Math.round(
                            (item.product.calories_per_100g * item.weight_grams) / 100
                          )}{' '}
                          ккал)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveIngredient(idx)}
                        className="text-neutral-500 hover:text-red-400 transition-colors p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Auto Calculated Totals */}
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1">
                  <div className="flex justify-between font-bold text-emerald-400">
                    <span>Итого по рецепту:</span>
                    <span>
                      {Math.round(ingredientsTotals.calories)} ккал (
                      {Math.round(ingredientsTotals.weight)}г)
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] text-neutral-300">
                    <span>Б: {Math.round(ingredientsTotals.protein * 10) / 10}г</span>
                    <span>Ж: {Math.round(ingredientsTotals.fat * 10) / 10}г</span>
                    <span>У: {Math.round(ingredientsTotals.carbs * 10) / 10}г</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                className="w-1/2"
                onClick={onClose}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                className="w-1/2"
                isLoading={isSubmitting}
                disabled={ingredients.length === 0}
              >
                Сохранить рецепт
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}
