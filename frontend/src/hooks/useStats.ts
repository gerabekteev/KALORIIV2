import { useState, useEffect, useRef } from 'react'
import { StatsResponse, WeightLog } from '../types'
import { statsApi } from '../api/stats'
import { PeriodType } from '../components/stats/PeriodSelector'

export const useStats = (
  initialPeriod: PeriodType = 'week',
  initialStartDate?: string,
  initialEndDate?: string
) => {
  const [period, setPeriod] = useState<PeriodType>(initialPeriod)
  const [customStartDate, setCustomStartDate] = useState<string>(initialStartDate || '')
  const [customEndDate, setCustomEndDate] = useState<string>(initialEndDate || '')
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const fetchStats = async (
    targetPeriod?: PeriodType,
    startDate?: string,
    endDate?: string
  ) => {
    const currentPeriod = targetPeriod || period
    const start = startDate !== undefined ? startDate : customStartDate
    const end = endDate !== undefined ? endDate : customEndDate
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)
    try {
      const [statsData, weightsData] = await Promise.all([
        statsApi.getStats(currentPeriod, start || undefined, end || undefined),
        statsApi.getWeightLogs(),
      ])
      if (requestId !== requestIdRef.current) return
      setStats(statsData)
      setWeightLogs(weightsData || [])
      setIsLoading(false)
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return
      setError(err.message || 'Ошибка загрузки статистики')
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStats(period, customStartDate, customEndDate)
  }, [period, customStartDate, customEndDate])

  return {
    period,
    setPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    stats,
    weightLogs,
    isLoading,
    error,
    refetch: fetchStats,
  }
}
