import { useState, useEffect } from 'react'
import { useCategories, useCreateEntry, useUpdateEntry } from '../hooks/useVault'
import type { Entry } from '../api/client'
import { PasswordGenerator } from './PasswordGenerator'

interface Props {
  entry?: Entry | null
  onClose: () => void
}

export function EntryForm({ entry, onClose }: Props) {
  const { data: categories = [] } = useCategories()
  const createEntry = useCreateEntry()
  const updateEntry = useUpdateEntry()
  const [showGenerator, setShowGenerator] = useState(false)

  const [form, setForm] = useState({
    title: '',
    username: '',
    password: '',
    url: '',
    notes: '',
    category_id: '',
  })

  useEffect(() => {
    if (entry) {
      setForm({
        title: entry.title,
        username: entry.username || '',
        password: entry.password,
        url: entry.url || '',
        notes: entry.notes || '',
        category_id: entry.category_id || '',
      })
    }
  }, [entry])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      ...form,
      category_id: form.category_id || null,
      username: form.username || null,
      url: form.url || null,
      notes: form.notes || null,
    }
    if (entry) {
      await updateEntry.mutateAsync({ id: entry.id, ...payload })
    } else {
      await createEntry.mutateAsync(payload as any)
    }
    onClose()
  }

  const field = (label: string, key: keyof typeof form, type = 'text', required = false) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required && ' *'}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        required={required}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold">{entry ? 'Edit Entry' : 'Add Entry'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {field('Title', 'title', 'text', true)}
          {field('Username / Email', 'username')}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowGenerator(!showGenerator)}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition"
                title="Generate password"
              >
                🎲
              </button>
            </div>
          </div>

          {showGenerator && (
            <div className="border rounded-lg p-4 bg-gray-50">
              <PasswordGenerator onSelect={pw => { setForm(f => ({ ...f, password: pw })); setShowGenerator(false) }} />
            </div>
          )}

          {field('URL', 'url', 'url')}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={form.category_id}
              onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={createEntry.isPending || updateEntry.isPending}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {createEntry.isPending || updateEntry.isPending ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
