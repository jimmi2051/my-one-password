import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser'
import { authApi } from '../api/client'

type Stage =
  | 'checking'        // querying touchid-status on mount
  | 'touch-id-prompt' // show "Use Touch ID" button (credential registered on this device)
  | 'password-form'   // entering master password
  | 'setup-password'  // first-time: setting master password
  | 'enable-touchid'  // after password unlock: offer to enable Touch ID on this device

// Per-user, per-device flag stored in localStorage
const deviceFlagKey = (email: string) => `touchid_registered:${email}`

function getErrMsg(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (e.response && typeof e.response === 'object') {
      const resp = e.response as Record<string, unknown>
      if (resp.data && typeof resp.data === 'object') {
        const detail = (resp.data as Record<string, unknown>).detail
        if (typeof detail === 'string') return detail
      }
    }
    if (typeof e.message === 'string') return e.message
    if (typeof e.name === 'string') return e.name
  }
  return ''
}

function getErrName(err: unknown): string {
  if (err && typeof err === 'object' && 'name' in err) {
    return String((err as Record<string, unknown>).name)
  }
  return ''
}

function getErrStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (e.response && typeof e.response === 'object') {
      const resp = e.response as Record<string, unknown>
      if (typeof resp.status === 'number') return resp.status
    }
  }
  return undefined
}

