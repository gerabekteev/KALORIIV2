const API_BASE_URL = '/api'

export class ApiError extends Error {
  status: number
  data: any

  constructor(message: string, status: number, data?: any) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

let isRefreshing = false
let refreshSubscribers: ((token: string) => void)[] = []

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token))
  refreshSubscribers = []
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb)
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('kalorii_token')
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // If body is not FormData, set Content-Type to application/json if not already set
  const isFormData = options.body instanceof FormData
  if (!isFormData && !headers['Content-Type'] && options.body) {
    headers['Content-Type'] = 'application/json'
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers,
  })

  // Handle 401 Unauthorized
  if (response.status === 401) {
    // If request was to auth/refresh or auth/login, clear token and redirect
    if (endpoint.includes('/auth/refresh') || endpoint.includes('/auth/login')) {
      localStorage.removeItem('kalorii_token')
      throw new ApiError('Unauthorized', 401)
    }

    // Try refreshing token
    if (!isRefreshing) {
      isRefreshing = true
      try {
        const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        })

        if (refreshResponse.ok) {
          const data = await refreshResponse.json()
          const newToken = data.access_token
          localStorage.setItem('kalorii_token', newToken)
          isRefreshing = false
          onRefreshed(newToken)

          // Retry original request with new token
          headers['Authorization'] = `Bearer ${newToken}`
          const retryRes = await fetch(url, { ...options, headers })
          if (!retryRes.ok) {
            const errorData = await retryRes.json().catch(() => ({}))
            throw new ApiError(errorData.detail || 'Request failed', retryRes.status, errorData)
          }
          return retryRes.json()
        } else {
          isRefreshing = false
          localStorage.removeItem('kalorii_token')
          window.dispatchEvent(new Event('auth:unauthorized'))
        }
      } catch (e) {
        isRefreshing = false
        localStorage.removeItem('kalorii_token')
        window.dispatchEvent(new Event('auth:unauthorized'))
      }
    } else {
      // Wait for token refresh
      return new Promise<T>((resolve, reject) => {
        addRefreshSubscriber(async (newToken) => {
          try {
            headers['Authorization'] = `Bearer ${newToken}`
            const retryRes = await fetch(url, { ...options, headers })
            if (!retryRes.ok) {
              const errorData = await retryRes.json().catch(() => ({}))
              reject(new ApiError(errorData.detail || 'Request failed', retryRes.status, errorData))
            } else {
              resolve(await retryRes.json())
            }
          } catch (err) {
            reject(err)
          }
        })
      })
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const message =
      typeof errorData.detail === 'string'
        ? errorData.detail
        : Array.isArray(errorData.detail)
        ? errorData.detail.map((d: any) => d.msg).join(', ')
        : errorData.message || `Ошибка сервера (${response.status})`
    throw new ApiError(message, response.status, errorData)
  }

  // For 204 No Content
  if (response.status === 204) {
    return {} as T
  }

  return response.json()
}
