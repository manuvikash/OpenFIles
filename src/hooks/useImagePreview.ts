import { useEffect, useState } from 'react'

// Module-level cache survives component re-renders; lives for the app session.
const previewCache = new Map<string, string>()

export function useImagePreview(filePath: string | null | undefined) {
  const cached = filePath ? previewCache.get(filePath) ?? null : null

  const [src, setSrc] = useState<string | null>(cached)
  const [loading, setLoading] = useState(filePath ? !previewCache.has(filePath) : false)

  useEffect(() => {
    if (!filePath) {
      setSrc(null)
      setLoading(false)
      return
    }

    if (previewCache.has(filePath)) {
      setSrc(previewCache.get(filePath)!)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setSrc(null)

    window.api.readFileBinary(filePath)
      .then((res) => {
        if (cancelled || !res) return
        const url = `data:${res.mimeType};base64,${res.base64}`
        previewCache.set(filePath, url)
        setSrc(url)
      })
      .catch(() => {/* swallow — image simply won't display */})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [filePath])

  return { src, loading }
}
