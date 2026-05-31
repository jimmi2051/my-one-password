import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEntries, useCategories } from '../hooks/useVault'
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
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const navigate = useNavigate()

  const { data: entries = [], isLoading } = useEntries(search || undefined, selectedCategory)
  const { data: categories = [] } = useCategories()

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

  const handleCategorySelect = (id: string | undefined) => {
    setSelectedCategory(id)
    setPage(1)
    setMobileDrawerOpen(false)
  }

  const handleSearch = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 sticky top-0 z-30">
        <div className="flex items-center justify-between gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-2xl">🔐</span>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900">One Password</h1>
          </div>

          {/* Right-side actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Desktop search */}
            <input
              type="text"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search passwords..."
              className="hidden sm:block border border-gray-300 rounded-xl px-4 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Mobile search toggle */}
            <button
              onClick={() => setMobileSearchOpen(s => !s)}
              className={`sm:hidden p-2 rounded-xl transition ${mobileSearchOpen ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}
              aria-label="Toggle search"
            >
              🔍
            </button>

            <button
              onClick={() => setEditEntry(null)}
              className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition flex items-center gap-1"
            >
              <span className="hidden sm:inline">+ Add</span>
              <span className="sm:hidden">+</span>
            </button>

            <button
              onClick={() => setRightPanel(rightPanel === 'generator' ? null : 'generator')}
              className={`hidden sm:block px-3 py-2 rounded-xl text-sm transition ${rightPanel === 'generator' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 hover:bg-gray-200'}`}
              title="Password generator"
            >
              🎲
            </button>
            <button
              onClick={() => setRightPanel(rightPanel === 'export' ? null : 'export')}
              className={`hidden sm:block px-3 py-2 rounded-xl text-sm transition ${rightPanel === 'export' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 hover:bg-gray-200'}`}
              title="Export / Import"
            >
              📤
            </button>
            <button
              onClick={handleLogout}
              className="hidden sm:block text-gray-400 hover:text-gray-600 px-3 py-2 text-sm transition"
            >
              Logout
            </button>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileDrawerOpen(true)}
              className="sm:hidden p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition text-lg leading-none"
              aria-label="Open menu"
            >
              ☰
            </button>
          </div>
        </div>

        {/* Mobile expandable search */}
        {mobileSearchOpen && (
          <div className="sm:hidden mt-2">
            <input
              type="text"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search passwords..."
              autoFocus
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </header>

      {/* Mobile category chips */}
      <div className="sm:hidden bg-white border-b border-gray-100">
        <div className="flex gap-2 px-4 py-2.5 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => handleCategorySelect(undefined)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${
              !selectedCategory ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 active:bg-gray-200'
            }`}
          >
            🔐 All
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => handleCategorySelect(cat.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                selectedCategory === cat.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 active:bg-gray-200'
              }`}
            >
              📁 {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — desktop only */}
        <aside className="hidden sm:block w-56 bg-white border-r border-gray-200 p-4 overflow-y-auto shrink-0">
          <CategoryFilter selectedId={selectedCategory} onSelect={handleCategorySelect} />
        </aside>

        {/* Main content */}
        <main className="flex-1 p-4 sm:p-6 flex flex-col overflow-y-auto">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div className="text-sm text-gray-500">
              <span className="font-semibold text-gray-700">{sortedEntries.length}</span>{' '}
              {sortedEntries.length === 1 ? 'password' : 'passwords'}
              {selectedCategory ? ' in category' : ''}
              {search ? ` matching "${search}"` : ''}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 hidden sm:block">Sort:</label>
              <select
                value={sort}
                onChange={e => { setSort(e.target.value as SortOption); setPage(1) }}
                className="text-xs sm:text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="title-asc">A → Z</option>
                <option value="title-desc">Z → A</option>
                <option value="created-new">Newest</option>
                <option value="created-old">Oldest</option>
                <option value="updated-new">Updated</option>
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
            <div className="flex items-center justify-center gap-2 sm:gap-3 mt-8">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={effectivePage === 1}
                className="px-3 py-2 rounded-lg text-sm border border-gray-200 disabled:opacity-40 hover:bg-gray-50 active:bg-gray-100 transition"
              >
                ← Prev
              </button>
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg text-sm transition ${
                      p === effectivePage
                        ? 'bg-blue-600 text-white font-medium'
                        : 'hover:bg-gray-100 active:bg-gray-200 text-gray-600'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={effectivePage === totalPages}
                className="px-3 py-2 rounded-lg text-sm border border-gray-200 disabled:opacity-40 hover:bg-gray-50 active:bg-gray-100 transition"
              >
                Next →
              </button>
            </div>
          )}
        </main>

        {/* Right panel — desktop sidebar */}
        {rightPanel && (
          <aside className="hidden sm:flex w-80 bg-white border-l border-gray-200 p-6 overflow-y-auto shrink-0 flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-700">
                {rightPanel === 'generator' ? '🎲 Generator' : '📤 Export / Import'}
              </h3>
              <button onClick={() => setRightPanel(null)} className="text-gray-400 hover:text-gray-600 p-1">✕</button>
            </div>
            {rightPanel === 'generator' ? <PasswordGenerator /> : <ExportImport />}
          </aside>
        )}
      </div>

      {/* Right panel — mobile bottom sheet */}
      {rightPanel && (
        <div className="sm:hidden fixed inset-0 z-40 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRightPanel(null)} />
          <div className="relative w-full bg-white rounded-t-2xl shadow-xl max-h-[80vh] overflow-y-auto z-10">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-semibold text-gray-700">
                {rightPanel === 'generator' ? '🎲 Password Generator' : '📤 Export / Import'}
              </h3>
              <button onClick={() => setRightPanel(null)} className="text-gray-400 hover:text-gray-600 p-1 text-lg">✕</button>
            </div>
            <div className="p-5">
              {rightPanel === 'generator' ? <PasswordGenerator /> : <ExportImport />}
            </div>
          </div>
        </div>
      )}

      {/* Mobile drawer */}
      {mobileDrawerOpen && (
        <div className="sm:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileDrawerOpen(false)} />
          <div className="relative w-72 bg-white h-full flex flex-col shadow-xl z-10">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔐</span>
                <span className="font-bold text-gray-900">One Password</span>
              </div>
              <button onClick={() => setMobileDrawerOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg text-lg leading-none">✕</button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto">
              <CategoryFilter selectedId={selectedCategory} onSelect={handleCategorySelect} />
            </div>

            <div className="border-t p-3 space-y-1">
              <button
                onClick={() => { setMobileDrawerOpen(false); setRightPanel(rightPanel === 'generator' ? null : 'generator') }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition text-left"
              >
                <span>🎲</span> Password Generator
              </button>
              <button
                onClick={() => { setMobileDrawerOpen(false); setRightPanel(rightPanel === 'export' ? null : 'export') }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition text-left"
              >
                <span>📤</span> Export / Import
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-50 active:bg-red-100 transition text-left"
              >
                <span>🚪</span> Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entry form modal */}
      {editEntry !== undefined && (
        <EntryForm entry={editEntry} onClose={() => setEditEntry(undefined)} />
      )}
    </div>
  )
}
