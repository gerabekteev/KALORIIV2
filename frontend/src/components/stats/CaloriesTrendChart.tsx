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
  const isAggregatedByMonth = (data?.length ?? 0) > 31

  const chartData = React.useMemo(() => {
    if (!data || data.length === 0) return []
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

  if (!data || data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-xs text-[#7A7A82]">
        Нет данных для тренда
      </div>
    )
  }

  return (
    <div className="w-full h-56 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id="calorieTrendNothing" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#FFFFFF" stopOpacity={0.22} />
              <stop offset="95%" stopColor="#FFFFFF" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="shortDate"
            stroke="#7A7A82"
            fontSize={10}
            tickLine={false}
            axisLine={{ stroke: '#2A2A2F' }}
          />
          <YAxis stroke="#7A7A82" fontSize={10} tickLine={false} axisLine={false} />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload as StatsDayData & { shortDate: string }
                return (
                  <div className="bg-[#111113] border border-white/[0.12] p-3 rounded-2xl shadow-2xl text-xs space-y-1">
                    <p className="font-medium text-[#A1A1AA] my-0">{item.shortDate}</p>
                    <p className="font-ndot text-sm font-bold text-white my-0">
                      {item.calories} ккал
                    </p>
                    <div className="font-ndot text-[10px] text-[#7A7A82] flex gap-2">
                      <span>Б {item.protein}</span>
                      <span>Ж {item.fat}</span>
                      <span>У {item.carbs}</span>
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
            stroke="#FFFFFF"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#calorieTrendNothing)"
            activeDot={{ r: 5, fill: '#E02424', stroke: '#FFFFFF', strokeWidth: 1.5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
