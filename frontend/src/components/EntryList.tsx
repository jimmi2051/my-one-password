import type { Entry } from '../api/client'
import { EntryCard } from './EntryCard'

interface Props {
  entries: Entry[]
  onEdit: (entry: Entry) => void
  loading?: boolean
  groupByCategory?: boolean
}

export function EntryList({ entries, onEdit, loading, groupByCategory }: Props) {
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
        <div className="text-sm mt-1">Click "+ Add" to get started</div>
      </div>
    )
  }

  if (groupByCategory) {
    const groupMap = new Map<string, Entry[]>()
    for (const entry of entries) {
      const key = entry.category_name ?? '__none__'
      if (!groupMap.has(key)) groupMap.set(key, [])
      groupMap.get(key)!.push(entry)
    }
    const sorted = [...groupMap.entries()].sort(([a], [b]) => {
      if (a === '__none__') return 1
      if (b === '__none__') return -1
      return a.localeCompare(b)
    })

    return (
      <div className="space-y-8">
        {sorted.map(([key, group]) => (
          <section key={key}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                {key === '__none__' ? '📂 Uncategorized' : `📁 ${key}`}
              </span>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {group.length}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.map(entry => (
                <EntryCard key={entry.id} entry={entry} onEdit={onEdit} />
              ))}
            </div>
          </section>
        ))}
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
