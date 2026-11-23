import React, { useState, useEffect } from 'react'
import {
  Cpu,
  CheckCircle2,
  Zap,
  XCircle,
  ChevronUp,
  ChevronDown,
  Save,
  RotateCcw,
} from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { ConfirmModal } from '../ui/ConfirmModal'
import { useUIStore } from '../../store/uiStore'
import { profileApi, AIModelItem } from '../../api/profile'

export type { AIModelItem }

export interface AISettingsCardProps {
  embedded?: boolean
}

export const DEFAULT_AI_MODELS: AIModelItem[] = [
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite (500 RPD)',
    provider: 'gemini',
    description: 'Лимит 500 запросов/день, 15 RPM. Быстрый и надёжный',
    enabled: true,
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    provider: 'gemini',
    description: 'Высокая точность и детализация блюд',
    enabled: true,
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    provider: 'gemini',
    description: 'Стабильная мультимодальная модель',
    enabled: true,
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    provider: 'gemini',
    description: 'Максимальный reasoning и точность (20 RPD)',
    enabled: true,
  },
  {
    id: 'openrouter/auto',
    name: 'OpenRouter Auto',
    provider: 'openrouter',
    description: 'Умный авто-выбор лучшей доступной модели',
    enabled: true,
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    name: 'Gemma 4 26B (Free)',
    provider: 'openrouter',
    description: 'Мощная визуальная модель от Google',
    enabled: true,
  },
  {
    id: 'google/gemma-4-31b-it:free',
    name: 'Gemma 4 31B (Free)',
    provider: 'openrouter',
    description: 'Продвинутая мультимодальная модель Google',
    enabled: true,
  },
  {
    id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    name: 'NVIDIA Omni (Free)',
    provider: 'openrouter',
    description: 'Reasoning VLM от NVIDIA с поддержкой vision',
    enabled: true,
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    provider: 'gemini',
    description: 'Сбалансированный анализ и высокая скорость (20 RPD)',
    enabled: true,
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    provider: 'gemini',
    description: 'Экономичный и ультрабыстрый отклик',
    enabled: true,
  },
]

const STORAGE_KEY = 'kalorii_ai_settings'

function loadSavedSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      let initialModels = DEFAULT_AI_MODELS
      if (Array.isArray(parsed.models) && parsed.models.length > 0) {
        // Map old legacy model IDs if any
        const mappedExisting = parsed.models.map((m: any) => {
          if (m.id === 'openrouter-free') {
            return {
              ...m,
              id: 'openrouter/auto',
              name: 'OpenRouter Auto',
              description: 'Умный авто-выбор лучшей доступной модели',
            }
          }
          return m
        })
        const existingIds = new Set(mappedExisting.map((m: any) => m.id))
        const missingDefaults = DEFAULT_AI_MODELS.filter(
          (m) => !existingIds.has(m.id)
        )
        initialModels = [...mappedExisting, ...missingDefaults]
      }
      return {
        models: initialModels,
        geminiKey: parsed.geminiApiKey || parsed.gemini_api_key || '',
        openrouterKey: parsed.openrouterApiKey || parsed.openrouter_api_key || '',
      }
    }
  } catch {
    // ignore
  }
  return {
    models: DEFAULT_AI_MODELS,
    geminiKey: '',
    openrouterKey: '',
  }
}

