import React from 'react'

export type PeriodType = 'week' | 'month' | 'year'

interface PeriodSelectorProps {
  selectedPeriod: PeriodType
  onSelectPeriod: (period: PeriodType) => void
}

const PERIODS: { key: PeriodType; label: string }[] = [
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
  { key: 'year', label: 'Год' },
]

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  selectedPeriod,
  onSelectPeriod,
}) => {
  const activeIndex = Math.max(
    0,
    PERIODS.findIndex((p) => p.key === selectedPeriod)
  )

  return (
    <div
      className="relative grid grid-cols-3 bg-[#1A1A1D] p-1 rounded-full select-none"
      role="tablist"
      aria-label="Период статистики"
    >
      {/* Smoothly Gliding Pure-White Active Pill */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1 bottom-1 left-1 rounded-full bg-white transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          width: 'calc((100% - 8px) / 3)',
          transform: `translate3d(${activeIndex * 100}%, 0, 0)`,
        }}
      />

      {PERIODS.map((p) => {
        const isSelected = selectedPeriod === p.key
        return (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelectPeriod(p.key)}
            className={`relative z-10 py-2 px-3 text-xs font-semibold rounded-full transition-colors duration-200 cursor-pointer whitespace-nowrap focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${
              isSelected ? 'text-black' : 'text-[#8E8E96] hover:text-white'
            }`}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}
