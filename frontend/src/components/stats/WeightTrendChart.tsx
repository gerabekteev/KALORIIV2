import React from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import { WeightLog } from '../../types'

interface WeightTrendChartProps {
  logs: WeightLog[]
  targetWeight?: number | null
}

export const WeightTrendChart: React.FC<WeightTrendChartProps> = ({
  logs,
  targetWeight,
}) => {
  if (!logs || logs.length === 0) {
    return (
      <div className="h-56 flex flex-col items-center justify-center text-xs text-neutral-500 gap-1">
        <span>Нет записей веса</span>
        <span className="text-[11px] text-neutral-400">
          Запишите вес в профиле, чтобы отслеживать прогресс
        </span>
      </div>
    )
  }

  // Sort logs by date ascending
  const sortedLogs = [...logs].sort((a, b) => {
    const dateA = a.log_date || a.date || ''
    const dateB = b.log_date || b.date || ''
    return new Date(dateA).getTime() - new Date(dateB).getTime()
  })

  const chartData = sortedLogs.map((item) => {
    const rawDate = item.log_date || item.date || ''
    const parts = rawDate.split('-').map(Number)
    const dateObj = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(rawDate)
    return {
      ...item,
      shortDate: dateObj.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
      }),
    }
  })

  // Calculate min and max weights for better Y-axis domain
  const weights = chartData.map((d) => d.weight_kg)
  if (targetWeight) weights.push(targetWeight)
  const minWeight = Math.floor(Math.min(...weights) - 2)
  const maxWeight = Math.ceil(Math.max(...weights) + 2)

  return (
    <div className="w-full h-56 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <XAxis
            dataKey="shortDate"
            stroke="#737373"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#2e2e33' }}
          />
          <YAxis
            domain={[minWeight, maxWeight]}
            stroke="#737373"
            fontSize={10}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload as WeightLog & { shortDate: string }
                return (
                  <div className="bg-[#1c1c20] border border-neutral-700/80 p-2.5 rounded-xl shadow-xl text-xs space-y-1">
                    <p className="font-semibold text-white">{item.shortDate}</p>
                    <p className="text-emerald-400 font-bold">
                      {item.weight_kg} кг
                    </p>
                    {targetWeight && (
                      <p className="text-neutral-400 text-[10px]">
                        Цель: {targetWeight} кг
                      </p>
                    )}
                  </div>
                )
              }
              return null
            }}
          />
          {targetWeight && (
            <ReferenceLine
              y={targetWeight}
              stroke="#06b6d4"
              strokeDasharray="4 4"
              label={{
                value: `Цель ${targetWeight} кг`,
                fill: '#06b6d4',
                fontSize: 10,
                position: 'insideBottomRight',
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="weight_kg"
            stroke="#10b981"
            strokeWidth={3}
            dot={{ fill: '#10b981', r: 4, strokeWidth: 2, stroke: '#1c1c20' }}
            activeDot={{ r: 6, fill: '#34d399' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
