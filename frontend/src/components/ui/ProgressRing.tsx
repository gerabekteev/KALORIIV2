import React from 'react'

export interface ProgressRingProps {
  current: number
  target: number
  size?: number
  strokeWidth?: number
  strokeColor?: string
  trackColor?: string
  label?: string
  sublabel?: string
  children?: React.ReactNode
  showPercentage?: boolean
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  current,
  target,
  size = 180,
  strokeWidth = 14,
  strokeColor = '#10b981', // emerald-500
  trackColor = '#27272a',  // neutral-800
  label,
  sublabel,
  children,
  showPercentage = false,
}) => {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const safeTarget = target > 0 ? target : 1
  const percentage = Math.min(Math.round((current / safeTarget) * 100), 100)
  const offset = circumference - (percentage / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="rotate-[-90deg] transform"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="transparent"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
        {children ? (
          children
        ) : (
          <>
            <span className="text-2xl font-bold tracking-tight text-white">
              {current.toLocaleString()}
            </span>
            {target > 0 && (
              <span className="text-xs text-neutral-400 font-medium mt-0.5">
                из {target.toLocaleString()} {label || 'ккал'}
              </span>
            )}
            {showPercentage && (
              <span className="text-[11px] font-semibold text-emerald-400 mt-1 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                {percentage}%
              </span>
            )}
            {sublabel && (
              <span className="text-[10px] text-neutral-400 mt-0.5">{sublabel}</span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
