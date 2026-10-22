import React, { useState, useEffect } from 'react'
import { Search, Loader2, Plus, X, Calculator, Scale, Minus } from 'lucide-react'
import { Product } from '../../types'
import { productsApi } from '../../api/products'
import { ProductItem } from './ProductItem'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useUIStore } from '../../store/uiStore'

function parseNum(val: string): number {
  if (!val) return 0
  const n = parseFloat(val.replace(',', '.').trim())
  return Number.isFinite(n) && n >= 0 ? n : 0
}

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
    brand: '',
    package_weight_grams: '',
    calories: '',
    protein: '',
    fat: '',
    carbs: '',
    portion_grams: '100',
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
      brand: '',
      package_weight_grams: '',
      calories: '',
      protein: '',
      fat: '',
      carbs: '',
      portion_grams: '100',
    })
    setIsCreating(true)
  }

  const handleCancelCreate = () => {
    setIsCreating(false)
    setNewProduct({
      name: '',
      brand: '',
      package_weight_grams: '',
      calories: '',
      protein: '',
      fat: '',
      carbs: '',
      portion_grams: '100',
    })
  }

  const newProdProtein = parseNum(newProduct.protein)
  const newProdFat = parseNum(newProduct.fat)
  const newProdCarbs = parseNum(newProduct.carbs)
  const newProdMacroCal = Math.round(newProdProtein * 4 + newProdFat * 9 + newProdCarbs * 4)
  const newProdEffectiveCal =
    newProduct.calories.trim() !== '' ? Math.round(parseNum(newProduct.calories)) : newProdMacroCal
  const newProdPortionGrams = Math.max(1, parseNum(newProduct.portion_grams || '100'))
  const newProdPortionRatio = newProdPortionGrams / 100
  const newProdPortionCal = Math.round(newProdEffectiveCal * newProdPortionRatio)

  const handleSaveCustomProduct = async (addImmediatelyToDiary: boolean) => {
    if (!newProduct.name.trim()) {
      addToast('Введите название продукта', 'warning')
      return
    }
    if (newProdEffectiveCal <= 0 && newProdProtein <= 0 && newProdFat <= 0 && newProdCarbs <= 0) {
      addToast('Укажите калории или БЖУ на 100 г', 'warning')
      return
    }

    const pkgWeight = parseNum(newProduct.package_weight_grams)
    setIsSavingProduct(true)
    try {
      const created = await productsApi.createProduct({
        name: newProduct.name.trim(),
        brand: newProduct.brand.trim() || null,
        package_weight_grams: pkgWeight > 0 ? pkgWeight : null,
        calories_per_100g: newProdEffectiveCal,
        protein_per_100g: newProdProtein,
        fat_per_100g: newProdFat,
        carbs_per_100g: newProdCarbs,
      })
      setProducts((prev) => [created, ...prev.filter((p) => p.id !== created.id)])
      setIsCreating(false)

      if (addImmediatelyToDiary) {
        onSelectProduct(
          {
            name: created.brand ? `${created.name} (${created.brand})` : created.name,
            calories: Math.round(created.calories_per_100g * newProdPortionRatio),
            protein: Math.round(created.protein_per_100g * newProdPortionRatio * 10) / 10,
            fat: Math.round(created.fat_per_100g * newProdPortionRatio * 10) / 10,
            carbs: Math.round(created.carbs_per_100g * newProdPortionRatio * 10) / 10,
            weight_grams: Math.round(newProdPortionGrams),
          },
          false
        )
      } else {
        setSelectedProduct(created)
        setGrams(String(Math.round(newProdPortionGrams)))
        addToast('Продукт сохранён в базу!', 'success')
      }
    } catch {
      addToast('Ошибка при создании продукта', 'error')
    } finally {
      setIsSavingProduct(false)
    }
  }

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSaveCustomProduct(true)
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
          className="p-4 rounded-2xl bg-[#18181d] border border-emerald-500/40 space-y-3.5 animate-in fade-in"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>Новый продукт (КБЖУ на 100 г)</span>
            </h4>
            <button
              type="button"
              onClick={handleCancelCreate}
              className="text-neutral-400 hover:text-white p-1 rounded-lg cursor-pointer"
              title="Отмена"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-2">
              <Input
                label="Название продукта *"
                placeholder="Например: Творог 5% домашний"
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div>
              <Input
                label="Вес упаковки (г)"
                type="number"
                min="1"
                placeholder="Напр. 180"
                value={newProduct.package_weight_grams}
                onChange={(e) => {
                  const val = e.target.value
                  const pkg = parseNum(val)
                  setNewProduct((prev) => ({
                    ...prev,
                    package_weight_grams: val,
                    portion_grams:
                      pkg > 0 && prev.portion_grams === '100' ? String(Math.round(pkg)) : prev.portion_grams,
                  }))
                }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                Пищевая ценность на 100 грамм (с пачки)
              </span>
              {newProdMacroCal > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setNewProduct((prev) => ({ ...prev, calories: String(newProdMacroCal) }))
                  }
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-lg cursor-pointer"
                >
                  <Calculator className="w-3 h-3" />
                  <span>Авто: {newProdMacroCal} ккал</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Input
                label="Ккал / 100г *"
                type="number"
                min="0"
                step="any"
                placeholder={newProdMacroCal > 0 ? String(newProdMacroCal) : '0'}
                value={newProduct.calories}
                onChange={(e) => setNewProduct({ ...newProduct, calories: e.target.value })}
              />
              <Input
                label="Белки / 100г"
                type="number"
                step="any"
                min="0"
                placeholder="0"
                value={newProduct.protein}
                onChange={(e) => setNewProduct({ ...newProduct, protein: e.target.value })}
              />
              <Input
                label="Жиры / 100г"
                type="number"
                step="any"
                min="0"
                placeholder="0"
                value={newProduct.fat}
                onChange={(e) => setNewProduct({ ...newProduct, fat: e.target.value })}
              />
              <Input
                label="Углеводы / 100г"
                type="number"
                step="any"
                min="0"
                placeholder="0"
                value={newProduct.carbs}
                onChange={(e) => setNewProduct({ ...newProduct, carbs: e.target.value })}
              />
            </div>
          </div>

          {/* Inline Portion Weight Selector for immediate addition */}
          <div className="p-3 rounded-xl bg-[#121317] border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-emerald-400" />
                <span>Ваша порция сейчас (г):</span>
              </span>
              <span className="text-xs font-bold text-emerald-400">
                Итого: {newProdPortionCal} ккал ({Math.round(newProdPortionGrams)} г)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                step="any"
                value={newProduct.portion_grams}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, portion_grams: e.target.value })
                }
                className="w-24 bg-[#18181d] border border-neutral-700 focus:border-emerald-500 rounded-lg px-2.5 py-1.5 text-sm font-bold text-white outline-none text-center"
              />
              <div className="flex flex-wrap gap-1 flex-1">
                {[50, 100, 150, 200, 250].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() =>
                      setNewProduct((prev) => ({ ...prev, portion_grams: String(g) }))
                    }
                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                      Math.round(newProdPortionGrams) === g
                        ? 'bg-emerald-500 text-white'
                        : 'bg-neutral-800 text-neutral-300 hover:text-white'
                    }`}
                  >
                    {g}г
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="sm:w-2/5"
              isLoading={isSavingProduct}
              onClick={() => handleSaveCustomProduct(false)}
            >
              Только в базу
            </Button>
            <Button
              type="submit"
              size="sm"
              className="sm:w-3/5"
              isLoading={isSavingProduct}
            >
              {`Создать и в дневник (${newProdPortionCal} ккал)`}
            </Button>
          </div>
        </form>
      )}

      {/* Selected Product Portion Drawer */}
      {selectedProduct && (
        <div className="p-4 rounded-2xl bg-[#181a20] border border-emerald-500/40 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-white truncate">
                {selectedProduct.name}
              </h4>
              <span className="text-[11px] text-neutral-400">
                На 100 г: {Math.round(selectedProduct.calories_per_100g)} ккал • Б:{' '}
                {selectedProduct.protein_per_100g}г • Ж: {selectedProduct.fat_per_100g}г • У:{' '}
                {selectedProduct.carbs_per_100g}г
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedProduct(null)}
              className="text-xs text-neutral-400 hover:text-white shrink-0 cursor-pointer"
            >
              Сменить
            </button>
          </div>

          {/* Quick portion chips */}
          <div className="space-y-1.5">
            <span className="text-[10px] text-neutral-400 font-medium">Быстрый выбор веса порции:</span>
            <div className="flex flex-wrap gap-1.5">
              {[30, 50, 100, 150, 200, 250, 300].map((chipGrams) => (
                <button
                  key={chipGrams}
                  type="button"
                  onClick={() => setGrams(String(chipGrams))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    Math.round(parseFloat(grams) || 0) === chipGrams
                      ? 'bg-emerald-500 text-white font-semibold shadow-sm'
                      : 'bg-neutral-900 border border-neutral-700/80 text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  {chipGrams}г
                </button>
              ))}
              {Boolean(
                selectedProduct.package_weight_grams &&
                  selectedProduct.package_weight_grams > 0
              ) && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setGrams(String(Math.round((selectedProduct.package_weight_grams || 100) * 0.5)))
                    }
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-neutral-900 border border-emerald-500/30 text-emerald-300 hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    ½ пачки ({Math.round((selectedProduct.package_weight_grams || 100) * 0.5)}г)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGrams(String(Math.round(selectedProduct.package_weight_grams || 100)))}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      Math.round(parseFloat(grams) || 0) === Math.round(selectedProduct.package_weight_grams || 0)
                        ? 'bg-emerald-500 text-white font-semibold shadow-sm'
                        : 'bg-neutral-900 border border-emerald-500/30 text-emerald-300 hover:bg-neutral-800'
                    }`}
                  >
                    Вся пачка ({Math.round(selectedProduct.package_weight_grams || 100)}г)
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 bg-[#121317] p-2.5 rounded-xl border border-neutral-800">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setGrams(String(Math.max(5, Math.round((parseFloat(grams) || 100) - 25))))
                }
                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 cursor-pointer"
                title="-25 г"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
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
                className="w-20 bg-[#18181b] border border-neutral-700 rounded-lg px-2 py-1 text-center text-sm font-bold text-white focus:border-emerald-500 outline-none"
              />
              <span className="text-xs text-neutral-400">г</span>
              <button
                type="button"
                onClick={() =>
                  setGrams(String(Math.round((parseFloat(grams) || 100) + 25)))
                }
                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 cursor-pointer"
                title="+25 г"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-right">
              <span className="text-sm font-extrabold text-emerald-400 block">
                {Math.round(selectedProduct.calories_per_100g * ((parseFloat(grams) || 100) / 100))} ккал
              </span>
              <span className="text-[10px] text-neutral-400 block">
                Б: {Math.round(selectedProduct.protein_per_100g * ((parseFloat(grams) || 100) / 100) * 10) / 10}г • Ж:{' '}
                {Math.round(selectedProduct.fat_per_100g * ((parseFloat(grams) || 100) / 100) * 10) / 10}г • У:{' '}
                {Math.round(selectedProduct.carbs_per_100g * ((parseFloat(grams) || 100) / 100) * 10) / 10}г
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
