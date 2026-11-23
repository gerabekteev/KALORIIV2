import { useState, useEffect, useRef, useCallback } from 'react'
import { StatsResponse, WeightLog } from '../types'
import { statsApi } from '../api/stats'
import { PeriodType } from '../components/stats/PeriodSelector'

export const useStats = (initialPeriod: PeriodType = 'month') => {
  const [period, setPeriod] = useState<PeriodType>(initialPeriod)
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [statsPeriod, setStatsPeriod] = useState<PeriodType>(initialPeriod)
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const cacheRef = useRef<Partial<Record<PeriodType, StatsResponse>>>({})

  const fetchStats = useCallback(
    async (targetPeriod?: PeriodType) => {
      const currentPeriod = targetPeriod || period
      const requestId = ++requestIdRef.current
      const cached = cacheRef.current[currentPeriod]

      // If cached, deliver immediately so the pixel-wave transition starts without waiting
      if (cached) {
        setStats(cached)
        setStatsPeriod(currentPeriod)
        setIsLoading(false)
      } else {
        setIsLoading(true)
      }
      setError(null)

      try {
        const [statsData, weightsData] = await Promise.all([
          statsApi.getStats(currentPeriod),
          statsApi.getWeightLogs(),
        ])
        if (requestId !== requestIdRef.current) return
        cacheRef.current[currentPeriod] = statsData
        setStats(statsData)
        setStatsPeriod(currentPeriod)
        setWeightLogs(weightsData || [])
        setIsLoading(false)
      } catch (err: any) {
        if (requestId !== requestIdRef.current) return
        setError(err.message || 'Ошибка загрузки статистики')
        setIsLoading(false)
      }
    },
    [period]
  )

  useEffect(() => {
    fetchStats(period)
  }, [period, fetchStats])

  return {
    period,
    setPeriod,
    stats,
    statsPeriod,
    weightLogs,
    isLoading,
    error,
    refetch: fetchStats,
  }
}
