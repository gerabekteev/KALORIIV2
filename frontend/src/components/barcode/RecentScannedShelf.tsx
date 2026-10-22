import React, { useEffect, useState } from 'react'
import {
  Package,
  Plus,
  Trash2,
  Barcode,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { RecentScannedProductItem, BarcodeProductResult } from '../../types'
import { barcodeApi } from '../../api/barcode'
import { pluralizeRu } from '../../utils/pluralize'
import { resolveMediaUrl } from '../../utils/platform'

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
  const [isLoading, setIsLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

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
      is_honest_sign: Boolean(item.is_honest_sign || (item.barcode && item.barcode.length > 13)),
    }
    onSelectProduct(result)
  }

  // Loading skeleton state
  if (isLoading) {
    return (
      <div className="w-full max-w-full overflow-hidden space-y-2 pt-1 animate-in fade-in duration-150">
        <div className="flex items-center justify-between">
          <div className="h-4 w-40 bg-neutral-800/80 rounded-md animate-pulse" />
          <div className="h-3 w-14 bg-neutral-800/60 rounded-md animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pb-1.5 pt-0.5">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-full p-2.5 rounded-2xl bg-[#161619] border border-neutral-800/60 flex flex-col items-center gap-2 animate-pulse"
            >
              <div className="w-16 h-16 rounded-xl bg-neutral-800/80" />
              <div className="w-20 h-3 bg-neutral-800/80 rounded" />
              <div className="w-14 h-2.5 bg-neutral-800/80 rounded" />
              <div className="w-full h-6 bg-neutral-800/50 rounded-lg mt-1" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Neat empty state
  if (items.length === 0) {
    return (
      <div className="w-full max-w-full p-3 sm:p-3.5 rounded-2xl bg-[#151518] border border-dashed border-neutral-800/80 flex items-center justify-between gap-3 animate-in fade-in">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <Barcode className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-neutral-300 truncate">
              Недавно отсканированные
            </p>
            <p className="text-[11px] text-neutral-500 truncate">
              Штрихкоды сохраняются для быстрого повтора
            </p>
          </div>
        </div>
        {onOpenScanner && (
          <button
            type="button"
            onClick={onOpenScanner}
            className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 px-2.5 py-1.5 rounded-xl transition-colors shrink-0 cursor-pointer whitespace-nowrap active:scale-95"
          >
            Сканировать
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="w-full max-w-full overflow-hidden space-y-2 pt-1 animate-in fade-in">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-neutral-300 flex items-center gap-1.5 truncate">
          <Barcode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">Недавно отсканированные:</span>
        </h4>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-[10px] text-neutral-400">
            {items.length} {pluralizeRu(items.length, ['продукт', 'продукта', 'продуктов'])}
          </span>
          {items.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAll((prev) => !prev)}
              className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 cursor-pointer transition-colors"
            >
              <span>{showAll ? 'Свернуть' : 'Все'}</span>
              {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>

      {/* Responsive grid — mobile adapted without horizontal scrolling */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-0.5">
        {(showAll ? items : items.slice(0, 4)).map((item) => {
          const baseWeight = item.package_weight_grams || 100
          const portionCalories = Math.round(
            item.calories_per_100g * (baseWeight / 100)
          )

          return (
            <div
              key={item.id}
              onClick={() => handleCardClick(item)}
              className="group relative flex flex-col items-center w-full p-2.5 sm:p-3 rounded-2xl bg-[#1a1a1f] hover:bg-[#22222a] border border-neutral-800/80 hover:border-emerald-500/40 transition-all cursor-pointer shadow-sm active:scale-[0.98]"
            >
              {/* Image preview */}
              <div className="w-16 h-16 rounded-xl bg-neutral-900 border border-neutral-800 overflow-hidden flex items-center justify-center mb-2 shrink-0">
                {item.image_url ? (
                  <img
                    src={resolveMediaUrl(item.image_url)}
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
              <div className="w-full text-center min-w-0 flex-1 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-semibold text-white block truncate" title={item.name}>
                    {item.name}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold block mt-0.5">
                    {portionCalories} ккал
                  </span>
                </div>
                <span className="text-[9px] text-neutral-400 block truncate mt-0.5">
                  пачка {Math.round(baseWeight)}г
                </span>
              </div>

              {/* Add Button Badge */}
              <button
                type="button"
                className="mt-2 w-full py-1.5 bg-emerald-500/15 group-hover:bg-emerald-500 text-emerald-400 group-hover:text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                title="Добавить"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Добавить</span>
              </button>

              {/* Delete button: accessible on hover on desktop, or touch on mobile */}
              <button
                type="button"
                onClick={(e) => handleDeleteItem(e, item.product_id)}
                className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 text-neutral-400 hover:text-rose-400 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer z-10"
                title="Удалить из недавних"
                aria-label="Удалить из недавних"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
