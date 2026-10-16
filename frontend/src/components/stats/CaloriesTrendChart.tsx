import React from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'
import { StatsDayData } from '../../types'

interface CaloriesTrendChartProps {
  data: StatsDayData[]
}

export const CaloriesTrendChart: React.FC<CaloriesTrendChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-xs text-neutral-500">
        Нет данных для тренда
      </div>
    )
  }

  const isAggregatedByMonth = data.length > 31

  const chartData = React.useMemo(() => {
    if (!isAggregatedByMonth) {
      return data.map((d) => {
        const parts = d.date.split('-').map(Number)
        const dateObj =
          parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(d.date)
        return {
          ...d,
          shortDate: dateObj.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'short',
          }),
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
      }
    })
  }, [data, isAggregatedByMonth])

  return (
    <div className="w-full h-56 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="calorieTrend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
            </linearGradient>
          </defs>
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
                    <div className="text-[10px] text-neutral-400 flex gap-2">
                      <span>Б: {item.protein}г</span>
                      <span>Ж: {item.fat}г</span>
                      <span>У: {item.carbs}г</span>
                    </div>
                  </div>
                )
              }
              return null
            }}
          />
          <Area
            type="monotone"
            dataKey="calories"
            stroke="#10b981"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#calorieTrend)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
