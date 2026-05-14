import type { Entry } from '../api/client'
import { EntryCard } from './EntryCard'

interface Props {
  entries: Entry[]
  onEdit: (entry: Entry) => void
  loading?: boolean
}

export function EntryList({ entries, onEdit, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-xl h-32 animate-pulse" />
        ))}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-4xl mb-3">🔐</div>
        <div className="text-lg font-medium">No passwords yet</div>
        <div className="text-sm mt-1">Click "Add Password" to get started</div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {entries.map(entry => (
        <EntryCard key={entry.id} entry={entry} onEdit={onEdit} />
      ))}
    </div>
  )
}
