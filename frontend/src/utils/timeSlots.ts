export interface SlotConfig {
  id: 'breakfast' | 'lunch' | 'snack' | 'dinner'
  title: string
  icon: string
  timeRange: string
  presetTime: string
}

export const SLOTS_CONFIG: SlotConfig[] = [
  {
    id: 'breakfast',
    title: 'Завтрак',
    icon: '☀️',
    timeRange: '05:00 – 11:29',
    presetTime: '09:00',
  },
  {
    id: 'lunch',
    title: 'Обед',
    icon: '🍲',
    timeRange: '11:30 – 16:29',
    presetTime: '13:30',
  },
  {
    id: 'snack',
    title: 'Перекус',
    icon: '🍏',
    timeRange: '16:30 – 18:29',
    presetTime: '17:00',
  },
  {
    id: 'dinner',
    title: 'Ужин',
    icon: '🌙',
    timeRange: '18:30 – 04:59',
    presetTime: '19:30',
  },
]

export function getSlotForTime(timeStr?: string): 'breakfast' | 'lunch' | 'snack' | 'dinner' {
  if (!timeStr) return 'snack'
  const t = timeStr.slice(0, 5)
  if (t >= '05:00' && t <= '11:29') return 'breakfast'
  if (t >= '11:30' && t <= '16:29') return 'lunch'
  if (t >= '16:30' && t <= '18:29') return 'snack'
  return 'dinner'
}