export const AISettingsCard: React.FC<AISettingsCardProps> = ({ embedded = false }) => {
  const { addToast } = useUIStore()

  const [savedConfig] = useState(loadSavedSettings)
  const [models, setModels] = useState<AIModelItem[]>(savedConfig.models)
  const [geminiKey, setGeminiKey] = useState(savedConfig.geminiKey)
  const [openrouterKey, setOpenrouterKey] = useState(savedConfig.openrouterKey)
  const [isSaving, setIsSaving] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)

  // 1. Initial mounting: fast load from localStorage done, now fetch from backend
  useEffect(() => {
    let isMounted = true

    async function loadServerSettings() {
      try {
        const serverData = await profileApi.getAISettings()
        if (!isMounted) return

        if (serverData && Array.isArray(serverData.models) && serverData.models.length > 0) {
          // Map legacy model IDs if any
          const mappedServerModels = serverData.models.map((m) => {
            if (m.id === 'openrouter-free') {
              return {
                ...m,
                id: 'openrouter/auto',
                name: 'OpenRouter Auto',
                description: 'Умный авто-выбор лучшей доступной модели',
              }
            }
            return m
          })

          const existingIds = new Set(mappedServerModels.map((m) => m.id))
          const missingDefaults = DEFAULT_AI_MODELS.filter((m) => !existingIds.has(m.id))
          const resolvedModels = [...mappedServerModels, ...missingDefaults]

          setModels(resolvedModels)

          const sGemini = serverData.geminiApiKey ?? serverData.gemini_api_key
          const sOpenrouter = serverData.openrouterApiKey ?? serverData.openrouter_api_key

          if (sGemini !== undefined && sGemini !== null) {
            setGeminiKey(sGemini)
          }
          if (sOpenrouter !== undefined && sOpenrouter !== null) {
            setOpenrouterKey(sOpenrouter)
          }

          // Cache server settings into localStorage
          try {
            const cachePayload = {
              models: resolvedModels,
              geminiApiKey: (sGemini !== undefined && sGemini !== null ? sGemini : geminiKey).trim() || undefined,
              openrouterApiKey: (sOpenrouter !== undefined && sOpenrouter !== null ? sOpenrouter : openrouterKey).trim() || undefined,
              updatedAt: serverData.updatedAt || serverData.updated_at || new Date().toISOString(),
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cachePayload))
          } catch (e) {
            console.error('Failed to cache server AI settings to localStorage', e)
          }
        }
      } catch (err) {
        // Fallback silently to localStorage already loaded in initial state
        console.warn('Could not load AI settings from server:', err)
      }
    }

    loadServerSettings()

    return () => {
      isMounted = false
    }
  }, [])

  // Auto-persistence function: localStorage immediately + async PUT to backend
  const persistSettings = async (
    newModels: AIModelItem[],
    newGeminiKey: string,
    newOpenrouterKey: string
  ): Promise<void> => {
    const trimmedGemini = newGeminiKey.trim()
    const trimmedOpenrouter = newOpenrouterKey.trim()

    // 1. Instantly save to localStorage (key 'kalorii_ai_settings')
    try {
      const payload = {
        models: newModels,
        geminiApiKey: trimmedGemini || undefined,
        openrouterApiKey: trimmedOpenrouter || undefined,
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch (e) {
      console.error('Failed to save AI settings to localStorage', e)
    }

    // 2. Send PUT /api/profile/ai-settings to backend
    try {
      await profileApi.updateAISettings({
        models: newModels,
        gemini_api_key: trimmedGemini || null,
        openrouter_api_key: trimmedOpenrouter || null,
        geminiApiKey: trimmedGemini || null,
        openrouterApiKey: trimmedOpenrouter || null,
      })
    } catch (err) {
      console.warn('Backend AI settings update skipped or failed:', err)
    }
  }

  // Toggle model enable/disable with immediate auto-persistence
  const handleToggle = (id: string) => {
    const nextModels = models.map((m) =>
      m.id === id ? { ...m, enabled: !m.enabled } : m
    )
    setModels(nextModels)
    persistSettings(nextModels, geminiKey, openrouterKey)
  }

  // Move model up with immediate auto-persistence
  const handleMoveUp = (index: number) => {
    if (index <= 0) return
    const nextModels = [...models]
    const temp = nextModels[index - 1]
    nextModels[index - 1] = nextModels[index]
    nextModels[index] = temp
    setModels(nextModels)
    persistSettings(nextModels, geminiKey, openrouterKey)
  }

  // Move model down with immediate auto-persistence
  const handleMoveDown = (index: number) => {
    if (index >= models.length - 1) return
    const nextModels = [...models]
    const temp = nextModels[index + 1]
    nextModels[index + 1] = nextModels[index]
    nextModels[index] = temp
    setModels(nextModels)
    persistSettings(nextModels, geminiKey, openrouterKey)
  }

  // Save settings explicitly via button
  const handleSave = async () => {
    setIsSaving(true)
    try {
      await persistSettings(models, geminiKey, openrouterKey)
      addToast('Настройки AI сохранены в профиле!', 'success')
    } catch {
      addToast('Ошибка сохранения настроек AI', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // Reset to defaults and sync with backend (preserving custom API keys)
  const handleReset = async () => {
    setModels(DEFAULT_AI_MODELS)
    await persistSettings(DEFAULT_AI_MODELS, geminiKey, openrouterKey)
    addToast('Настройки AI сброшены к стандартным', 'info')
  }

  // Compute status badge for model
  const enabledModels = models.filter((m) => m.enabled)
  const activeModelId = enabledModels[0]?.id

  const content = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-white" />
          <h3 className="text-sm font-semibold text-white my-0">Приоритет AI-моделей</h3>
        </div>
        <button
          type="button"
          onClick={() => setShowResetModal(true)}
          className="text-[11px] text-[#7A7A82] hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
          title="Сбросить порядок по умолчанию"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Сбросить</span>
        </button>
      </div>

      <ConfirmModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onConfirm={handleReset}
        title="Сбросить настройки AI?"
        description="Порядок моделей вернётся к рекомендованным значениям по умолчанию."
        confirmText="Сбросить"
        cancelText="Отмена"
        isDangerous
      />

      <p className="text-xs text-[#7A7A82] leading-relaxed my-0">
        Первая активная модель выполняет анализ, остальные работают как автоматический резерв.
      </p>

      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
        {models.map((model, index) => {
          const isFirstActive = model.enabled && model.id === activeModelId

          return (
            <div
              key={model.id}
              className={`flex items-center justify-between p-2.5 rounded-[16px] transition-colors ${
                !model.enabled
                  ? 'bg-[#111113] opacity-50'
                  : isFirstActive
                  ? 'bg-[#111113] ring-1 ring-white/25'
                  : 'bg-[#111113] hover:bg-[#222226]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <input
                  type="checkbox"
                  checked={model.enabled}
                  onChange={() => handleToggle(model.id)}
                  className="w-4 h-4 accent-[#E02424] rounded cursor-pointer shrink-0"
                  title={model.enabled ? 'Отключить модель' : 'Включить модель'}
                />

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => handleMoveUp(index)}
                    className="w-7 h-7 rounded-full bg-[#222226] hover:bg-[#2F2F36] text-white disabled:opacity-20 transition-colors cursor-pointer flex items-center justify-center active:scale-95"
                    title="Выше"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={index === models.length - 1}
                    onClick={() => handleMoveDown(index)}
                    className="w-7 h-7 rounded-full bg-[#222226] hover:bg-[#2F2F36] text-white disabled:opacity-20 transition-colors cursor-pointer flex items-center justify-center active:scale-95"
                    title="Ниже"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                <span className="font-ndot text-xs font-bold text-[#7A7A82] w-4 text-center shrink-0">
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium text-white truncate">
                      {model.name}
                    </span>
                    <span className="font-ndot text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase bg-[#222226] text-[#A1A1AA]">
                      {model.provider}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#7A7A82] truncate mt-0.5 my-0">
                    {model.description}
                  </p>
                </div>
              </div>

              <div className="shrink-0 ml-2">
                {!model.enabled ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#6E6E75]">
                    <XCircle className="w-3 h-3" />
                    <span>Откл.</span>
                  </span>
                ) : isFirstActive ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-black bg-white px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Основная</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#A1A1AA] bg-[#222226] px-2 py-0.5 rounded-full">
                    <Zap className="w-2.5 h-2.5" />
                    <span>Резерв</span>
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Button
        type="button"
        size="md"
        className="w-full"
        onClick={handleSave}
        isLoading={isSaving}
        leftIcon={<Save className="w-3.5 h-3.5" />}
      >
        Сохранить настройки AI
      </Button>
    </div>
  )

  if (embedded) {
    return content
  }

  return (
    <Card variant="default" padding="md" className="space-y-4">
      {content}
    </Card>
  )
}
