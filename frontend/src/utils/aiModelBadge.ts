import { Meal } from '../types'

export interface AIModelBadgeInfo {
  /** Short 3-7 char badge label, e.g. "G 3.8", "G 3.1L", "OR Auto" */
  shortLabel: string
  /** Clean full name of the model, e.g. "Gemini 3.8 Flash" */
  fullName: string
  /** Provider identifier, e.g. "gemini" | "openrouter" | "ai" */
  provider: 'gemini' | 'openrouter' | 'ai'
  /** Tooltip explanation for the user */
  tooltip: string
  /** Tailwind CSS styling classes */
  badgeStyle: string
  /** Dot/accent color class */
  accentColor: string
}

/**
 * Extracts raw model and provider information from a Meal object.
 * Checks meal.ai_model / meal.ai_provider first, then parses meal.ai_raw_response.
 */
export function extractMealAIInfo(meal: Meal): { provider?: string | null; model?: string | null } {
  if (meal.ai_model || meal.ai_provider) {
    return {
      provider: meal.ai_provider || null,
      model: meal.ai_model || null,
    }
  }

  const raw = meal.ai_raw_response
  if (!raw || typeof raw !== 'string') {
    return { provider: null, model: null }
  }

  const trimmed = raw.trim()

  // Format 1: "Model: gemini-3.8-flash"
  if (trimmed.startsWith('Model:')) {
    const mod = trimmed.replace(/^Model:\s*/, '').trim()
    const prov = mod.startsWith('gemini') ? 'gemini' : mod.includes('/') ? 'openrouter' : 'ai'
    return { provider: prov, model: mod }
  }

  // Format 2: JSON object
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const data = JSON.parse(trimmed)
      if (data && typeof data === 'object') {
        const mod = data.model || data.model_used || data.modelId
        const prov = data.provider || data.provider_used || data.providerType
        if (mod || prov) {
          return {
            provider: prov ? String(prov) : mod?.startsWith('gemini') ? 'gemini' : null,
            model: mod ? String(mod) : null,
          }
        }
      }
    } catch {
      // not valid JSON
    }
  }

  return { provider: null, model: null }
}

/**
 * Generates an informative, compact badge indicator for an AI-evaluated meal.
 * Returns null if the meal was entered completely manually without AI.
 */
