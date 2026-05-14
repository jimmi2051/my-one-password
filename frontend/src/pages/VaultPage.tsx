import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEntries } from '../hooks/useVault'
import type { Entry } from '../api/client'
import { authApi } from '../api/client'
import { CategoryFilter } from '../components/CategoryFilter'
import { EntryList } from '../components/EntryList'
import { EntryForm } from '../components/EntryForm'
import { PasswordGenerator } from '../components/PasswordGenerator'
import { ExportImport } from '../components/ExportImport'

export function VaultPage() {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>()
  const [editEntry, setEditEntry] = useState<Entry | null | undefined>(undefined)
  const [rightPanel, setRightPanel] = useState<'generator' | 'export' | null>(null)
  const navigate = useNavigate()

  const { data: entries = [], isLoading } = useEntries(search || undefined, selectedCategory)

  const handleLogout = async () => {
    await authApi.logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔐</span>
          <h1 className="text-xl font-bold text-gray-900">One Password</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search passwords..."
            className="border border-gray-300 rounded-xl px-4 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => setEditEntry(null)}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition"
          >
            + Add
          </button>
          <button
            onClick={() => setRightPanel(rightPanel === 'generator' ? null : 'generator')}
            className="bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl text-sm transition"
            title="Password generator"
          >
            🎲
          </button>
          <button
            onClick={() => setRightPanel(rightPanel === 'export' ? null : 'export')}
            className="bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl text-sm transition"
            title="Export / Import"
          >
            📤
          </button>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-gray-600 px-3 py-2 text-sm transition"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r border-gray-200 p-4">
          <CategoryFilter selectedId={selectedCategory} onSelect={setSelectedCategory} />
        </aside>

        {/* Main */}
        <main className="flex-1 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-700">
              {entries.length} {entries.length === 1 ? 'password' : 'passwords'}
              {selectedCategory ? ' in category' : ''}
              {search ? ` matching "${search}"` : ''}
            </h2>
          </div>
          <EntryList entries={entries} onEdit={e => setEditEntry(e)} loading={isLoading} />
        </main>

        {/* Right panel */}
        {rightPanel && (
          <aside className="w-80 bg-white border-l border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-700">
                {rightPanel === 'generator' ? 'Generator' : 'Export / Import'}
              </h3>
              <button onClick={() => setRightPanel(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            {rightPanel === 'generator' ? <PasswordGenerator /> : <ExportImport />}
          </aside>
        )}
      </div>

      {/* Entry form modal */}
      {editEntry !== undefined && (
        <EntryForm entry={editEntry} onClose={() => setEditEntry(undefined)} />
      )}
    </div>
  )
}
