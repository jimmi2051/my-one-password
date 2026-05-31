import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEntries } from '../hooks/useVault'
import type { Entry } from '../api/client'
import { authApi } from '../api/client'
import { CategoryFilter } from '../components/CategoryFilter'
import { EntryList } from '../components/EntryList'
import { EntryForm } from '../components/EntryForm'
import { PasswordGenerator } from '../components/PasswordGenerator'
import { ExportImport } from '../components/ExportImport'

type SortOption = 'title-asc' | 'title-desc' | 'created-new' | 'created-old' | 'updated-new'

const PAGE_SIZE = 12

export function VaultPage() {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>()
  const [editEntry, setEditEntry] = useState<Entry | null | undefined>(undefined)
  const [rightPanel, setRightPanel] = useState<'generator' | 'export' | null>(null)
  const [sort, setSort] = useState<SortOption>('title-asc')
  const [page, setPage] = useState(1)
  const navigate = useNavigate()

  const { data: entries = [], isLoading } = useEntries(search || undefined, selectedCategory)

  const groupByCategory = !selectedCategory && !search

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      switch (sort) {
        case 'title-asc':  return a.title.localeCompare(b.title)
        case 'title-desc': return b.title.localeCompare(a.title)
        case 'created-new': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'created-old': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case 'updated-new': return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        default: return 0
      }
    })
  }, [entries, sort])

  const totalPages = Math.max(1, groupByCategory ? 1 : Math.ceil(sortedEntries.length / PAGE_SIZE))
  const effectivePage = Math.min(page, totalPages)

  const displayEntries = useMemo(() => {
    if (groupByCategory) return sortedEntries
    const start = (effectivePage - 1) * PAGE_SIZE
    return sortedEntries.slice(start, start + PAGE_SIZE)
  }, [sortedEntries, effectivePage, groupByCategory])

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
        <main className="flex-1 p-6 flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-6">
            <div className="text-sm text-gray-500">
              <span className="font-semibold text-gray-700">{sortedEntries.length}</span>{' '}
              {sortedEntries.length === 1 ? 'password' : 'passwords'}
              {selectedCategory ? ' in category' : ''}
              {search ? ` matching "${search}"` : ''}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Sort:</label>
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortOption)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="title-asc">Title A → Z</option>
                <option value="title-desc">Title Z → A</option>
                <option value="created-new">Newest first</option>
                <option value="created-old">Oldest first</option>
                <option value="updated-new">Recently updated</option>
              </select>
            </div>
          </div>

          <EntryList
            entries={displayEntries}
            onEdit={e => setEditEntry(e)}
            loading={isLoading}
            groupByCategory={groupByCategory}
          />

          {/* Pagination */}
          {!groupByCategory && totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-8">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={effectivePage === 1}
                className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition"
              >
                ← Prev
              </button>
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-sm transition ${
                      p === effectivePage
                        ? 'bg-blue-600 text-white font-medium'
                        : 'hover:bg-gray-100 text-gray-600'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={effectivePage === totalPages}
                className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition"
              >
                Next →
              </button>
            </div>
          )}
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
