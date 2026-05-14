import { useState } from 'react'
import { useCategories, useCreateCategory, useDeleteCategory } from '../hooks/useVault'

interface Props {
  selectedId: string | undefined
  onSelect: (id: string | undefined) => void
}

export function CategoryFilter({ selectedId, onSelect }: Props) {
  const { data: categories = [] } = useCategories()
  const createCat = useCreateCategory()
  const deleteCat = useDeleteCategory()
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    if (!newName.trim()) return
    await createCat.mutateAsync(newName.trim())
    setNewName('')
    setAdding(false)
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
          <button
            onClick={() => onSelect(cat.id)}
            className={`flex-1 text-left px-3 py-2 rounded-lg text-sm transition ${
              selectedId === cat.id ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            📁 {cat.name}
          </button>
          <button
            onClick={() => deleteCat.mutate(cat.id)}
            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 px-2 text-xs transition"
          >
            ✕
          </button>
        </div>
      ))}

      {adding ? (
        <div className="flex gap-1 px-2">
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
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
