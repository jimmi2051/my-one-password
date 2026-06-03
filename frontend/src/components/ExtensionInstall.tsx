import { useState } from 'react'
import { extensionApi } from '../api/client'

interface Props {
  onOpen?: () => void
}

export function ExtensionInstall({ onOpen }: Props) {
  const [showInstructions, setShowInstructions] = useState(false)

  const open = () => {
    if (onOpen) {
      onOpen()
    }
    setShowInstructions(true)
  }

  return (
    <>
      {/* Desktop — compact button */}
      <button
        onClick={open}
        className="hidden sm:flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-3 py-2 rounded-xl text-sm font-medium hover:from-purple-700 hover:to-blue-700 transition"
        title="Install browser extension"
      >
        <span className="text-base leading-none">🧩</span>
        <span>Extension</span>
      </button>

      {/* Mobile — full-width menu item (shown only when onOpen is provided, i.e. inside drawer) */}
      {onOpen && (
        <button
          onClick={open}
          className="sm:hidden w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-purple-600 hover:bg-purple-50 active:bg-purple-100 transition text-left"
        >
          <span>🧩</span> Install Extension
        </button>
      )}

      {/* Modal */}
      {showInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowInstructions(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 z-10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-gray-900">
                🧩 Install Browser Extension
              </h3>
              <button
                onClick={() => setShowInstructions(false)}
                className="text-gray-400 hover:text-gray-600 p-1 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm text-gray-700">
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                <p className="font-medium text-purple-900 mb-1">Step 1 — Download</p>
                <a
                  href={extensionApi.downloadUrl()}
                  className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-purple-700 transition"
                >
                  📥 Download Extension (.zip)
                </a>
                <p className="text-xs text-purple-700 mt-2">
                  Save the zip file and extract it to a permanent location on your computer.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="font-medium text-blue-900 mb-1">Step 2 — Load in Chrome</p>
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-blue-800">
                  <li>
                    Open{' '}
                    <code className="bg-blue-100 px-1.5 py-0.5 rounded text-blue-900 font-mono">
                      chrome://extensions
                    </code>
                  </li>
                  <li>Enable <strong>Developer mode</strong> (toggle top-right)</li>
                  <li>Click <strong>Load unpacked</strong></li>
                  <li>Select the extracted <code className="bg-blue-100 px-1.5 py-0.5 rounded text-blue-900 font-mono">extension/</code> folder</li>
                </ol>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="font-medium text-amber-900 mb-1">Step 3 — Configure</p>
                <p className="text-xs text-amber-800">
                  After loading, copy the 32-character <strong>Extension ID</strong> from the card
                  in <code className="bg-amber-100 px-1 py-0.5 rounded text-amber-900 font-mono">chrome://extensions</code> and
                  add it to your <code className="bg-amber-100 px-1 py-0.5 rounded text-amber-900 font-mono">.env</code>:
                </p>
                <pre className="mt-2 bg-amber-100 text-amber-900 text-xs p-2.5 rounded-lg overflow-x-auto">
{`EXTENSION_ORIGINS=chrome-extension://YOUR_ID
WEBAUTHN_ORIGINS=...,chrome-extension://YOUR_ID`}
                </pre>
                <p className="text-xs text-amber-700 mt-2">
                  Then restart the backend for changes to take effect.
                </p>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800">
                <p>
                  <strong>🔒 Important:</strong> Make sure your vault is unlocked in the web app
                  before using the extension for autofill. The extension shares your session
                  via cookies.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowInstructions(false)}
              className="mt-5 w-full py-2.5 rounded-xl text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
