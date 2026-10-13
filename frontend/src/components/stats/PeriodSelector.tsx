import React from 'react'

export type PeriodType = 'today' | 'week' | 'month'

interface PeriodSelectorProps {
  selectedPeriod: PeriodType
  onSelectPeriod: (period: PeriodType) => void
}

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  selectedPeriod,
  onSelectPeriod,
}) => {
  const periods: { key: PeriodType; label: string }[] = [
    { key: 'today', label: 'Сегодня' },
    { key: 'week', label: '7 дней' },
    { key: 'month', label: '30 дней' },
  ]

  return (
    <div className="flex bg-[#16161a] p-1 rounded-xl border border-neutral-800/80">
      {periods.map((p) => {
        const isSelected = selectedPeriod === p.key
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onSelectPeriod(p.key)}
            className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
              isSelected
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}
