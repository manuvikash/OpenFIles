import { useEffect, useState, startTransition } from 'react'

// ─── Single cache keyed by "path@maxDim" or "path@full" ──────────────────────

const MAX_CACHE = 400

const cache = new Map<string, string>()

function cacheSet(key: string, value: string) {
  // LRU eviction: Map preserves insertion order, oldest entry is first
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, value)
}

function cacheKey(filePath: string, thumbnail: boolean, maxDim: number): string {
  return thumbnail ? `${filePath}@${maxDim}` : `${filePath}@full`
}

// ─── Concurrency limiter for thumbnail fetches ────────────────────────────────
// Full-res loads are user-initiated (lightbox) so they are not rate-limited.

const MAX_CONCURRENT_THUMBS = 4
let activeThumbRequests = 0
const thumbQueue: Array<() => void> = []

function acquireThumbSlot(): Promise<void> {
  if (activeThumbRequests < MAX_CONCURRENT_THUMBS) {
    activeThumbRequests++
    return Promise.resolve()
  }
  return new Promise((resolve) => thumbQueue.push(resolve))
}

function releaseThumbSlot() {
  activeThumbRequests--
  const next = thumbQueue.shift()
  if (next) {
    activeThumbRequests++
    next()
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface Options {
  /**
   * true  (default) — fetch a resized JPEG thumbnail via readFileThumbnail.
   *                   Use this for list rows and grid tiles.
   * false           — fetch the full-resolution file via readFileBinary.
   *                   Use this for the lightbox.
   */
  thumbnail?: boolean
  /**
   * Max pixel dimension (longest side) for the thumbnail.
   * Defaults to 240 (small tiles). Use 800 for larger result-card previews.
   * Ignored when thumbnail = false.
   */
  maxDim?: number
}

export function useImagePreview(
  filePath: string | null | undefined,
  { thumbnail = true, maxDim = 240 }: Options = {}
) {
  const key = filePath ? cacheKey(filePath, thumbnail, maxDim) : null
  const cached = key ? cache.get(key) ?? null : null

  const [src, setSrc] = useState<string | null>(cached)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filePath || !key) {
      // These are instant resets — no spinner needed, fine to be synchronous.
      setSrc(null)
      setLoading(false)
      return
    }

    if (cache.has(key)) {
      setSrc(cache.get(key)!)
      return
    }

    let cancelled = false
    let idleTimer: ReturnType<typeof setTimeout> | null = null

    const run = async () => {
      // Idle delay: if the item scrolls past before this fires the cleanup
      // cancels it — no state updates, no re-renders, no scroll interference.
      await new Promise<void>((resolve) => { idleTimer = setTimeout(resolve, 100) })
      if (cancelled) return

      // Spinner shown only after we've committed to fetching.
      // Wrapped in startTransition so React treats it as non-urgent and won't
      // interrupt an active scroll frame to show it.
      startTransition(() => setLoading(true))

      if (thumbnail) await acquireThumbSlot()
      try {
        const res = thumbnail
          ? await window.api.readFileThumbnail(filePath, maxDim)
          : await window.api.readFileBinary(filePath)

        if (cancelled || !res) return

        const url = `data:${res.mimeType};base64,${res.base64}`
        cacheSet(key, url)

        // Image ready — also non-urgent relative to scroll.
        startTransition(() => {
          setSrc(url)
          setLoading(false)
        })
      } catch {
        // Swallow — image simply won't display
        if (!cancelled) startTransition(() => setLoading(false))
      } finally {
        if (thumbnail) releaseThumbSlot()
      }
    }

    run()
    return () => {
      cancelled = true
      if (idleTimer) clearTimeout(idleTimer)
    }
  }, [filePath, key, thumbnail, maxDim]) // eslint-disable-line react-hooks/exhaustive-deps

  return { src, loading }
}
