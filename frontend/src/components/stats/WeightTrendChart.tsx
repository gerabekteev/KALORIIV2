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
      <div className="h-52 flex flex-col items-center justify-center text-xs text-[#7A7A82] gap-1">
        <span className="text-white font-medium">Нет записей веса</span>
        <span className="text-[11px] text-[#7A7A82]">
          Запишите вес в профиле, чтобы видеть динамику
        </span>
      </div>
    )
  }

  const sortedLogs = [...logs].sort((a, b) => {
    const dateA = a.log_date || a.date || ''
    const dateB = b.log_date || b.date || ''
    return new Date(dateA).getTime() - new Date(dateB).getTime()
  })

  const chartData = sortedLogs.map((item) => {
    const rawDate = item.log_date || item.date || ''
    const parts = rawDate.split('-').map(Number)
    const dateObj =
      parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(rawDate)
    return {
      ...item,
      shortDate: dateObj.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
      }),
    }
  })

  const weights = chartData.map((d) => d.weight_kg)
  if (targetWeight) weights.push(targetWeight)
  const minWeight = Math.floor(Math.min(...weights) - 2)
  const maxWeight = Math.ceil(Math.max(...weights) + 2)
  const lastIdx = chartData.length - 1

  return (
    <div className="w-full h-56 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 12, left: -22, bottom: 0 }}>
          <XAxis
            dataKey="shortDate"
            stroke="#7A7A82"
            fontSize={10}
            tickLine={false}
            axisLine={{ stroke: '#2A2A2F' }}
          />
          <YAxis
            domain={[minWeight, maxWeight]}
            stroke="#7A7A82"
            fontSize={10}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload as WeightLog & { shortDate: string }
                return (
                  <div className="bg-[#111113] border border-white/[0.12] p-2.5 rounded-2xl shadow-2xl text-xs space-y-1">
                    <p className="font-medium text-[#A1A1AA] my-0">{item.shortDate}</p>
                    <p className="font-ndot text-sm font-bold text-white my-0">
                      {item.weight_kg} кг
                    </p>
                    {targetWeight && (
                      <p className="font-ndot text-[#7A7A82] text-[10px] my-0">
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
              stroke="#FFFFFF"
              strokeOpacity={0.35}
              strokeDasharray="3 4"
              label={{
                value: `Цель ${targetWeight} кг`,
                fill: '#A1A1AA',
                fontSize: 10,
                position: 'insideBottomRight',
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="weight_kg"
            stroke="#FFFFFF"
            strokeWidth={2.2}
            dot={(props: any) => {
              const { cx, cy, index } = props
              if (cx === undefined || cy === undefined) return <g key={index} />
              const isLast = index === lastIdx
              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={isLast ? 4.5 : 3}
                  fill={isLast ? '#E02424' : '#FFFFFF'}
                  stroke="#1A1A1D"
                  strokeWidth={1.5}
                />
              )
            }}
            activeDot={{ r: 6, fill: '#E02424', stroke: '#FFFFFF', strokeWidth: 1.5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