export function UnlockPage() {
  const [stage, setStage] = useState<Stage>('checking')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const navigate = useNavigate()

  // --- Touch ID (WebAuthn) authentication ---
  const attemptTouchId = useCallback(async (email: string) => {
    setLoading(true)
    setError('')
    try {
      const { data: optData } = await authApi.webAuthnLoginOptions()
      const assertion = await startAuthentication({
        optionsJSON: optData.options as PublicKeyCredentialRequestOptionsJSON,
      })
      const { data } = await authApi.webAuthnLogin(assertion)
      if (data.requires_password) {
        setStage('password-form')
        setError('Touch ID verified, but vault key not found on this device. Enter your master password.')
      } else {
        // Successful Touch ID auth — ensure this device is flagged as registered
        if (email) localStorage.setItem(deviceFlagKey(email), 'true')
        navigate('/vault')
      }
    } catch (err: unknown) {
      const name = getErrName(err)
      const msg = getErrMsg(err)
      if (msg.includes('No Touch ID credential')) {
        setStage('password-form')
      } else if (
        name === 'NotAllowedError' ||
        name === 'AbortError' ||
        msg.includes('cancelled') ||
        msg.includes('timed out')
      ) {
        setStage('touch-id-prompt')
      } else {
        setStage('touch-id-prompt')
        setError(msg || 'Touch ID failed')
      }
    } finally {
      setLoading(false)
    }
  }, [navigate])

  // On mount: check Touch ID status + user email.
  // Only show Touch ID prompt if this specific device has a registered credential (local flag).
  // Never auto-attempt — let the user choose manually to avoid browser passkey dialogs on unregistered devices.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [{ data: me }, { data: status }] = await Promise.all([
          authApi.me(),
          authApi.touchIdStatus(),
        ])
        if (cancelled) return
        setUserEmail(me.email)
        const hasLocalFlag = !!localStorage.getItem(deviceFlagKey(me.email))
        if (status.registered && hasLocalFlag) {
          // This device has Touch ID registered — show the prompt
          setStage('touch-id-prompt')
        } else {
          // Either no credentials at all, or credentials exist only on other devices
          setStage('password-form')
        }
      } catch {
        if (!cancelled) setStage('password-form')
      }
    })()
    return () => { cancelled = true }
  }, [])

  // --- Master password unlock ---
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    setError('')
    try {
      await authApi.unlock(password)
      // Check if Touch ID is already registered on THIS device (per-user flag)
      if (userEmail && localStorage.getItem(deviceFlagKey(userEmail))) {
        navigate('/vault')
      } else {
        // Offer to register Touch ID on this device (works for both new devices and first-time setup)
        setStage('enable-touchid')
      }
    } catch (err: unknown) {
      if (getErrStatus(err) === 429) {
        setError('Too many attempts. Please wait 1 minute.')
      } else {
        setError(getErrMsg(err) || 'Unlock failed')
      }
    } finally {
      setLoading(false)
    }
  }

  // --- First-time master password setup ---
  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    setError('')
    try {
      await authApi.setupMasterPassword(password)
      setStage('enable-touchid')
    } catch (err: unknown) {
      setError(getErrMsg(err) || 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  // --- Touch ID registration ---
  const handleEnableTouchId = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: optData } = await authApi.webAuthnRegisterOptions()
      const credential = await startRegistration({
        optionsJSON: optData.options as PublicKeyCredentialCreationOptionsJSON,
      })
      await authApi.webAuthnRegister(credential)
      if (userEmail) localStorage.setItem(deviceFlagKey(userEmail), 'true')
      navigate('/vault')
    } catch (err: unknown) {
      const name = getErrName(err)
      if (name === 'NotAllowedError') {
        navigate('/vault')
      } else if (name === 'InvalidStateError') {
        // Credential already exists on this device — restore the local flag and proceed
        if (userEmail) localStorage.setItem(deviceFlagKey(userEmail), 'true')
        navigate('/vault')
      } else {
        setError(getErrMsg(err) || 'Touch ID registration failed')
        setLoading(false)
      }
    }
  }

  // -------- Render --------

  const card = (emoji: string, title: string, subtitle: string, children: React.ReactNode) => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md">
        <div className="text-4xl mb-4 text-center">{emoji}</div>
        <h2 className="text-xl font-bold text-center mb-2">{title}</h2>
        <p className="text-gray-500 text-sm text-center mb-6">{subtitle}</p>
        {children}
      </div>
    </div>
  )

  if (stage === 'checking') {
    return card('🔒', 'Unlock Vault', 'Checking status…', (
      <div className="flex justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    ))
  }

  if (stage === 'touch-id-prompt') {
    return card('🔒', 'Unlock Vault', 'Use Touch ID or enter your master password', (
      <div className="space-y-4">
        <button
          onClick={() => attemptTouchId(userEmail)}
          disabled={loading}
          className="w-full bg-gray-900 text-white py-4 rounded-xl font-medium hover:bg-gray-800 transition disabled:opacity-50 flex items-center justify-center gap-3"
        >
          <span className="text-2xl">👆</span>
          {loading ? 'Verifying…' : 'Unlock with Touch ID'}
        </button>
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <button
          onClick={() => { setStage('password-form'); setError('') }}
          className="w-full text-blue-600 hover:text-blue-800 py-2 text-sm transition"
        >
          Use master password instead
        </button>
        <div className="pt-2 border-t text-center">
          <button
            onClick={() => { setStage('setup-password'); setError('') }}
            className="text-xs text-gray-400 hover:text-gray-600"
            title="Only for brand new accounts that have never set a master password"
          >
            New account? Set up master password
          </button>
        </div>
      </div>
    ))
  }

  if (stage === 'password-form') {
    return card('🔑', 'Master Password', 'Enter your master password to unlock the vault', (
      <form onSubmit={handleUnlock} className="space-y-4">
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
          {loading ? 'Unlocking…' : 'Unlock'}
        </button>
        <button
          type="button"
          onClick={() => { setStage('touch-id-prompt'); setError('') }}
          className="w-full text-gray-500 hover:text-gray-700 py-2 text-sm"
        >
          ← Back to Touch ID
        </button>
        <div className="pt-2 border-t text-center">
          <button
            type="button"
            onClick={() => { setStage('setup-password'); setError('') }}
            className="text-xs text-gray-400 hover:text-gray-600"
            title="Only for brand new accounts that have never set a master password"
          >
            New account? Set up master password
          </button>
        </div>
      </form>
    ))
  }

  if (stage === 'setup-password') {
    return card('🔑', 'Set Master Password', "Creating a new account? Set a master password to encrypt your vault.", (
      <form onSubmit={handleSetup} className="space-y-4">
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Enter master password"
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
          {loading ? 'Setting up…' : 'Set password & unlock'}
        </button>
        <button
          type="button"
          onClick={() => { setStage('password-form'); setError('') }}
          className="w-full text-gray-500 hover:text-gray-700 py-2 text-sm"
        >
          ← Already have a password? Use it instead
        </button>
      </form>
    ))
  }

  // stage === 'enable-touchid'
  return card('👆', 'Enable Touch ID?', 'Speed up future unlocks by using Touch ID instead of your master password.', (
    <div className="space-y-3">
      <button
        onClick={handleEnableTouchId}
        disabled={loading}
        className="w-full bg-gray-900 text-white py-4 rounded-xl font-medium hover:bg-gray-800 transition disabled:opacity-50 flex items-center justify-center gap-3"
      >
        <span className="text-2xl">👆</span>
        {loading ? 'Registering…' : 'Enable Touch ID'}
      </button>
      {error && <p className="text-red-500 text-sm text-center">{error}</p>}
      <button
        onClick={() => navigate('/vault')}
        className="w-full text-gray-500 hover:text-gray-700 py-2 text-sm"
      >
        Skip for now
      </button>
    </div>
  ))
}


