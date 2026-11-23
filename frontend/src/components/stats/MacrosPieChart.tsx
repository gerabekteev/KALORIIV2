import React from 'react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'

interface MacrosPieChartProps {
  protein: number
  fat: number
  carbs: number
  mode?: 'grams' | 'calories'
}

export const MacrosPieChart: React.FC<MacrosPieChartProps> = ({
  protein,
  fat,
  carbs,
  mode = 'grams',
}) => {
  const pGrams = Math.round(protein)
  const fGrams = Math.round(fat)
  const cGrams = Math.round(carbs)

  const pKcal = Math.round(protein * 4)
  const fKcal = Math.round(fat * 9)
  const cKcal = Math.round(carbs * 4)

  const totalGrams = pGrams + fGrams + cGrams || 1
  const totalKcal = pKcal + fKcal + cKcal || 1

  const isCalories = mode === 'calories'

  // Strict Nothing X monochrome scale
  const data = [
    {
      name: 'Белки',
      grams: pGrams,
      kcal: pKcal,
      value: isCalories ? pKcal : pGrams,
      percentage: Math.round(((isCalories ? pKcal : pGrams) / (isCalories ? totalKcal : totalGrams)) * 100),
      color: '#FFFFFF',
    },
    {
      name: 'Жиры',
      grams: fGrams,
      kcal: fKcal,
      value: isCalories ? fKcal : fGrams,
      percentage: Math.round(((isCalories ? fKcal : fGrams) / (isCalories ? totalKcal : totalGrams)) * 100),
      color: '#9A9AA2',
    },
    {
      name: 'Углеводы',
      grams: cGrams,
      kcal: cKcal,
      value: isCalories ? cKcal : cGrams,
      percentage: Math.round(((isCalories ? cKcal : cGrams) / (isCalories ? totalKcal : totalGrams)) * 100),
      color: '#4B4B53',
    },
  ]

  if (pGrams === 0 && fGrams === 0 && cGrams === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-xs text-[#7A7A82]">
        Нет данных о БЖУ
      </div>
    )
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-around gap-4 py-2">
      <div className="w-44 h-44 relative shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload
                  return (
                    <div className="bg-[#111113] border border-white/[0.12] p-2.5 rounded-2xl shadow-2xl text-xs space-y-1">
                      <p className="font-semibold text-white my-0">{item.name}</p>
                      <p className="font-ndot font-bold text-white my-0">
                        {isCalories ? `${item.kcal} ккал` : `${item.grams} г`}
                      </p>
                      <p className="font-ndot text-[#7A7A82] text-[10px] my-0">
                        {item.percentage}%
                      </p>
                    </div>
                  )
                }
                return null
              }}
            />
            <Pie
              data={data}
              innerRadius={52}
              outerRadius={74}
              paddingAngle={4}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] uppercase tracking-wider text-[#7A7A82]">
            {isCalories ? 'Ккал' : 'Граммы'}
          </span>
          <span className="font-ndot text-sm font-bold text-white mt-0.5">
            {isCalories ? totalKcal : `${totalGrams}г`}
          </span>
        </div>
      </div>

      <div className="space-y-2 w-full sm:w-auto min-w-[170px] text-xs">
        {data.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between gap-4 px-3 py-2 rounded-2xl bg-[#111113]"
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="font-medium text-[#E4E4E7]">{item.name}</span>
            </div>
            <div className="flex items-center gap-2 font-ndot">
              <span className="font-bold text-white">
                {isCalories ? `${item.kcal}` : `${item.grams}г`}
              </span>
              <span className="text-[#7A7A82] text-[11px]">{item.percentage}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
