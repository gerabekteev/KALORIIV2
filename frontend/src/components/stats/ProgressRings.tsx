import React from 'react'

interface RingData {
  name: string
  current: number
  target: number
  color: string
  unit: string
}

interface ProgressRingsProps {
  calories: { current: number; target: number }
  protein: { current: number; target: number }
  fat: { current: number; target: number }
  carbs: { current: number; target: number }
  size?: number
}

export const ProgressRings: React.FC<ProgressRingsProps> = ({
  calories,
  protein,
  fat,
  carbs,
  size = 200,
}) => {
  const rings: RingData[] = [
    {
      name: 'Калории',
      current: calories.current,
      target: calories.target || 2000,
      color: '#10b981', // emerald
      unit: 'ккал',
    },
    {
      name: 'Белки',
      current: protein.current,
      target: protein.target || 140,
      color: '#3b82f6', // blue
      unit: 'г',
    },
    {
      name: 'Жиры',
      current: fat.current,
      target: fat.target || 70,
      color: '#f59e0b', // amber
      unit: 'г',
    },
    {
      name: 'Углеводы',
      current: carbs.current,
      target: carbs.target || 250,
      color: '#a855f7', // purple
      unit: 'г',
    },
  ]

  const strokeWidth = 9
  const gap = 3
  const center = size / 2

  return (
    <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
      {/* Concentric SVG Rings */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="rotate-[-90deg]"
        >
          {rings.map((ring, idx) => {
            const radius = center - strokeWidth / 2 - idx * (strokeWidth + gap)
            const circumference = 2 * Math.PI * radius
            const safeTarget = ring.target > 0 ? ring.target : 1
            const percentage = Math.min(ring.current / safeTarget, 1)
            const offset = circumference - percentage * circumference

            return (
              <g key={ring.name}>
                {/* Background Track */}
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke={ring.color}
                  strokeOpacity={0.18}
                  strokeWidth={strokeWidth}
                  fill="transparent"
                />
                {/* Active Progress */}
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke={ring.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-700 ease-out"
                />
              </g>
            )
          })}
        </svg>

        {/* Center Calories Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-xl font-bold text-white tracking-tight">
            {Math.round(calories.current)}
          </span>
          <span className="text-[10px] text-neutral-400 font-medium">
            из {Math.round(calories.target || 2000)} ккал
          </span>
        </div>
      </div>

      {/* Ring Legends */}
      <div className="grid grid-cols-2 gap-2.5 w-full sm:w-auto">
        {rings.map((r) => {
          const pct = Math.round((r.current / (r.target || 1)) * 100)
          return (
            <div
              key={r.name}
              className="p-2.5 rounded-xl bg-[#202025] border border-neutral-800 space-y-1"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
                <span className="text-xs font-semibold text-neutral-200">
                  {r.name}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-bold text-white">
                  {Math.round(r.current)}
                  <span className="text-neutral-500 font-normal text-[11px]">
                    {' '}/ {Math.round(r.target)} {r.unit}
                  </span>
                </span>
                <span
                  className="text-[10px] font-bold ml-1.5"
                  style={{ color: r.color }}
                >
                  {pct}%
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
