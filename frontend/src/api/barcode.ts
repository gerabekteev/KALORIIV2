import { apiClient } from './client'
import {
  BarcodeProductResult,
  RecentScannedProductItem,
  BarcodeScanImageResponse,
  BarcodeProductUpdateRequest,
} from '../types'

export const barcodeApi = {
  lookup: async (barcode: string, refresh = false): Promise<BarcodeProductResult> => {
    return apiClient<BarcodeProductResult>('/barcode/lookup', {
      method: 'POST',
      body: JSON.stringify({ barcode, refresh }),
    })
  },

  updateProduct: async (
    productId: number,
    data: BarcodeProductUpdateRequest
  ): Promise<BarcodeProductResult> => {
    return apiClient<BarcodeProductResult>(`/barcode/product/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  scanImage: async (file: File): Promise<BarcodeScanImageResponse> => {
    const formData = new FormData()
    formData.append('photo', file)

    return apiClient<BarcodeScanImageResponse>('/barcode/scan-image', {
      method: 'POST',
      body: formData,
    })
  },

  getRecent: async (): Promise<RecentScannedProductItem[]> => {
    return apiClient<RecentScannedProductItem[]>('/barcode/recent', {
      method: 'GET',
    })
  },

  deleteRecent: async (productId: number): Promise<void> => {
    return apiClient<void>(`/barcode/recent/${productId}`, {
      method: 'DELETE',
    })
  },
}
