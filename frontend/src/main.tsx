import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'
import { initNativeBridge } from './utils/platform'
import { closeTopModal } from './components/ui/Modal'
import { useMealsStore, flushOrCancelPendingDeletes } from './store/mealsStore'
import { useAuthStore } from './store/authStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// Инициализация нативного моста для Android APK
initNativeBridge({
  onBackButton: () => closeTopModal(),
  onAppResume: () => {
    if (useAuthStore.getState().isAuthenticated) {
      useMealsStore.getState().syncOfflineMeals().then(() => {
        useMealsStore.getState().fetchMeals()
      })
    }
  },
  onAppBackground: () => {
    flushOrCancelPendingDeletes()
  },
})

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (useAuthStore.getState().isAuthenticated) {
      useMealsStore.getState().syncOfflineMeals()
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)
