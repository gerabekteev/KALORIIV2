import { useState, useEffect, useRef } from 'react'
import { StatsResponse, WeightLog } from '../types'
import { statsApi } from '../api/stats'
import { PeriodType } from '../components/stats/PeriodSelector'

export const useStats = (initialPeriod: PeriodType = 'week') => {
  const [period, setPeriod] = useState<PeriodType>(initialPeriod)
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const fetchStats = async (targetPeriod?: PeriodType) => {
    const currentPeriod = targetPeriod || period
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)
    try {
      const [statsData, weightsData] = await Promise.all([
        statsApi.getStats(currentPeriod),
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
    fetchStats(period)
  }, [period])

  return {
    period,
    setPeriod,
    stats,
    weightLogs,
    isLoading,
    error,
    refetch: fetchStats,
  }
}
