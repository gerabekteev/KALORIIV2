import { apiClient } from './client'
import { AIRecognitionResult } from '../types'

export function getAIHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  try {
    const saved = localStorage.getItem('kalorii_ai_settings')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed.geminiApiKey && typeof parsed.geminiApiKey === 'string' && parsed.geminiApiKey.trim()) {
        headers['X-Gemini-Key'] = parsed.geminiApiKey.trim()
      }
      if (parsed.openrouterApiKey && typeof parsed.openrouterApiKey === 'string' && parsed.openrouterApiKey.trim()) {
        headers['X-OpenRouter-Key'] = parsed.openrouterApiKey.trim()
      }
      if (Array.isArray(parsed.models) && parsed.models.length > 0) {
        const activeModels = parsed.models
          .filter((m: any) => m.enabled)
          .map((m: any) => ({ provider: m.provider, id: m.id }))
        if (activeModels.length > 0) {
          headers['X-AI-Models'] = JSON.stringify(activeModels)
        }
      }
    }
  } catch {
    // ignore JSON parse errors
  }
  return headers
}

export const aiApi = {
  async recognizeFood(photoFile: File | Blob, userComment?: string): Promise<AIRecognitionResult> {
    const formData = new FormData()
    formData.append('photo', photoFile, 'food.jpg')
    if (userComment && userComment.trim()) {
      const trimmed = userComment.trim()
      // Backend expects 'comment', send both for maximum compatibility
      formData.append('comment', trimmed)
      formData.append('user_comment', trimmed)
    }

    const headers = getAIHeaders()

    return apiClient<AIRecognitionResult>('/ai/recognize', {
      method: 'POST',
      body: formData,
      headers,
    })
  },

  async analyzeText(text: string): Promise<AIRecognitionResult> {
    const headers = getAIHeaders()

    return apiClient<AIRecognitionResult>('/ai/analyze-text', {
      method: 'POST',
      body: JSON.stringify({ text }),
      headers,
    })
  },

  async recognizeVoice(audioBlob: Blob, filename = 'voice.webm'): Promise<AIRecognitionResult> {
    const formData = new FormData()
    formData.append('audio', audioBlob, filename)

    const headers = getAIHeaders()

    return apiClient<AIRecognitionResult>('/ai/recognize-voice', {
      method: 'POST',
      body: formData,
      headers,
    })
  },
}
