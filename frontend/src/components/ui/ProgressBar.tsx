import React from 'react'

export interface ProgressBarProps {
  current: number
  target: number
  label?: string
  unit?: string
  color?: 'emerald' | 'blue' | 'amber' | 'purple' | 'rose'
  size?: 'sm' | 'md' | 'lg'
  showValues?: boolean
  className?: string
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  current,
  target,
  label,
  unit = 'г',
  color = 'emerald',
  size = 'md',
  showValues = true,
  className = '',
}) => {
  const safeTarget = target > 0 ? target : 1
  const rawPercentage = (current / safeTarget) * 100
  const percentage = Math.min(Math.max(rawPercentage, 0), 100)
  const isOver = current > target && target > 0

  const colorStyles = {
    emerald: 'bg-emerald-500 shadow-emerald-500/30',
    blue: 'bg-blue-500 shadow-blue-500/30',
    amber: 'bg-amber-500 shadow-amber-500/30',
    purple: 'bg-purple-500 shadow-purple-500/30',
    rose: 'bg-rose-500 shadow-rose-500/30',
  }

  const badgeStyles = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  }

  const heights = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-3.5',
  }

  return (
    <div className={`w-full space-y-1.5 ${className}`}>
      {(label || showValues) && (
        <div className="flex items-center justify-between text-xs">
          {label && (
            <span className="font-medium text-neutral-300 flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${colorStyles[color].split(' ')[0]}`}
              />
              {label}
            </span>
          )}
          {showValues && (
            <span className="font-semibold text-neutral-300">
              <span className={isOver ? 'text-amber-400 font-bold' : 'text-neutral-100'}>
                {Math.round(current)}
              </span>
              <span className="text-neutral-500 font-normal">
                {' '}/ {Math.round(target)} {unit}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Progress Track */}
      <div
        className={`w-full bg-[#27272a] rounded-full overflow-hidden p-0.5 border border-neutral-800/60 ${heights[size]}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out shadow-sm ${
            isOver ? 'bg-amber-400 shadow-amber-400/30' : colorStyles[color]
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
