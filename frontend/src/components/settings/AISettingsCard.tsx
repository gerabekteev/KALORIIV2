import React, { useState, useEffect } from 'react'
import {
  Cpu,
  CheckCircle2,
  Zap,
  XCircle,
  ChevronUp,
  ChevronDown,
  Key,
  Eye,
  EyeOff,
  Save,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { ConfirmModal } from '../ui/ConfirmModal'
import { useUIStore } from '../../store/uiStore'
import { profileApi, AIModelItem } from '../../api/profile'

export type { AIModelItem }

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

export const AISettingsCard: React.FC = () => {
  const { addToast } = useUIStore()

  const [savedConfig] = useState(loadSavedSettings)
  const [models, setModels] = useState<AIModelItem[]>(savedConfig.models)
  const [geminiKey, setGeminiKey] = useState(savedConfig.geminiKey)
  const [openrouterKey, setOpenrouterKey] = useState(savedConfig.openrouterKey)
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [showOpenrouterKey, setShowOpenrouterKey] = useState(false)
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

  // Reset to defaults and sync with backend
  const handleReset = async () => {
    setModels(DEFAULT_AI_MODELS)
    setGeminiKey('')
    setOpenrouterKey('')
    await persistSettings(DEFAULT_AI_MODELS, '', '')
    addToast('Настройки AI сброшены к стандартным', 'info')
  }

  // Compute status badge for model
  const enabledModels = models.filter((m) => m.enabled)
  const activeModelId = enabledModels[0]?.id

  return (
    <Card variant="default" padding="md" className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white my-0">
            Настройки AI моделей
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setShowResetModal(true)}
          className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
          title="Сбросить порядок по умолчанию"
        >
          <RotateCcw className="w-3 h-3" />
          <span>По умолчанию</span>
        </button>
      </div>

      <ConfirmModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onConfirm={handleReset}
        title="Сбросить настройки AI?"
        description="Порядок моделей и ключи будут возвращены к рекомендованным настройкам по умолчанию."
        confirmText="Сбросить"
        cancelText="Отмена"
        isDangerous
      />

      <p className="text-xs text-neutral-400 leading-relaxed">
        Управляйте цепочкой fallback-распознавания блюд. Приоритет определяется
        порядком в списке: первая активная модель выполняет анализ, последующие
        служат автоматическим резервом.
      </p>

      {/* Models Priority List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1 font-medium">
          <span>Порядок приоритета (вверх/вниз)</span>
          <span>Статус</span>
        </div>

        <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
          {models.map((model, index) => {
            const isFirstActive = model.enabled && model.id === activeModelId

            return (
              <div
                key={model.id}
                className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                  !model.enabled
                    ? 'bg-[#141416]/60 border-neutral-800/50 opacity-60'
                    : isFirstActive
                    ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                    : 'bg-[#18181c] border-neutral-800/80 hover:border-neutral-700'
                }`}
              >
                {/* Left: Checkbox + Reorder + Info */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {/* Enabled Checkbox */}
                  <input
                    type="checkbox"
                    checked={model.enabled}
                    onChange={() => handleToggle(model.id)}
                    className="w-4 h-4 accent-emerald-500 rounded cursor-pointer shrink-0"
                    title={model.enabled ? 'Отключить модель' : 'Включить модель'}
                  />

                  {/* Reorder Buttons */}
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMoveUp(index)}
                      className="text-neutral-500 hover:text-white disabled:opacity-20 transition-colors cursor-pointer p-0.5"
                      title="Повысить приоритет"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === models.length - 1}
                      onClick={() => handleMoveDown(index)}
                      className="text-neutral-500 hover:text-white disabled:opacity-20 transition-colors cursor-pointer p-0.5"
                      title="Понизить приоритет"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Priority Number */}
                  <span className="text-xs font-bold text-neutral-500 w-4 text-center shrink-0">
                    {index + 1}
                  </span>

                  {/* Model Name & Description */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-white truncate">
                        {model.name}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          model.provider === 'gemini'
                            ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                            : 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                        }`}
                      >
                        {model.provider}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                      {model.description}
                    </p>
                  </div>
                </div>

                {/* Right: Status Badge */}
                <div className="shrink-0 ml-2">
                  {!model.enabled ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 bg-neutral-800/60 px-2 py-0.5 rounded-lg border border-neutral-800">
                      <XCircle className="w-3 h-3 text-neutral-500" />
                      <span>Откл.</span>
                    </span>
                  ) : isFirstActive ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/30">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>Активна</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/20">
                      <Zap className="w-3 h-3 text-blue-400" />
                      <span>Резерв</span>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Custom API Keys Section */}
      <div className="pt-2 border-t border-neutral-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <h4 className="text-xs font-bold text-white my-0">
              Пользовательские API ключи (опционально)
            </h4>
          </div>
          <span className="text-[10px] text-neutral-400">
            Сохраняются в профиле и браузере
          </span>
        </div>

        {/* Gemini API Key */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-neutral-300 font-medium">Google Gemini API:</span>
            {geminiKey.trim() ? (
              <span className="text-emerald-400 flex items-center gap-1 text-[10px] font-semibold">
                <CheckCircle2 className="w-3 h-3" /> Свой ключ активен
              </span>
            ) : (
              <span className="text-neutral-500 flex items-center gap-1 text-[10px]">
                <ShieldCheck className="w-3 h-3" /> Системный ключ KaloriiAI
              </span>
            )}
          </div>
          <div className="relative">
            <input
              type={showGeminiKey ? 'text' : 'password'}
              placeholder="AIzaSy... (оставьте пустым для системного ключа)"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              className="w-full bg-[#141417] border border-neutral-800 rounded-xl px-3 py-2 pr-9 text-xs text-white placeholder-neutral-600 outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={() => setShowGeminiKey(!showGeminiKey)}
              className="absolute right-2.5 top-2.5 text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              {showGeminiKey ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* OpenRouter API Key */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-neutral-300 font-medium">OpenRouter API:</span>
            {openrouterKey.trim() ? (
              <span className="text-emerald-400 flex items-center gap-1 text-[10px] font-semibold">
                <CheckCircle2 className="w-3 h-3" /> Свой ключ активен
              </span>
            ) : (
              <span className="text-neutral-500 flex items-center gap-1 text-[10px]">
                <ShieldCheck className="w-3 h-3" /> Системный ключ KaloriiAI
              </span>
            )}
          </div>
          <div className="relative">
            <input
              type={showOpenrouterKey ? 'text' : 'password'}
              placeholder="sk-or-v1-... (оставьте пустым для системного ключа)"
              value={openrouterKey}
              onChange={(e) => setOpenrouterKey(e.target.value)}
              className="w-full bg-[#141417] border border-neutral-800 rounded-xl px-3 py-2 pr-9 text-xs text-white placeholder-neutral-600 outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={() => setShowOpenrouterKey(!showOpenrouterKey)}
              className="absolute right-2.5 top-2.5 text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              {showOpenrouterKey ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Save Button */}
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
    </Card>
  )
}
