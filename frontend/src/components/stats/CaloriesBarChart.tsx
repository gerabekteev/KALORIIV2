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

  // If dataset has more than 31 days (e.g. 365 days / Year view), aggregate into months
  const isAggregatedByMonth = data.length > 31

  const chartData = React.useMemo(() => {
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

    // Group by YYYY-MM
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
                const item = payload[0].payload as any
                return (
                  <div className="bg-[#1c1c20] border border-neutral-700/80 p-2.5 rounded-xl shadow-xl text-xs space-y-1">
                    <p className="font-semibold text-white">
                      {item.shortDate} {item.isMonthAverage ? '(среднее в день)' : ''}
                    </p>
                    <p className="text-emerald-400 font-bold">
                      {item.calories} ккал{item.isMonthAverage ? ' / день' : ''}
                    </p>
                    {Boolean(item.monthTotal) && (
                      <p className="text-neutral-400 text-[10px]">
                        Всего за месяц: {item.monthTotal.toLocaleString('ru-RU')} ккал
                      </p>
                    )}
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
