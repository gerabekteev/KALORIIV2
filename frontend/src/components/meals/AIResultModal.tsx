import React, { useState, useEffect } from 'react'
import { Sparkles, AlertCircle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useUIStore } from '../../store/uiStore'
import { useMealsStore } from '../../store/mealsStore'

export const AIResultModal: React.FC = () => {
  const { isAIResultOpen, closeAIResult, aiResultData, aiPhotoFile, addToast } =
    useUIStore()
  const { addMeal, selectedDate } = useMealsStore()

  const [form, setForm] = useState({
    name: '',
    calories: '',
    protein: '',
    fat: '',
    carbs: '',
    weight_grams: '',
    meal_time: new Date().toTimeString().slice(0, 5),
  })
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (aiResultData) {
      setForm({
        name: aiResultData.name || '',
        calories: Math.round(aiResultData.calories || 0).toString(),
        protein: (aiResultData.protein || 0).toString(),
        fat: (aiResultData.fat || 0).toString(),
        carbs: (aiResultData.carbs || 0).toString(),
        weight_grams: aiResultData.weight_grams?.toString() || '150',
        meal_time: new Date().toTimeString().slice(0, 5),
      })
    }
  }, [aiResultData])

  useEffect(() => {
    if (aiPhotoFile) {
      const url = URL.createObjectURL(aiPhotoFile)
      setPhotoPreview(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setPhotoPreview(null)
    }
  }, [aiPhotoFile])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      addToast('Введите название блюда', 'warning')
      return
    }

    setIsSaving(true)
    try {
      await addMeal({
        name: form.name.trim(),
        calories: Number(form.calories) || 0,
        protein: Number(form.protein) || 0,
        fat: Number(form.fat) || 0,
        carbs: Number(form.carbs) || 0,
        weight_grams: form.weight_grams ? Number(form.weight_grams) : undefined,
        meal_date: selectedDate,
        meal_time: form.meal_time,
        photo_path: aiResultData?.photo_path,
        ingredients: aiResultData?.ingredients || [],
        is_manually_edited: false,
      })
      addToast('Блюдо успешно добавлено!', 'success')
      closeAIResult()
    } catch {
      addToast('Ошибка сохранения блюда', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isAIResultOpen}
      onClose={closeAIResult}
      title="Результат распознавания"
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Photo Preview if available or text AI card */}
        {photoPreview ? (
          <div className="relative rounded-2xl overflow-hidden border border-neutral-700 bg-neutral-900 aspect-video max-h-48 flex items-center justify-center">
            <img
              src={photoPreview}
              alt="Распознанное блюдо"
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 right-2 bg-emerald-500/90 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
              <Sparkles className="w-3 h-3" /> AI Оценка
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/30 to-blue-950/20 border border-emerald-500/20 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-white">Расчёт через нейросеть AI</div>
              <div className="text-[11px] text-neutral-400">
                КБЖУ и порция определены на основе вашего текстового описания
              </div>
            </div>
          </div>
        )}

        {/* AI Notification Banner */}
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
          <Sparkles className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>
            {photoPreview
              ? 'Искусственный интеллект проанализировал фото. Вы можете скорректировать любые значения перед сохранением.'
              : 'Искусственный интеллект рассчитал КБЖУ по вашему описанию. Вы можете скорректировать любые значения перед сохранением.'}
          </span>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <Input
            label="Название блюда *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Калории (ккал) *"
              type="number"
              min="0"
              value={form.calories}
              onChange={(e) => setForm({ ...form, calories: e.target.value })}
              required
            />
            <Input
              label="Вес порции (г)"
              type="number"
              min="0"
              value={form.weight_grams}
              onChange={(e) => setForm({ ...form, weight_grams: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Input
              label="Белки (г)"
              type="number"
              step="0.1"
              min="0"
              value={form.protein}
              onChange={(e) => setForm({ ...form, protein: e.target.value })}
            />
            <Input
              label="Жиры (г)"
              type="number"
              step="0.1"
              min="0"
              value={form.fat}
              onChange={(e) => setForm({ ...form, fat: e.target.value })}
            />
            <Input
              label="Углеводы (г)"
              type="number"
              step="0.1"
              min="0"
              value={form.carbs}
              onChange={(e) => setForm({ ...form, carbs: e.target.value })}
            />
          </div>

          <Input
            label="Время приёма"
            type="time"
            value={form.meal_time}
            onChange={(e) => setForm({ ...form, meal_time: e.target.value })}
          />

          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <AlertCircle className="w-3.5 h-3.5 text-neutral-500" />
            <span>Все поля можно свободно изменить</span>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="w-1/2"
              onClick={closeAIResult}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              className="w-1/2"
              isLoading={isSaving}
            >
              Сохранить
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
