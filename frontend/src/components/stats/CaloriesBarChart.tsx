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
  const isAggregatedByMonth = (data?.length ?? 0) > 31

  const chartData = React.useMemo(() => {
    if (!data || data.length === 0) return []
    if (!isAggregatedByMonth) {
      return data.map((d) => {
        const parts = d.date.split('-').map(Number)
        const dateObj =
          parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(d.date)
        const formattedDate = dateObj.toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'short',
        })
        return {
          ...d,
          shortDate: formattedDate,
          isMonthAverage: false,
          monthTotal: 0,
        }
      })
    }

    const monthsMap = new Map<
      string,
      { totalCal: number; totalProt: number; totalFat: number; totalCarbs: number; count: number; dateObj: Date }
    >()
    data.forEach((d) => {
      const parts = d.date.split('-').map(Number)
      const dateObj =
        parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(d.date)
      const key = `${dateObj.getFullYear()}-${dateObj.getMonth()}`
      const existing = monthsMap.get(key)
      if (existing) {
        existing.totalCal += d.calories
        existing.totalProt += d.protein
        existing.totalFat += d.fat
        existing.totalCarbs += d.carbs
        existing.count += 1
      } else {
        monthsMap.set(key, {
          totalCal: d.calories,
          totalProt: d.protein,
          totalFat: d.fat,
          totalCarbs: d.carbs,
          count: 1,
          dateObj,
        })
      }
    })

    return Array.from(monthsMap.values()).map((m) => {
      const avgCal = Math.round(m.totalCal / m.count)
      const formattedMonth = m.dateObj.toLocaleDateString('ru-RU', { month: 'short' })
      return {
        date: m.dateObj.toISOString().slice(0, 7),
        calories: avgCal,
        protein: Math.round((m.totalProt / m.count) * 10) / 10,
        fat: Math.round((m.totalFat / m.count) * 10) / 10,
        carbs: Math.round((m.totalCarbs / m.count) * 10) / 10,
        shortDate: formattedMonth,
        isMonthAverage: true,
        monthTotal: Math.round(m.totalCal),
      }
    })
  }, [data, isAggregatedByMonth])

  if (!data || data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-xs text-[#7A7A82]">
        Нет данных за выбранный период
      </div>
    )
  }

  return (
    <div className="w-full h-56 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}>
          <XAxis
            dataKey="shortDate"
            stroke="#7A7A82"
            fontSize={10}
            tickLine={false}
            axisLine={{ stroke: '#2A2A2F' }}
          />
          <YAxis
            stroke="#7A7A82"
            fontSize={10}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload as any
                const isOver = targetCalories > 0 && item.calories > targetCalories * 1.1
                return (
                  <div className="bg-[#111113] border border-white/[0.12] p-3 rounded-2xl shadow-2xl text-xs space-y-1">
                    <p className="font-medium text-[#A1A1AA] my-0">
                      {item.shortDate} {item.isMonthAverage ? '(ср./день)' : ''}
                    </p>
                    <p
                      className={`font-ndot text-sm font-bold my-0 ${
                        isOver ? 'text-[#E02424]' : 'text-white'
                      }`}
                    >
                      {item.calories} ккал
                    </p>
                    {Boolean(item.monthTotal) && (
                      <p className="text-[#7A7A82] text-[10px] my-0">
                        Месяц: {item.monthTotal.toLocaleString('ru-RU')} ккал
                      </p>
                    )}
                    {targetCalories > 0 && (
                      <p className="font-ndot text-[#7A7A82] text-[10px] my-0">
                        Цель {targetCalories} ({Math.round((item.calories / targetCalories) * 100)}%)
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
              stroke="#FFFFFF"
              strokeDasharray="3 4"
              strokeOpacity={0.35}
            />
          )}
          <Bar
            dataKey="calories"
            radius={[99, 99, 99, 99]}
            maxBarSize={chartData.length > 14 ? 10 : 18}
          >
            {chartData.map((entry, index) => {
              const isOver = targetCalories > 0 && entry.calories > targetCalories * 1.1
              const isTargetMet =
                targetCalories > 0 &&
                entry.calories >= targetCalories * 0.85 &&
                entry.calories <= targetCalories * 1.1
              const isLatest = index === chartData.length - 1
              // Strict Nothing X Pulse Bar Colors
              const color = isOver
                ? '#E02424'
                : isTargetMet
                ? '#FFFFFF'
                : isLatest
                ? '#D4D4D8'
                : '#52525B'
              return <Cell key={`cell-${index}`} fill={color} />
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
