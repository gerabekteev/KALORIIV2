import { describe, it, expect } from 'vitest'
import { getSlotForTime, SLOTS_CONFIG, getMealTimeMeta } from '../timeSlots'

describe('timeSlots utility (UX-03)', () => {
  it('has 4 correctly configured daily slots', () => {
    expect(SLOTS_CONFIG).toHaveLength(4)
    expect(SLOTS_CONFIG.map((s) => s.id)).toEqual(['breakfast', 'lunch', 'snack', 'dinner'])
  })

  it('correctly maps morning times to breakfast', () => {
    expect(getSlotForTime('05:00')).toBe('breakfast')
    expect(getSlotForTime('08:30:00')).toBe('breakfast')
    expect(getSlotForTime('11:29')).toBe('breakfast')
  })

  it('correctly maps midday times to lunch', () => {
    expect(getSlotForTime('11:30')).toBe('lunch')
    expect(getSlotForTime('13:45:10')).toBe('lunch')
    expect(getSlotForTime('16:29')).toBe('lunch')
  })

  it('correctly maps afternoon times to snack', () => {
    expect(getSlotForTime('16:30')).toBe('snack')
    expect(getSlotForTime('17:00:00')).toBe('snack')
    expect(getSlotForTime('18:29')).toBe('snack')
  })

  it('correctly maps evening and late night times to dinner', () => {
    expect(getSlotForTime('18:30')).toBe('dinner')
    expect(getSlotForTime('20:15:00')).toBe('dinner')
    expect(getSlotForTime('23:59')).toBe('dinner')
    expect(getSlotForTime('01:30')).toBe('dinner')
    expect(getSlotForTime('04:59')).toBe('dinner')
  })

  it('defaults to snack when time is missing or empty', () => {
    expect(getSlotForTime(undefined)).toBe('snack')
    expect(getSlotForTime('')).toBe('snack')
  })

  it('correctly returns icon and label metadata with getMealTimeMeta', () => {
    expect(getMealTimeMeta('08:00')).toEqual({ slot: 'breakfast', icon: '☀️', label: 'Завтрак' })
    expect(getMealTimeMeta('13:00', 500)).toEqual({ slot: 'lunch', icon: '🍲', label: 'Обед' })
    expect(getMealTimeMeta('13:00', 120)).toEqual({ slot: 'snack', icon: '🍏', label: 'Перекус' })
    expect(getMealTimeMeta('17:00')).toEqual({ slot: 'snack', icon: '🍏', label: 'Перекус' })
    expect(getMealTimeMeta('20:00')).toEqual({ slot: 'dinner', icon: '🪐', label: 'Ужин' })
  })
})
