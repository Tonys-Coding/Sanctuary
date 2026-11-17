import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'
import { AppProvider } from './lib/app'
import { FeedbackProvider } from './components/ui'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppProvider>
          <FeedbackProvider>
            <App />
          </FeedbackProvider>
        </AppProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
