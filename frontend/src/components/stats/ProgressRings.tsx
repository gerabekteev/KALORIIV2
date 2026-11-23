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
  size = 188,
}) => {
  // Strict Nothing X monochrome + surgical red outer ring
  const rings: RingData[] = [
    {
      name: 'Калории',
      current: calories.current,
      target: calories.target || 2000,
      color: '#E02424',
      unit: 'ккал',
    },
    {
      name: 'Белки',
      current: protein.current,
      target: protein.target || 140,
      color: '#FFFFFF',
      unit: 'г',
    },
    {
      name: 'Жиры',
      current: fat.current,
      target: fat.target || 70,
      color: '#A1A1AA',
      unit: 'г',
    },
    {
      name: 'Углеводы',
      current: carbs.current,
      target: carbs.target || 250,
      color: '#63636B',
      unit: 'г',
    },
  ]

  const strokeWidth = 8.5
  const gap = 3.5
  const center = size / 2

  return (
    <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center justify-around gap-4 py-2">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
          {rings.map((ring, idx) => {
            const radius = center - strokeWidth / 2 - idx * (strokeWidth + gap)
            const circumference = 2 * Math.PI * radius
            const safeTarget = ring.target > 0 ? ring.target : 1
            const percentage = Math.min(ring.current / safeTarget, 1)
            const offset = circumference - percentage * circumference

            return (
              <g key={ring.name}>
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke="#2A2A2F"
                  strokeWidth={strokeWidth}
                  fill="transparent"
                />
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

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="font-ndot text-lg font-bold text-white leading-none">
            {Math.round(calories.current)}
          </span>
          <span className="text-[10px] text-[#7A7A82] mt-1">
            /{Math.round(calories.target || 2000)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 w-full sm:flex-1 lg:w-full xl:flex-1 min-w-0">
        {rings.map((r) => {
          const pct = Math.round((r.current / (r.target || 1)) * 100)
          return (
            <div key={r.name} className="p-2.5 rounded-2xl bg-[#111113] space-y-1 min-w-0">
              <div className="flex items-center justify-between gap-1.5 min-w-0">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#D4D4D8] truncate">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                  <span className="truncate">{r.name}</span>
                </span>
                <span
                  className="font-ndot text-[10px] font-bold shrink-0"
                  style={{ color: r.color === '#63636B' ? '#A1A1AA' : r.color }}
                >
                  {pct}%
                </span>
              </div>
              <div className="font-ndot text-xs font-bold text-white truncate">
                {Math.round(r.current)}
                <span className="text-[#7A7A82] font-normal">/{Math.round(r.target)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
