import React from 'react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'

interface MacrosPieChartProps {
  protein: number
  fat: number
  carbs: number
}

export const MacrosPieChart: React.FC<MacrosPieChartProps> = ({
  protein,
  fat,
  carbs,
}) => {
  const proteinKcal = Math.round(protein * 4)
  const fatKcal = Math.round(fat * 9)
  const carbsKcal = Math.round(carbs * 4)
  const totalKcal = proteinKcal + fatKcal + carbsKcal || 1

  const data = [
    {
      name: 'Белки',
      grams: Math.round(protein),
      value: proteinKcal,
      percentage: Math.round((proteinKcal / totalKcal) * 100),
      color: '#3b82f6', // blue-500
    },
    {
      name: 'Жиры',
      grams: Math.round(fat),
      value: fatKcal,
      percentage: Math.round((fatKcal / totalKcal) * 100),
      color: '#f59e0b', // amber-500
    },
    {
      name: 'Углеводы',
      grams: Math.round(carbs),
      value: carbsKcal,
      percentage: Math.round((carbsKcal / totalKcal) * 100),
      color: '#a855f7', // purple-500
    },
  ]

  if (protein === 0 && fat === 0 && carbs === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-xs text-neutral-500">
        Нет данных о БЖУ
      </div>
    )
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-around gap-4 py-2">
      {/* Donut Chart */}
      <div className="w-44 h-44 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload
                  return (
                    <div className="bg-[#1c1c20] border border-neutral-700/80 p-2.5 rounded-xl shadow-xl text-xs space-y-1">
                      <p className="font-semibold" style={{ color: item.color }}>
                        {item.name}
                      </p>
                      <p className="text-white">
                        {item.grams}г ({item.value} ккал)
                      </p>
                      <p className="text-neutral-400 text-[10px]">
                        {item.percentage}% от калорий
                      </p>
                    </div>
                  )
                }
                return null
              }}
            />
            <Pie
              data={data}
              innerRadius={50}
              outerRadius={75}
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
          <span className="text-xs text-neutral-400">БЖУ</span>
          <span className="text-sm font-bold text-white">Баланс</span>
        </div>
      </div>

      {/* Legend & Breakdown */}
      <div className="space-y-2.5 w-full sm:w-auto text-xs">
        {data.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between gap-4 p-2 rounded-xl bg-[#202025] border border-neutral-800"
          >
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="font-medium text-neutral-200">{item.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">{item.grams} г</span>
              <span className="text-neutral-400 text-[11px]">
                ({item.percentage}%)
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
