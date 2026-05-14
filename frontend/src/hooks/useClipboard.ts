import { useState, useCallback, useRef } from 'react'

export function useClipboard(clearAfterMs = 30000) {
  const [copied, setCopied] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setCountdown(Math.floor(clearAfterMs / 1000))
      
      if (timerRef.current) clearInterval(timerRef.current)
      
      let remaining = Math.floor(clearAfterMs / 1000)
      timerRef.current = setInterval(() => {
        remaining -= 1
        setCountdown(remaining)
        if (remaining <= 0) {
          clearInterval(timerRef.current!)
          navigator.clipboard.writeText('').catch(() => {})
          setCopied(false)
          setCountdown(0)
        }
      }, 1000)
    } catch {
      alert('Could not copy to clipboard')
    }
  }, [clearAfterMs])

  return { copy, copied, countdown }
}
