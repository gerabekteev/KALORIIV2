import { describe, it, expect } from 'vitest'
import { pluralizeRu } from '../pluralize'

describe('pluralizeRu', () => {
  const dayForms: [string, string, string] = ['день', 'дня', 'дней']
  const recordForms: [string, string, string] = ['запись', 'записи', 'записей']
  const calorieForms: [string, string, string] = ['калория', 'калории', 'калорий']

  it('correctly handles 1 (nominative singular)', () => {
    expect(pluralizeRu(1, dayForms)).toBe('день')
    expect(pluralizeRu(1, recordForms)).toBe('запись')
    expect(pluralizeRu(1, calorieForms)).toBe('калория')
    expect(pluralizeRu(21, dayForms)).toBe('день')
    expect(pluralizeRu(101, dayForms)).toBe('день')
  })

  it('correctly handles 2, 3, 4 (genitive singular)', () => {
    expect(pluralizeRu(2, dayForms)).toBe('дня')
    expect(pluralizeRu(3, dayForms)).toBe('дня')
    expect(pluralizeRu(4, dayForms)).toBe('дня')
    expect(pluralizeRu(22, recordForms)).toBe('записи')
    expect(pluralizeRu(103, calorieForms)).toBe('калории')
  })

  it('correctly handles 5-20 and 0 (genitive plural)', () => {
    expect(pluralizeRu(0, dayForms)).toBe('дней')
    expect(pluralizeRu(5, dayForms)).toBe('дней')
    expect(pluralizeRu(10, dayForms)).toBe('дней')
    expect(pluralizeRu(11, dayForms)).toBe('дней')
    expect(pluralizeRu(12, dayForms)).toBe('дней')
    expect(pluralizeRu(14, dayForms)).toBe('дней')
    expect(pluralizeRu(19, dayForms)).toBe('дней')
    expect(pluralizeRu(20, dayForms)).toBe('дней')
    expect(pluralizeRu(111, dayForms)).toBe('дней')
    expect(pluralizeRu(114, dayForms)).toBe('дней')
  })

  it('handles negative and floating point values safely', () => {
    expect(pluralizeRu(-1, dayForms)).toBe('день')
    expect(pluralizeRu(-4, dayForms)).toBe('дня')
    expect(pluralizeRu(2.7, dayForms)).toBe('дня')
    expect(pluralizeRu(5.9, dayForms)).toBe('дней')
  })
})
