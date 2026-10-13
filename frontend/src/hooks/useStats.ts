import { useState, useEffect } from 'react'
import { StatsResponse, WeightLog } from '../types'
import { statsApi } from '../api/stats'
import { PeriodType } from '../components/stats/PeriodSelector'

export const useStats = (initialPeriod: PeriodType = 'week') => {
  const [period, setPeriod] = useState<PeriodType>(initialPeriod)
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [statsData, weightsData] = await Promise.all([
        statsApi.getStats(period),
        statsApi.getWeightLogs(),
      ])
      setStats(statsData)
      setWeightLogs(weightsData || [])
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки статистики')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
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
