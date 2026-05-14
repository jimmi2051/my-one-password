import { useRef, useState } from 'react'
import { vaultApi } from '../api/client'

export function ExportImport() {
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: number } | null>(null)
  const [showWarning, setShowWarning] = useState<'json' | 'csv' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const doExport = async (format: 'json' | 'csv') => {
    const res = format === 'json' ? await vaultApi.exportJson() : await vaultApi.exportCsv()
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `vault-export.${format}`
    a.click()
    URL.revokeObjectURL(url)
    setShowWarning(null)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const res = await vaultApi.import(file)
      setResult(res.data)
    } catch {
      alert('Import failed. Check file format.')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-700">Export / Import</h3>
      
      <div>
        <h4 className="text-sm text-gray-600 mb-2">Export vault</h4>
        <div className="flex gap-2">
          {(['json', 'csv'] as const).map(fmt => (
            <button
              key={fmt}
              onClick={() => setShowWarning(fmt)}
              className="flex-1 border border-gray-300 hover:bg-gray-50 rounded-lg py-2 text-sm transition uppercase"
            >
              {fmt}
            </button>
          ))}
        </div>
      </div>

      {showWarning && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm">
          <p className="font-medium text-yellow-800 mb-2">⚠️ Plaintext warning</p>
          <p className="text-yellow-700 mb-3">This export contains your passwords in plaintext. Keep the file secure and delete it after use.</p>
          <div className="flex gap-2">
            <button onClick={() => doExport(showWarning)} className="bg-yellow-600 text-white px-4 py-1.5 rounded hover:bg-yellow-700 transition text-sm">
              Export anyway
            </button>
            <button onClick={() => setShowWarning(null)} className="bg-gray-200 px-4 py-1.5 rounded hover:bg-gray-300 transition text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm text-gray-600 mb-2">Import from JSON or CSV</h4>
        <input ref={fileRef} type="file" accept=".json,.csv" onChange={handleImport} className="hidden" />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="w-full border border-dashed border-gray-300 hover:border-blue-400 rounded-lg py-3 text-sm text-gray-500 hover:text-blue-600 transition disabled:opacity-50"
        >
          {importing ? 'Importing...' : '📁 Click to select file'}
        </button>
      </div>

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
          <p className="text-green-800">
            ✅ Imported: {result.imported} | Skipped: {result.skipped} | Errors: {result.errors}
          </p>
          <button onClick={() => setResult(null)} className="text-green-600 text-xs mt-1">Dismiss</button>
        </div>
      )}
    </div>
  )
}
