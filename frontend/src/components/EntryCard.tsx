import { useState } from 'react'
import type { Entry } from '../api/client'
import { useClipboard } from '../hooks/useClipboard'
import { useDeleteEntry } from '../hooks/useVault'

interface Props {
  entry: Entry
  onEdit: (entry: Entry) => void
}

export function EntryCard({ entry, onEdit }: Props) {
  const [showPassword, setShowPassword] = useState(false)
  const { copy: copyPassword, copied: copiedPw, countdown: cdPw } = useClipboard()
  const { copy: copyUsername, copied: copiedUn } = useClipboard()
  const deleteEntry = useDeleteEntry()

  const handleDelete = () => {
    if (confirm(`Delete "${entry.title}"?`)) {
      deleteEntry.mutate(entry.id)
    }
  }

  const favicon = entry.url ? `https://www.google.com/s2/favicons?domain=${new URL(entry.url).hostname}&sz=32` : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {favicon ? (
            <img src={favicon} alt="" className="w-6 h-6 rounded" onError={e => (e.currentTarget.style.display='none')} />
          ) : (
            <div className="w-6 h-6 bg-gradient-to-br from-blue-400 to-purple-500 rounded flex items-center justify-center text-white text-xs font-bold">
              {entry.title[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <h3 className="font-semibold text-gray-900">{entry.title}</h3>
            {entry.category_name && (
              <span className="text-xs text-gray-400">{entry.category_name}</span>
            )}
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
          <button onClick={() => onEdit(entry)} className="text-blue-500 hover:text-blue-700 text-sm px-2 py-1">Edit</button>
          <button onClick={handleDelete} className="text-red-400 hover:text-red-600 text-sm px-2 py-1">Delete</button>
        </div>
      </div>

      <div className="space-y-2">
        {entry.username && (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500">Username</div>
              <div className="text-sm text-gray-700">{entry.username}</div>
            </div>
            <button
              onClick={() => copyUsername(entry.username!)}
              className="text-xs text-gray-400 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition"
            >
              {copiedUn ? '✓' : 'Copy'}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Password</div>
            <div className="text-sm font-mono text-gray-700">
              {showPassword ? entry.password : '••••••••••••'}
            </div>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="text-xs text-gray-400 hover:text-gray-600 px-1 py-1 transition"
              title={showPassword ? 'Hide' : 'Reveal'}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
            <button
              onClick={() => copyPassword(entry.password)}
              className="text-xs text-gray-400 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition"
            >
              {copiedPw ? `${cdPw}s` : 'Copy'}
            </button>
          </div>
        </div>

        {entry.url && (
          <div className="text-xs">
            <a href={entry.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline truncate block">
              {entry.url}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
