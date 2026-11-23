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
        {photoPreview ? (
          <div className="relative rounded-[20px] overflow-hidden bg-black aspect-video max-h-48 flex items-center justify-center">
            <img
              src={photoPreview}
              alt="Распознанное блюдо"
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2.5 right-2.5 bg-black/80 text-white text-[11px] font-ndot font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E02424]" />
              AI ОЦЕНКА
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-[18px] bg-[#1A1A1D] flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#2A2A2F] flex items-center justify-center text-white shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-white">Расчёт через AI</div>
              <div className="text-[11px] text-[#7A7A82]">
                КБЖУ и порция определены по вашему описанию
              </div>
            </div>
          </div>
        )}

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

          <div className="flex items-center gap-1.5 text-xs text-[#7A7A82]">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Все поля можно свободно скорректировать</span>
          </div>

          <div className="nothing-dotted-divider" />

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              className="w-1/2"
              onClick={closeAIResult}
            >
              Отмена
            </Button>
            <Button type="submit" className="w-1/2" isLoading={isSaving}>
              Сохранить
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
