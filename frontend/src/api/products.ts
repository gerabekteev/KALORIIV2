import { apiClient } from './client'
import { Product, CreateProductPayload } from '../types'

export const productsApi = {
  async getProducts(search?: string, limit = 50): Promise<Product[]> {
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (limit) params.append('limit', limit.toString())
    const query = params.toString() ? `?${params.toString()}` : ''

    return apiClient<Product[]>(`/products${query}`, {
      method: 'GET',
    })
  },

  async createProduct(payload: CreateProductPayload): Promise<Product> {
    return apiClient<Product>('/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
}
