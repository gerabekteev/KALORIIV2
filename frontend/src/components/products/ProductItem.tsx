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
      className="flex items-center justify-between p-3 rounded-[18px] bg-[#1A1A1D] hover:bg-[#222226] transition-colors cursor-pointer group"
    >
      <div className="flex-1 min-w-0 pr-3">
        <h4 className="text-sm font-medium text-white truncate my-0">
          {product.name}
        </h4>
        <div className="flex items-center gap-2 mt-1 text-xs text-[#7A7A82] font-ndot">
          <span className="font-bold text-white">
            {product.calories_per_100g} ккал
          </span>
          <span>·</span>
          <span>Б {product.protein_per_100g}</span>
          <span>·</span>
          <span>Ж {product.fat_per_100g}</span>
          <span>·</span>
          <span>У {product.carbs_per_100g}</span>
          <span className="font-sans text-[10px] text-[#6E6E75]">/ 100г</span>
        </div>
      </div>

      {onSelect && (
        <button
          type="button"
          className="w-8 h-8 rounded-full bg-[#2A2A2F] text-white group-hover:bg-white group-hover:text-black flex items-center justify-center transition-colors shrink-0"
          aria-label={`Выбрать ${product.name}`}
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
