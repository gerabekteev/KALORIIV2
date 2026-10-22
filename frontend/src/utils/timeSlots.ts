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
    icon: 'sunrise',
    timeRange: '05:00 – 11:29',
    presetTime: '09:00',
  },
  {
    id: 'lunch',
    title: 'Обед',
    icon: 'sun',
    timeRange: '11:30 – 16:29',
    presetTime: '13:30',
  },
  {
    id: 'snack',
    title: 'Перекус',
    icon: 'coffee',
    timeRange: '16:30 – 18:29',
    presetTime: '17:00',
  },
  {
    id: 'dinner',
    title: 'Ужин',
    icon: 'moon',
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

export interface MealTimeMeta {
  slot: 'breakfast' | 'lunch' | 'snack' | 'dinner'
  icon: string
  label: string
}

export function getMealTimeMeta(timeStr?: string, calories?: number): MealTimeMeta {
  const slot = getSlotForTime(timeStr)

  // Under small meal volume (<= 160 kcal) during daytime, classify as snack icon
  if (calories !== undefined && calories > 0 && calories <= 160 && slot === 'lunch') {
    return {
      slot: 'snack',
      icon: 'coffee',
      label: 'Перекус',
    }
  }

  switch (slot) {
    case 'breakfast':
      return {
        slot: 'breakfast',
        icon: 'sunrise',
        label: 'Завтрак',
      }
    case 'lunch':
      return {
        slot: 'lunch',
        icon: 'sun',
        label: 'Обед',
      }
    case 'snack':
      return {
        slot: 'snack',
        icon: 'coffee',
        label: 'Перекус',
      }
    case 'dinner':
      return {
        slot: 'dinner',
        icon: 'moon',
        label: 'Ужин',
      }
  }
}

