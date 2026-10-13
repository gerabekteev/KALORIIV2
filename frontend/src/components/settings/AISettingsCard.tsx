import React, { useState } from 'react'
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
import { useUIStore } from '../../store/uiStore'

export interface AIModelItem {
  id: string
  name: string
  provider: 'gemini' | 'openrouter'
  description: string
  enabled: boolean
}

const DEFAULT_AI_MODELS: AIModelItem[] = [
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    provider: 'gemini',
    description: 'Высокая скорость и доступность',
    enabled: true,
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    provider: 'gemini',
    description: 'Максимальный reasoning и точность',
    enabled: true,
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    provider: 'gemini',
    description: 'Сбалансированный анализ',
    enabled: true,
  },
  {
    id: 'openrouter-free',
    name: 'OpenRouter Free Models',
    provider: 'openrouter',
    description: 'Qwen 2.5 VL, Llama 3.2 Vision (Fallback)',
    enabled: true,
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'gemini',
    description: 'Стабильный резервный fallback',
    enabled: true,
  },
  {
    id: 'qwen-2.5-vl-72b',
    name: 'Qwen 2.5 VL 72B',
    provider: 'openrouter',
    description: 'Высокоточная мультимодальная модель',
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
        const existingIds = new Set(parsed.models.map((m: any) => m.id))
        const missingDefaults = DEFAULT_AI_MODELS.filter(
          (m) => !existingIds.has(m.id)
        )
        initialModels = [...parsed.models, ...missingDefaults]
      }
      return {
        models: initialModels,
        geminiKey: parsed.geminiApiKey || '',
        openrouterKey: parsed.openrouterApiKey || '',
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

  // Toggle model enable/disable
  const handleToggle = (id: string) => {
    setModels((prev) =>
      prev.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m))
    )
  }

  // Move model up
  const handleMoveUp = (index: number) => {
    if (index <= 0) return
    setModels((prev) => {
      const next = [...prev]
      const temp = next[index - 1]
      next[index - 1] = next[index]
      next[index] = temp
      return next
    })
  }

  // Move model down
  const handleMoveDown = (index: number) => {
    if (index >= models.length - 1) return
    setModels((prev) => {
      const next = [...prev]
      const temp = next[index + 1]
      next[index + 1] = next[index]
      next[index] = temp
      return next
    })
  }

  // Save settings
  const handleSave = () => {
    setIsSaving(true)
    try {
      const payload = {
        models,
        geminiApiKey: geminiKey.trim() || undefined,
        openrouterApiKey: openrouterKey.trim() || undefined,
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
      addToast('Настройки AI моделей успешно сохранены!', 'success')
    } catch {
      addToast('Ошибка сохранения настроек AI', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // Reset to defaults
  const handleReset = () => {
    if (!window.confirm('Сбросить порядок моделей и ключи к настройкам по умолчанию?')) return
    setModels(DEFAULT_AI_MODELS)
    setGeminiKey('')
    setOpenrouterKey('')
    localStorage.removeItem(STORAGE_KEY)
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
          onClick={handleReset}
          className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
          title="Сбросить порядок по умолчанию"
        >
          <RotateCcw className="w-3 h-3" />
          <span>По умолчанию</span>
        </button>
      </div>

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

        <div className="space-y-1.5">
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
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
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
            Хранятся локально в браузере
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
