import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoginPage } from './pages/LoginPage'
import { UnlockPage } from './pages/UnlockPage'
import { VaultPage } from './pages/VaultPage'
import { authApi } from './api/client'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
})

function HomeRedirect() {
  const [dest, setDest] = useState<'/unlock' | '/login' | null>(null)

  useEffect(() => {
    authApi.me().then(() => setDest('/unlock')).catch(() => setDest('/login'))
  }, [])

  if (!dest) return null
  return <Navigate to={dest} replace />
}

function VaultRoute() {
  const [dest, setDest] = useState<'/unlock' | '/login' | null>(null)
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    let cancelled = false

    authApi.me()
      .then(({ data }) => {
        if (cancelled) return
        if (data.unlocked) setUnlocked(true)
        else setDest('/unlock')
      })
      .catch(() => {
        if (!cancelled) setDest('/login')
      })

    return () => { cancelled = true }
  }, [])

  if (dest) return <Navigate to={dest} replace />
  if (!unlocked) return null
  return <VaultPage />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/unlock" element={<UnlockPage />} />
          <Route path="/vault" element={<VaultRoute />} />
          <Route path="/" element={<HomeRedirect />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
