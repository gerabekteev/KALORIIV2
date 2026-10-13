import React from 'react'
import { Plus } from 'lucide-react'
import { Product } from '../../types'

interface ProductItemProps {
  product: Product
  onSelect?: (product: Product) => void
}

export const ProductItem: React.FC<ProductItemProps> = ({ product, onSelect }) => {
  return (
    <div
      onClick={() => onSelect?.(product)}
      className="flex items-center justify-between p-3 rounded-xl bg-[#202024] hover:bg-[#28282d] border border-neutral-800 transition-colors cursor-pointer group"
    >
      <div className="flex-1 min-w-0 pr-3">
        <h4 className="text-sm font-medium text-white truncate group-hover:text-emerald-400 transition-colors">
          {product.name}
        </h4>
        <div className="flex items-center gap-2 mt-1 text-xs text-neutral-400">
          <span className="font-semibold text-emerald-400">
            {product.calories_per_100g} ккал
          </span>
          <span>•</span>
          <span>Б: {product.protein_per_100g}г</span>
          <span>•</span>
          <span>Ж: {product.fat_per_100g}г</span>
          <span>•</span>
          <span>У: {product.carbs_per_100g}г</span>
          <span className="text-[10px] text-neutral-500">(на 100г)</span>
        </div>
      </div>

      {onSelect && (
        <button
          type="button"
          className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