export function getMealAIModelBadge(meal: Meal): AIModelBadgeInfo | null {
  const { provider: rawProvider, model: rawModel } = extractMealAIInfo(meal)

  // If no AI model or response is attached, it's a completely manual meal
  if (!rawModel && !rawProvider && !meal.ai_raw_response) {
    return null
  }

  const modelLower = (rawModel || '').toLowerCase().trim()
  const providerLower = (rawProvider || '').toLowerCase().trim()

  let shortLabel = 'AI'
  let fullName = rawModel || 'Нейросеть'
  let provider: 'gemini' | 'openrouter' | 'ai' = 'ai'

  // --- 1. Google Gemini Models ---
  if (providerLower === 'gemini' || modelLower.includes('gemini')) {
    provider = 'gemini'

    if (modelLower.includes('3.8-flash-lite')) {
      shortLabel = 'G 3.8L'
      fullName = 'Gemini 3.8 Flash-Lite'
    } else if (modelLower.includes('3.8')) {
      shortLabel = 'G 3.8'
      fullName = 'Gemini 3.8 Flash'
    } else if (modelLower.includes('3.7')) {
      shortLabel = 'G 3.7'
      fullName = 'Gemini 3.7 Flash'
    } else if (modelLower.includes('3.6')) {
      shortLabel = 'G 3.6'
      fullName = 'Gemini 3.6 Flash'
    } else if (modelLower.includes('3.5-flash-lite')) {
      shortLabel = 'G 3.5L'
      fullName = 'Gemini 3.5 Flash-Lite'
    } else if (modelLower.includes('3.5')) {
      shortLabel = 'G 3.5'
      fullName = 'Gemini 3.5 Flash'
    } else if (modelLower.includes('3.1-flash-lite') || modelLower.includes('3.1')) {
      shortLabel = 'G 3.1L'
      fullName = 'Gemini 3.1 Flash-Lite'
    } else if (modelLower.includes('2.5-pro')) {
      shortLabel = 'G 2.5P'
      fullName = 'Gemini 2.5 Pro'
    } else if (modelLower.includes('2.5-flash-lite')) {
      shortLabel = 'G 2.5L'
      fullName = 'Gemini 2.5 Flash-Lite'
    } else if (modelLower.includes('2.5')) {
      shortLabel = 'G 2.5'
      fullName = 'Gemini 2.5 Flash'
    } else if (modelLower.includes('2.0-flash-lite')) {
      shortLabel = 'G 2.0L'
      fullName = 'Gemini 2.0 Flash-Lite'
    } else if (modelLower.includes('2.0')) {
      shortLabel = 'G 2.0'
      fullName = 'Gemini 2.0 Flash'
    } else if (modelLower.includes('1.5-pro')) {
      shortLabel = 'G 1.5P'
      fullName = 'Gemini 1.5 Pro'
    } else if (modelLower.includes('1.5')) {
      shortLabel = 'G 1.5'
      fullName = 'Gemini 1.5 Flash'
    } else {
      // Dynamic fallback for any other Gemini version: e.g. gemini-3-flash -> G 3
      const verMatch = modelLower.match(/gemini-(\d+(?:\.\d+)?)/)
      if (verMatch) {
        shortLabel = `G ${verMatch[1]}`
        fullName = `Gemini ${verMatch[1]}`
      } else {
        shortLabel = 'Gemini'
        fullName = 'Google Gemini'
      }
    }
  }

  // --- 2. OpenRouter Models ---
  else if (providerLower === 'openrouter' || modelLower.includes('openrouter') || modelLower.includes('/')) {
    provider = 'openrouter'

    if (modelLower.includes('openrouter/auto') || modelLower.includes('openrouter-auto') || modelLower.includes('openrouter/free')) {
      shortLabel = 'OR Auto'
      fullName = 'OpenRouter Auto'
    } else if (modelLower.includes('gemma-4-31b')) {
      shortLabel = 'Gemma 4'
      fullName = 'Google Gemma 4 31B'
    } else if (modelLower.includes('gemma-4-26b') || modelLower.includes('gemma-4')) {
      shortLabel = 'Gemma 4'
      fullName = 'Google Gemma 4 26B'
    } else if (modelLower.includes('nemotron-3-nano-omni') || modelLower.includes('nemotron')) {
      shortLabel = 'NVIDIA'
      fullName = 'NVIDIA Nemotron Omni'
    } else if (modelLower.includes('qwen') || modelLower.includes('qwen2.5-vl')) {
      shortLabel = 'Qwen 2.5'
      fullName = 'Qwen 2.5 VL 72B'
    } else if (modelLower.includes('llama')) {
      shortLabel = 'Llama'
      fullName = 'Meta Llama Vision'
    } else {
      // Extract model segment after slash
      const parts = rawModel ? rawModel.split('/') : []
      const leaf = parts.length > 1 ? parts[1].replace(/:free$/, '') : rawModel || 'OpenRouter'
      shortLabel = leaf.slice(0, 8)
      fullName = rawModel || 'OpenRouter Model'
    }
  }

  // --- 3. Style and Tooltip Construction ---
  let badgeStyle = ''
  let accentColor = ''

  if (provider === 'gemini') {
    badgeStyle = 'bg-sky-500/10 text-sky-300 border-sky-500/30 hover:border-sky-400/50 hover:bg-sky-500/15'
    accentColor = 'bg-sky-400'
  } else if (provider === 'openrouter') {
    badgeStyle = 'bg-purple-500/10 text-purple-300 border-purple-500/30 hover:border-purple-400/50 hover:bg-purple-500/15'
    accentColor = 'bg-purple-400'
  } else {
    badgeStyle = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:border-emerald-400/50 hover:bg-emerald-500/15'
    accentColor = 'bg-emerald-400'
  }

  const editedClause = meal.is_manually_edited ? ' (затем скорректировано вручную)' : ''
  const tooltip = `Оценено нейросетью: ${fullName} [${provider.toUpperCase()}]${editedClause}`

  return {
    shortLabel,
    fullName,
    provider,
    tooltip,
    badgeStyle,
    accentColor,
  }
}
