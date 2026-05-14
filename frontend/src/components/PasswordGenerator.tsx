import { useState } from 'react'
import { generatorApi } from '../api/client'
import { useClipboard } from '../hooks/useClipboard'

interface Props {
  onSelect?: (password: string) => void
}

export function PasswordGenerator({ onSelect }: Props) {
  const [length, setLength] = useState(20)
  const [uppercase, setUppercase] = useState(true)
  const [lowercase, setLowercase] = useState(true)
  const [digits, setDigits] = useState(true)
  const [symbols, setSymbols] = useState(false)
  const [generated, setGenerated] = useState('')
  const { copy, copied, countdown } = useClipboard()

  const generate = async () => {
    const res = await generatorApi.generate({ length, uppercase, lowercase, digits, symbols })
    setGenerated(res.data.password)
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-700">Password Generator</h3>
      
      <div>
        <label className="text-sm text-gray-600">Length: {length}</label>
        <input
          type="range" min={8} max={64} value={length}
          onChange={e => setLength(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        {[
          { label: 'A-Z', val: uppercase, set: setUppercase },
          { label: 'a-z', val: lowercase, set: setLowercase },
          { label: '0-9', val: digits, set: setDigits },
          { label: '!@#', val: symbols, set: setSymbols },
        ].map(opt => (
          <label key={opt.label} className="flex items-center gap-1 text-sm cursor-pointer">
            <input type="checkbox" checked={opt.val} onChange={e => opt.set(e.target.checked)} />
            {opt.label}
          </label>
        ))}
      </div>

      <button
        onClick={generate}
        className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
      >
        Generate
      </button>

      {generated && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="font-mono text-sm break-all">{generated}</div>
          <div className="flex gap-2">
            <button
              onClick={() => copy(generated)}
              className="flex-1 text-sm bg-gray-200 hover:bg-gray-300 py-1 rounded transition"
            >
              {copied ? `Copied! (clears in ${countdown}s)` : 'Copy'}
            </button>
            {onSelect && (
              <button
                onClick={() => onSelect(generated)}
                className="flex-1 text-sm bg-green-500 text-white hover:bg-green-600 py-1 rounded transition"
              >
                Use this
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
