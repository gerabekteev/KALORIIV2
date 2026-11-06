import { describe, it, expect } from 'vitest'
import { getMealAIModelBadge, extractMealAIInfo } from '../aiModelBadge'
import { Meal } from '../../types'

describe('aiModelBadge utility', () => {
  const baseMeal: Meal = {
    id: 1,
    name: 'Овсяная каша',
    calories: 320,
    protein: 12,
    fat: 6,
    carbs: 55,
    meal_date: '2026-11-06',
    meal_time: '09:00',
  }

  it('returns null for completely manual meal', () => {
    const badge = getMealAIModelBadge(baseMeal)
    expect(badge).toBeNull()
  })

  it('correctly formats Gemini 3.8 Flash model', () => {
    const meal: Meal = {
      ...baseMeal,
      ai_provider: 'gemini',
      ai_model: 'gemini-3.8-flash',
    }
    const badge = getMealAIModelBadge(meal)
    expect(badge).not.toBeNull()
    expect(badge?.shortLabel).toBe('G 3.8')
    expect(badge?.fullName).toBe('Gemini 3.8 Flash')
    expect(badge?.provider).toBe('gemini')
    expect(badge?.badgeStyle).toContain('sky')
  })

  it('correctly formats Gemini 3.1 Flash-Lite model', () => {
    const meal: Meal = {
      ...baseMeal,
      ai_provider: 'gemini',
      ai_model: 'gemini-3.1-flash-lite',
    }
    const badge = getMealAIModelBadge(meal)
    expect(badge?.shortLabel).toBe('G 3.1L')
    expect(badge?.fullName).toBe('Gemini 3.1 Flash-Lite')
    expect(badge?.provider).toBe('gemini')
  })

  it('correctly formats OpenRouter Auto and Gemma models', () => {
    const autoMeal: Meal = {
      ...baseMeal,
      ai_provider: 'openrouter',
      ai_model: 'openrouter/auto',
    }
    const badgeAuto = getMealAIModelBadge(autoMeal)
    expect(badgeAuto?.shortLabel).toBe('OR Auto')
    expect(badgeAuto?.provider).toBe('openrouter')
    expect(badgeAuto?.badgeStyle).toContain('purple')

    const gemmaMeal: Meal = {
      ...baseMeal,
      ai_provider: 'openrouter',
      ai_model: 'google/gemma-4-26b-a4b-it:free',
    }
    const badgeGemma = getMealAIModelBadge(gemmaMeal)
    expect(badgeGemma?.shortLabel).toBe('Gemma 4')
  })

  it('falls back to parsing legacy ai_raw_response if columns are empty', () => {
    const legacyJsonMeal: Meal = {
      ...baseMeal,
      ai_raw_response: JSON.stringify({
        provider: 'gemini',
        model: 'gemini-3.7-flash',
      }),
    }
    const badgeJson = getMealAIModelBadge(legacyJsonMeal)
    expect(badgeJson?.shortLabel).toBe('G 3.7')
    expect(badgeJson?.fullName).toBe('Gemini 3.7 Flash')

    const legacyStringMeal: Meal = {
      ...baseMeal,
      ai_raw_response: 'Model: gemini-3.5-flash',
    }
    const badgeString = getMealAIModelBadge(legacyStringMeal)
    expect(badgeString?.shortLabel).toBe('G 3.5')
  })

  it('adds manual edit note to tooltip if meal was edited', () => {
    const editedMeal: Meal = {
      ...baseMeal,
      ai_provider: 'gemini',
      ai_model: 'gemini-3.8-flash',
      is_manually_edited: true,
    }
    const badge = getMealAIModelBadge(editedMeal)
    expect(badge?.tooltip).toContain('скорректировано вручную')
  })
})
