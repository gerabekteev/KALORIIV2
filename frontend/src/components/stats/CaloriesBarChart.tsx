import React from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts'
import { StatsDayData } from '../../types'

interface CaloriesBarChartProps {
  data: StatsDayData[]
  targetCalories?: number
}

export const CaloriesBarChart: React.FC<CaloriesBarChartProps> = ({
  data,
  targetCalories = 2000,
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-xs text-neutral-500">
        Нет данных за выбранный период
      </div>
    )
  }

  // Format short date for X axis: "13 окт"
  const chartData = data.map((d) => {
    const parts = d.date.split('-').map(Number)
    const dateObj = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(d.date)
    const formattedDate = dateObj.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
    })
    return {
      ...d,
      shortDate: formattedDate,
    }
  })

  return (
    <div className="w-full h-56 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
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
            stroke="#737373"
            fontSize={10}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload as StatsDayData & { shortDate: string }
                return (
                  <div className="bg-[#1c1c20] border border-neutral-700/80 p-2.5 rounded-xl shadow-xl text-xs space-y-1">
                    <p className="font-semibold text-white">{item.shortDate}</p>
                    <p className="text-emerald-400 font-bold">
                      {item.calories} ккал
                    </p>
                    {targetCalories > 0 && (
                      <p className="text-neutral-400 text-[10px]">
                        Цель: {targetCalories} ккал ({Math.round((item.calories / targetCalories) * 100)}%)
                      </p>
                    )}
                  </div>
                )
              }
              return null
            }}
          />
          {targetCalories > 0 && (
            <ReferenceLine
              y={targetCalories}
              stroke="#10b981"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
            />
          )}
          <Bar
            dataKey="calories"
            radius={[6, 6, 2, 2]}
            maxBarSize={40}
          >
            {chartData.map((entry, index) => {
              const isOver = targetCalories > 0 && entry.calories > targetCalories * 1.15
              const isTargetMet = (entry as any).goal_achieved ?? (targetCalories > 0 && entry.calories >= targetCalories * 0.85 && entry.calories <= targetCalories * 1.15)
              const color = isOver ? '#f59e0b' : isTargetMet ? '#10b981' : '#34d399'
              return <Cell key={`cell-${index}`} fill={color} />
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
