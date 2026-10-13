import React, { useEffect, useState } from 'react'
import {
  Package,
  Plus,
  Trash2,
  Sparkles,
  Barcode,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react'
import { RecentScannedProductItem, BarcodeProductResult } from '../../types'
import { barcodeApi } from '../../api/barcode'

interface RecentScannedShelfProps {
  onSelectProduct: (product: BarcodeProductResult) => void
  onOpenScanner?: () => void
  refreshTrigger?: number
}

export const RecentScannedShelf: React.FC<RecentScannedShelfProps> = ({
  onSelectProduct,
  onOpenScanner,
  refreshTrigger,
}) => {
  const [items, setItems] = useState<RecentScannedProductItem[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const loadRecentItems = async () => {
    setIsLoading(true)
    try {
      const data = await barcodeApi.getRecent()
      setItems(data || [])
    } catch {
      setItems([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadRecentItems()
  }, [refreshTrigger])

  const handleDeleteItem = async (e: React.MouseEvent, productId: number) => {
    e.stopPropagation()
    try {
      await barcodeApi.deleteRecent(productId)
      setItems((prev) => prev.filter((it) => it.product_id !== productId))
    } catch {
      // ignore
    }
  }

  const handleCardClick = (item: RecentScannedProductItem) => {
    const result: BarcodeProductResult = {
      product_id: item.product_id,
      name: item.name,
      brand: item.brand,
      barcode: item.barcode || '',
      calories_per_100g: item.calories_per_100g,
      protein_per_100g: item.protein_per_100g,
      fat_per_100g: item.fat_per_100g,
      carbs_per_100g: item.carbs_per_100g,
      package_weight_grams: item.package_weight_grams || 100.0,
      image_url: item.image_url,
      source: 'local',
      is_honest_sign: Boolean(item.barcode && item.barcode.length > 13),
    }
    onSelectProduct(result)
  }

  if (items.length === 0 && !isLoading) {
    return null
  }

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
          <Barcode className="w-3.5 h-3.5 text-emerald-400" />
          <span>Недавно отсканированные:</span>
        </h4>
        <span className="text-[10px] text-neutral-400">
          {items.length} {items.length === 1 ? 'продукт' : 'продуктов'}
        </span>
      </div>

      {/* Horizontal scrolling shelf */}
      <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin scrollbar-thumb-neutral-800">
        {items.map((item) => {
          const baseWeight = item.package_weight_grams || 100
          const portionCalories = Math.round(
            item.calories_per_100g * (baseWeight / 100)
          )

          return (
            <div
              key={item.id}
              onClick={() => handleCardClick(item)}
              className="group relative flex flex-col items-center w-28 shrink-0 p-2.5 rounded-2xl bg-[#1a1a1f] hover:bg-[#22222a] border border-neutral-800/80 hover:border-emerald-500/40 transition-all cursor-pointer shadow-sm active:scale-95"
            >
              {/* Image preview */}
              <div className="w-16 h-16 rounded-xl bg-neutral-900 border border-neutral-800 overflow-hidden flex items-center justify-center mb-2 shrink-0">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform"
                    onError={(e) => {
                      ;(e.target as HTMLElement).style.display = 'none'
                    }}
                  />
                ) : (
                  <Package className="w-7 h-7 text-neutral-500 group-hover:text-emerald-400 transition-colors" />
                )}
              </div>

              {/* Title & Calories */}
              <div className="w-full text-center">
                <span className="text-xs font-semibold text-white block truncate">
                  {item.name}
                </span>
                <span className="text-[10px] text-emerald-400 font-bold block mt-0.5">
                  {portionCalories} ккал
                </span>
                <span className="text-[9px] text-neutral-400 block truncate">
                  пачка {Math.round(baseWeight)}г
                </span>
              </div>

              {/* Add Button Badge */}
              <button
                type="button"
                className="mt-2 w-full py-1 bg-emerald-500/15 group-hover:bg-emerald-500 text-emerald-400 group-hover:text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                title="Добавить"
              >
                <Plus className="w-3 h-3 stroke-[2.5]" />
                <span>Добавить</span>
              </button>

              {/* Delete on hover */}
              <button
                type="button"
                onClick={(e) => handleDeleteItem(e, item.product_id)}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-neutral-400 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Удалить из недавних"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
