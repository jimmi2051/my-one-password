import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/client'

export function UnlockPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [needsMasterPassword, setNeedsMasterPassword] = useState(false)
  const navigate = useNavigate()

  const tryUnlock = async (masterPassword?: string) => {
    setLoading(true)
    setError('')
    try {
      await authApi.unlock(masterPassword)
      navigate('/vault')
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Unlock failed'
      if (msg.includes('Provide master_password')) {
        setNeedsMasterPassword(true)
        setError('')
      } else if (err.response?.status === 429) {
        setError('Too many attempts. Please wait 1 minute.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    try {
      await authApi.setupMasterPassword(password)
      navigate('/vault')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  if (showSetup) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md">
          <div className="text-4xl mb-4 text-center">🔑</div>
          <h2 className="text-xl font-bold text-center mb-2">Set Master Password</h2>
          <p className="text-gray-500 text-sm text-center mb-6">
            Create a master password to encrypt your vault. You'll need this to unlock the app.
          </p>
          <form onSubmit={handleSetup} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter master password"
              required
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? 'Setting up...' : 'Set password & unlock'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md">
        <div className="text-4xl mb-4 text-center">🔒</div>
        <h2 className="text-xl font-bold text-center mb-2">Unlock Vault</h2>
        <p className="text-gray-500 text-sm text-center mb-6">
          Use Touch ID or enter your master password
        </p>

        {needsMasterPassword ? (
          <form onSubmit={e => { e.preventDefault(); tryUnlock(password) }} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Master password"
              required
              autoFocus
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? 'Unlocking...' : 'Unlock'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <button
              onClick={() => tryUnlock()}
              disabled={loading}
              className="w-full bg-gray-900 text-white py-4 rounded-xl font-medium hover:bg-gray-800 transition disabled:opacity-50 flex items-center justify-center gap-3"
            >
              <span className="text-2xl">👆</span>
              {loading ? 'Checking...' : 'Unlock with Touch ID'}
            </button>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button
              onClick={() => setNeedsMasterPassword(true)}
              className="w-full text-blue-600 hover:text-blue-800 py-2 text-sm transition"
            >
              Use master password instead
            </button>
          </div>
        )}

        <div className="mt-4 pt-4 border-t text-center">
          <button
            onClick={() => setShowSetup(true)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            First time? Set up master password
          </button>
        </div>
      </div>
    </div>
  )
}
