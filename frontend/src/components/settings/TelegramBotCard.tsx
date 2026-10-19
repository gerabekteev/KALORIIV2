import React, { useEffect, useState } from 'react'
import { Send, CheckCircle2, Copy, RefreshCw, Unlink, ExternalLink } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { ConfirmModal } from '../ui/ConfirmModal'
import { telegramApi } from '../../api/telegram'
import { TelegramStatusResponse } from '../../types'
import { useUIStore } from '../../store/uiStore'
import { openExternalUrl } from '../../utils/platform'

export interface TelegramBotCardProps {
  embedded?: boolean
}

export const TelegramBotCard: React.FC<TelegramBotCardProps> = ({ embedded = false }) => {
  const { addToast } = useUIStore()
  const [status, setStatus] = useState<TelegramStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showUnlinkModal, setShowUnlinkModal] = useState(false)

  const loadStatus = async () => {
    try {
      const data = await telegramApi.getStatus()
      setStatus(data)
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  const handleGenerateCode = async () => {
    setIsGenerating(true)
    try {
      const data = await telegramApi.generateLinkCode()
      setStatus(data)
      addToast('Код привязки Telegram сгенерирован!', 'success')
    } catch {
      addToast('Не удалось создать код привязки', 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleUnlink = async () => {
    try {
      const data = await telegramApi.unlink()
      setStatus(data)
      addToast('Telegram-аккаунт отвязан', 'info')
    } catch {
      addToast('Ошибка при отвязке Telegram', 'error')
    }
  }

  const copyCode = (text: string) => {
    navigator.clipboard.writeText(text)
    addToast('Код скопирован в буфер обмена', 'info', 2000)
  }

  const content = (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-bold text-white my-0">
            Telegram-бот KaloriiAI
          </h3>
        </div>
        {status?.is_linked && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Привязан
          </span>
        )}
      </div>

      <p className="text-xs text-neutral-400 leading-relaxed">
        Отправляйте боту <b>фото еды с подписью</b>, <b>текстовые сообщения</b> или{' '}
        <b>голосовые сообщения</b> — бот автоматически распознает блюдо через AI и
        добавит его в ваш дневник (с сохранением расшифровки голоса в описание блюда на сайте).
      </p>

      {isLoading ? (
        <div className="h-12 rounded-xl bg-neutral-800/50 animate-pulse" />
      ) : status?.is_linked ? (
        <div className="flex items-center justify-between bg-[#141418] border border-neutral-800 p-3 rounded-xl">
          <div className="text-xs">
            <span className="text-neutral-400 block">Подключённый аккаунт:</span>
            <span className="font-bold text-white">
              {status.telegram_username ? `@${status.telegram_username}` : `Chat ID: ${status.telegram_chat_id}`}
            </span>
          </div>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => setShowUnlinkModal(true)}
            leftIcon={<Unlink className="w-3.5 h-3.5" />}
          >
            Отвязать
          </Button>

          <ConfirmModal
            isOpen={showUnlinkModal}
            onClose={() => setShowUnlinkModal(false)}
            onConfirm={handleUnlink}
            title="Отвязать Telegram-аккаунт?"
            description="Бот перестанет принимать голосовые и текстовые сообщения для вашего дневника питания."
            confirmText="Да, отвязать"
            cancelText="Отмена"
            isDangerous
          />
        </div>
      ) : (
        <div className="space-y-3">
          {status?.link_code ? (
            <div className="bg-[#141418] border border-sky-500/30 p-3 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-300">
                  Отправьте этот код боту в Telegram:
                </span>
                <button
                  type="button"
                  onClick={() => copyCode(status.link_code!)}
                  className="inline-flex items-center gap-1 text-xs font-mono font-bold text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>{status.link_code}</span>
                  <Copy className="w-3 h-3" />
                </button>
              </div>

              {status.deep_link_url && (
                <button
                  type="button"
                  onClick={() => openExternalUrl(status.deep_link_url!)}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Открыть бота в Telegram и привязать в 1 клик</span>
                </button>
              )}
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="flex-1"
              isLoading={isGenerating}
              onClick={handleGenerateCode}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              {status?.link_code ? 'Обновить код' : 'Получить код привязки Telegram'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={loadStatus}
            >
              Проверить статус
            </Button>
          </div>
        </div>
      )}
    </div>
  )

  if (embedded) {
    return content
  }

  return (
    <Card variant="default" padding="md" className="space-y-3.5">
      {content}
    </Card>
  )
}
export default TelegramBotCard
