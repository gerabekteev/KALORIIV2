import React from 'react'

export interface ProgressBarProps {
  current: number
  target: number
  label?: string
  unit?: string
  color?: 'emerald' | 'blue' | 'amber' | 'purple' | 'rose' | 'white' | 'gray' | 'red'
  size?: 'sm' | 'md' | 'lg'
  showValues?: boolean
  className?: string
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  current,
  target,
  label,
  unit = 'г',
  color = 'white',
  size = 'md',
  showValues = true,
  className = '',
}) => {
  const safeTarget = target > 0 ? target : 1
  const rawPercentage = (current / safeTarget) * 100
  const percentage = Math.min(Math.max(rawPercentage, 0), 100)
  const isOver = current > target && target > 0

  // Strict Nothing X monochrome + surgical red mapping
  const fillMap: Record<NonNullable<ProgressBarProps['color']>, string> = {
    emerald: 'bg-white',
    white: 'bg-white',
    blue: 'bg-white',
    amber: 'bg-[#A1A1AA]',
    gray: 'bg-[#A1A1AA]',
    purple: 'bg-[#6E6E75]',
    rose: 'bg-[#E02424]',
    red: 'bg-[#E02424]',
  }

  const heights = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-2.5',
  }

  return (
    <div className={`w-full space-y-1.5 ${className}`}>
      {(label || showValues) && (
        <div className="flex items-center justify-between text-xs">
          {label && (
            <span className="font-medium text-[#E4E4E7] flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${isOver ? 'bg-[#E02424]' : fillMap[color]}`}
              />
              {label}
            </span>
          )}
          {showValues && (
            <span className="font-ndot text-xs tabular-nums">
              <span className={isOver ? 'text-[#E02424] font-bold' : 'text-white font-bold'}>
                {Math.round(current)}
              </span>
              <span className="text-[#7A7A82]">
                /{Math.round(target)} {unit}
              </span>
            </span>
          )}
        </div>
      )}

      <div className={`w-full bg-[#2A2A2F] rounded-full overflow-hidden ${heights[size]}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            isOver ? 'bg-[#E02424]' : fillMap[color]
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
