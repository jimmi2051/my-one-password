import { useState, useRef } from 'react'
import { useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory } from '../hooks/useVault'

interface Props {
  selectedId: string | undefined
  onSelect: (id: string | undefined) => void
}

export function CategoryFilter({ selectedId, onSelect }: Props) {
  const { data: categories = [] } = useCategories()
  const createCat = useCreateCategory()
  const deleteCat = useDeleteCategory()
  const updateCat = useUpdateCategory()
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const handleAdd = async () => {
    if (!newName.trim()) return
    await createCat.mutateAsync(newName.trim())
    setNewName('')
    setAdding(false)
  }

  const startEdit = (catId: string, currentName: string) => {
    setEditingId(catId)
    setEditName(currentName)
    setTimeout(() => editInputRef.current?.select(), 0)
  }

  const commitEdit = async (catId: string) => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== categories.find(c => c.id === catId)?.name) {
      await updateCat.mutateAsync({ id: catId, name: trimmed })
    }
    setEditingId(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
  }

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 mb-2">Categories</h3>
      
      <button
        onClick={() => onSelect(undefined)}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
          !selectedId ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        🔐 All passwords
      </button>

      {categories.map(cat => (
        <div key={cat.id} className="flex items-center group">
          {editingId === cat.id ? (
            <div className="flex-1 flex items-center gap-1 px-1">
              <input
                ref={editInputRef}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitEdit(cat.id)
                  if (e.key === 'Escape') cancelEdit()
                }}
                onBlur={() => commitEdit(cat.id)}
                className="flex-1 text-sm border border-blue-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
              <button
                onMouseDown={e => { e.preventDefault(); commitEdit(cat.id) }}
                className="text-green-600 text-sm px-1 shrink-0"
              >
                ✓
              </button>
              <button
                onMouseDown={e => { e.preventDefault(); cancelEdit() }}
                className="text-gray-400 text-sm px-1 shrink-0"
              >
                ✕
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => onSelect(cat.id)}
                onDoubleClick={() => startEdit(cat.id, cat.name)}
                className={`flex-1 text-left px-3 py-2 rounded-lg text-sm transition ${
                  selectedId === cat.id ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                📁 {cat.name}
              </button>
              <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex transition shrink-0">
                <button
                  onClick={() => startEdit(cat.id, cat.name)}
                  className="text-gray-400 hover:text-blue-600 p-1.5 text-xs rounded-lg hover:bg-blue-50 transition"
                  title="Rename"
                >
                  ✏️
                </button>
                <button
                  onClick={async () => {
                    if (!confirm(`Delete "${cat.name}"?\nEntries in this category will become uncategorized.`)) return
                    await deleteCat.mutateAsync(cat.id)
                    if (selectedId === cat.id) onSelect(undefined)
                  }}
                  className="text-red-400 hover:text-red-600 p-1.5 text-xs rounded-lg hover:bg-red-50 transition"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </>
          )}
        </div>
      ))}

      {adding ? (
        <div className="flex gap-1 px-2">
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder="Category name"
            className="flex-1 text-sm border rounded px-2 py-1"
          />
          <button onClick={handleAdd} className="text-green-600 text-sm px-1">✓</button>
          <button onClick={() => setAdding(false)} className="text-gray-400 text-sm px-1">✕</button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition"
        >
          + Add category
        </button>
      )}
    </div>
  )
}
