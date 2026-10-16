import React, { useState, useEffect } from 'react'
import { Search, Loader2, Plus, X } from 'lucide-react'
import { Product } from '../../types'
import { productsApi } from '../../api/products'
import { ProductItem } from './ProductItem'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useUIStore } from '../../store/uiStore'

interface ProductSearchProps {
  onSelectProduct: (
    product: {
      name: string
      calories: number
      protein: number
      fat: number
      carbs: number
      weight_grams: number
    },
    keepOpen?: boolean
  ) => void
}

export const ProductSearch: React.FC<ProductSearchProps> = ({ onSelectProduct }) => {
  const { addToast } = useUIStore()
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [grams, setGrams] = useState<string>('100')

  // Custom product creation state
  const [isCreating, setIsCreating] = useState(false)
  const [isSavingProduct, setIsSavingProduct] = useState(false)
  const [newProduct, setNewProduct] = useState({
    name: '',
    calories: '',
    protein: '',
    fat: '',
    carbs: '',
  })

  useEffect(() => {
    let active = true
    const timer = setTimeout(async () => {
      setIsLoading(true)
      try {
        const results = await productsApi.getProducts(query.trim())
        if (active) {
          setProducts(results || [])
        }
      } catch (err) {
        if (active) setProducts([])
      } finally {
        if (active) setIsLoading(false)
      }
    }, 300)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query])

  const handleConfirmPortion = (keepOpen = false) => {
    if (!selectedProduct) return
    const parsedGrams = parseFloat(grams)
    const safeGrams = !isNaN(parsedGrams) && parsedGrams > 0 ? parsedGrams : 100
    const ratio = safeGrams / 100
    onSelectProduct(
      {
        name: selectedProduct.name,
        calories: Math.round(selectedProduct.calories_per_100g * ratio),
        protein: Math.round(selectedProduct.protein_per_100g * ratio * 10) / 10,
        fat: Math.round(selectedProduct.fat_per_100g * ratio * 10) / 10,
        carbs: Math.round(selectedProduct.carbs_per_100g * ratio * 10) / 10,
        weight_grams: safeGrams,
      },
      keepOpen
    )
    setSelectedProduct(null)
    setGrams('100')
  }

  const handleStartCreate = (defaultName = '') => {
    setNewProduct({
      name: defaultName || query.trim(),
      calories: '',
      protein: '',
      fat: '',
      carbs: '',
    })
    setIsCreating(true)
  }

  const handleCancelCreate = () => {
    setIsCreating(false)
    setNewProduct({
      name: '',
      calories: '',
      protein: '',
      fat: '',
      carbs: '',
    })
  }

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProduct.name.trim()) {
      addToast('Введите название продукта', 'warning')
      return
    }
    const cal = parseFloat(newProduct.calories)
    if (isNaN(cal) || cal < 0) {
      addToast('Введите корректные калории', 'warning')
      return
    }

    setIsSavingProduct(true)
    try {
      const created = await productsApi.createProduct({
        name: newProduct.name.trim(),
        calories_per_100g: Math.round(cal),
        protein_per_100g: Math.max(0, parseFloat(newProduct.protein) || 0),
        fat_per_100g: Math.max(0, parseFloat(newProduct.fat) || 0),
        carbs_per_100g: Math.max(0, parseFloat(newProduct.carbs) || 0),
      })
      setProducts((prev) => [created, ...prev.filter((p) => p.id !== created.id)])
      setSelectedProduct(created)
      setIsCreating(false)
      addToast('Продукт успешно создан и выбран!', 'success')
    } catch {
      addToast('Ошибка при создании продукта', 'error')
    } finally {
      setIsSavingProduct(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Search Input & Add Custom Product Button */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Input
            placeholder="Поиск по базе продуктов (курица, овсянка...)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
            autoFocus
          />
        </div>
        <button
          type="button"
          onClick={() => handleStartCreate(query)}
          className="h-10 px-3 bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-emerald-400 rounded-xl border border-neutral-700 hover:border-emerald-500/50 flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
          title="Создать свой продукт"
        >
          <Plus className="w-4 h-4" />
          <span>Свой продукт</span>
        </button>
      </div>

      {/* Inline Create Product Form */}
      {isCreating && (
        <form
          onSubmit={handleCreateProduct}
          className="p-4 rounded-xl bg-[#1c1c21] border border-emerald-500/40 space-y-3 animate-in fade-in"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>Создать свой продукт</span>
            </h4>
            <button
              type="button"
              onClick={handleCancelCreate}
              className="text-neutral-400 hover:text-white p-1 rounded-lg"
              title="Отмена"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <Input
            label="Название продукта *"
            placeholder="Например, Домашний творог"
            value={newProduct.name}
            onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
            required
            autoFocus
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Input
              label="Калории (на 100г) *"
              type="number"
              min="0"
              placeholder="0"
              value={newProduct.calories}
              onChange={(e) => setNewProduct({ ...newProduct, calories: e.target.value })}
              required
            />
            <Input
              label="Белки (на 100г)"
              type="number"
              step="0.1"
              min="0"
              placeholder="0"
              value={newProduct.protein}
              onChange={(e) => setNewProduct({ ...newProduct, protein: e.target.value })}
            />
            <Input
              label="Жиры (на 100г)"
              type="number"
              step="0.1"
              min="0"
              placeholder="0"
              value={newProduct.fat}
              onChange={(e) => setNewProduct({ ...newProduct, fat: e.target.value })}
            />
            <Input
              label="Углеводы (на 100г)"
              type="number"
              step="0.1"
              min="0"
              placeholder="0"
              value={newProduct.carbs}
              onChange={(e) => setNewProduct({ ...newProduct, carbs: e.target.value })}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-1/2"
              onClick={handleCancelCreate}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              size="sm"
              className="w-1/2"
              isLoading={isSavingProduct}
            >
              Создать и выбрать
            </Button>
          </div>
        </form>
      )}

      {/* Selected Product Portion Drawer */}
      {selectedProduct && (
        <div className="p-4 rounded-xl bg-neutral-800/80 border border-emerald-500/40 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white truncate">
              {selectedProduct.name}
            </h4>
            <button
              onClick={() => setSelectedProduct(null)}
              className="text-xs text-neutral-400 hover:text-white"
            >
              Сменить
            </button>
          </div>

          {/* Quick portion chips */}
          <div className="space-y-1.5">
            <span className="text-[10px] text-neutral-400 font-medium">Быстрый выбор порции:</span>
            <div className="flex flex-wrap gap-1.5">
              {[50, 100, 150, 200].map((chipGrams) => (
                <button
                  key={chipGrams}
                  type="button"
                  onClick={() => setGrams(String(chipGrams))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    grams === String(chipGrams)
                      ? 'bg-emerald-500 text-white font-semibold shadow-sm'
                      : 'bg-neutral-900 border border-neutral-700/80 text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  {chipGrams}г
                </button>
              ))}
              {Boolean(
                selectedProduct.package_weight_grams &&
                  ![50, 100, 150, 200].includes(selectedProduct.package_weight_grams)
              ) && (
                <button
                  type="button"
                  onClick={() => setGrams(String(selectedProduct.package_weight_grams))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    grams === String(selectedProduct.package_weight_grams)
                      ? 'bg-emerald-500 text-white font-semibold shadow-sm'
                      : 'bg-neutral-900 border border-neutral-700/80 text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  Упаковка ({selectedProduct.package_weight_grams}г)
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-1/2">
              <label className="text-[11px] text-neutral-400 block mb-1">
                Вес порции (граммы)
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                onBlur={() => {
                  const num = parseFloat(grams)
                  if (isNaN(num) || num <= 0) setGrams('100')
                }}
                placeholder="100"
                className="w-full bg-[#18181b] border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-emerald-500 outline-none"
              />
            </div>
            <div className="w-1/2 text-right">
              <span className="text-[11px] text-neutral-400 block mb-1">
                Итого в порции:
              </span>
              <span className="text-sm font-bold text-emerald-400">
                {Math.round(selectedProduct.calories_per_100g * ((parseFloat(grams) || 100) / 100))} ккал
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handleConfirmPortion(true)}
              className="text-xs font-medium"
            >
              + Добавить ещё
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => handleConfirmPortion(false)}
              className="text-xs font-medium"
            >
              В дневник
            </Button>
          </div>
        </div>
      )}

      {/* Results List */}
      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-neutral-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2 text-emerald-500" />
            <span className="text-xs">Поиск...</span>
          </div>
        ) : products.length > 0 ? (
          products.map((p) => (
            <ProductItem
              key={p.id}
              product={p}
              onSelect={(item) => setSelectedProduct(item)}
            />
          ))
        ) : query ? (
          <div className="text-center py-6 px-4 space-y-3 rounded-xl bg-neutral-900/50 border border-neutral-800">
            <p className="text-xs text-neutral-400">
              По запросу «<span className="text-white font-medium">{query}</span>» ничего не найдено.
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => handleStartCreate(query)}
              className="mx-auto"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
              Создать продукт «{query}»
            </Button>
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-neutral-500">
            Начните вводить название продукта
          </div>
        )}
      </div>
    </div>
  )
}
