import React, { useState, useEffect } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { Product } from '../../types'
import { productsApi } from '../../api/products'
import { ProductItem } from './ProductItem'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

interface ProductSearchProps {
  onSelectProduct: (product: {
    name: string
    calories: number
    protein: number
    fat: number
    carbs: number
    weight_grams: number
  }) => void
}

export const ProductSearch: React.FC<ProductSearchProps> = ({ onSelectProduct }) => {
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [grams, setGrams] = useState<number>(100)

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

  const handleConfirmPortion = () => {
    if (!selectedProduct) return
    const ratio = (grams || 100) / 100
    onSelectProduct({
      name: selectedProduct.name,
      calories: Math.round(selectedProduct.calories_per_100g * ratio),
      protein: Math.round(selectedProduct.protein_per_100g * ratio * 10) / 10,
      fat: Math.round(selectedProduct.fat_per_100g * ratio * 10) / 10,
      carbs: Math.round(selectedProduct.carbs_per_100g * ratio * 10) / 10,
      weight_grams: grams || 100,
    })
    setSelectedProduct(null)
  }

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <Input
        placeholder="Поиск по базе продуктов (курица, овсянка...)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        leftIcon={<Search className="w-4 h-4" />}
      />

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

          <div className="flex items-center gap-3">
            <div className="w-1/2">
              <label className="text-[11px] text-neutral-400 block mb-1">
                Вес порции (граммы)
              </label>
              <input
                type="number"
                min="1"
                value={grams}
                onChange={(e) => setGrams(Number(e.target.value))}
                className="w-full bg-[#18181b] border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-emerald-500 outline-none"
              />
            </div>
            <div className="w-1/2 text-right">
              <span className="text-[11px] text-neutral-400 block mb-1">
                Итого в порции:
              </span>
              <span className="text-sm font-bold text-emerald-400">
                {Math.round(selectedProduct.calories_per_100g * (grams / 100))} ккал
              </span>
            </div>
          </div>

          <Button
            size="sm"
            className="w-full"
            onClick={handleConfirmPortion}
          >
            Добавить в приём пищи
          </Button>
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
          <div className="text-center py-6 text-xs text-neutral-500">
            Ничего не найдено. Вы можете ввести КБЖУ вручную.
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
