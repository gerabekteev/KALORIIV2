import { apiClient } from './client'
import { AIRecognitionResult } from '../types'

export const aiApi = {
  async recognizeFood(photoFile: File | Blob, userComment?: string): Promise<AIRecognitionResult> {
    const formData = new FormData()
    formData.append('photo', photoFile, 'food.jpg')
    if (userComment && userComment.trim()) {
      formData.append('user_comment', userComment.trim())
    }

    return apiClient<AIRecognitionResult>('/ai/recognize', {
      method: 'POST',
      body: formData,
    })
  },
}
