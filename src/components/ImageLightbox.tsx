import { useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, ExternalLink, Loader2 } from 'lucide-react'
import { useImagePreview } from '@/hooks/useImagePreview'
import { formatFileSize } from '@/lib/fileParser'

export interface LightboxItem {
  path: string
  name: string
  size?: number
}

interface ImageLightboxProps {
  items: LightboxItem[]
  index: number
  onClose: () => void
  onChange: (index: number) => void
}

export function ImageLightbox({ items, index, onClose, onChange }: ImageLightboxProps) {
  const item = items[index]
  const { src, loading } = useImagePreview(item?.path, { thumbnail: false })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft')  onChange((index - 1 + items.length) % items.length)
      if (e.key === 'ArrowRight') onChange((index + 1) % items.length)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [index, items.length, onClose, onChange])

  if (!item) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col bg-surface-900 rounded-2xl overflow-hidden shadow-2xl max-w-5xl w-full mx-4"
        style={{ maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs text-surface-500 font-mono shrink-0">
              {index + 1} / {items.length}
            </span>
            <span className="text-sm font-medium text-surface-100 truncate">{item.name}</span>
            {item.size != null && (
              <span className="text-xs text-surface-600 shrink-0">{formatFileSize(item.size)}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={() => window.api.openPath(item.path)}
              title="Open in system viewer"
              className="flex items-center gap-1.5 text-xs text-surface-500 hover:text-surface-200 px-2 py-1 rounded-lg hover:bg-surface-800 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-surface-500 hover:text-surface-200 rounded-lg hover:bg-surface-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Image */}
        <div
          className="flex-1 flex items-center justify-center bg-black/40 overflow-hidden"
          style={{ minHeight: 200 }}
        >
          {loading && <Loader2 className="w-8 h-8 text-surface-500 animate-spin" />}
          {src && (
            <img
              src={src}
              alt={item.name}
              className="max-w-full max-h-full object-contain"
              style={{ maxHeight: 'calc(92vh - 120px)' }}
            />
          )}
          {!loading && !src && (
            <p className="text-surface-600 text-sm">Could not load image</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-surface-800 shrink-0">
          <p className="text-xs text-surface-600 truncate flex-1">{item.path}</p>
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => onChange((index - 1 + items.length) % items.length)}
              className="flex items-center gap-1 text-xs text-surface-400 hover:text-surface-200 px-2 py-1 rounded-lg hover:bg-surface-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>
            <button
              onClick={() => onChange((index + 1) % items.length)}
              className="flex items-center gap-1 text-xs text-surface-400 hover:text-surface-200 px-2 py-1 rounded-lg hover:bg-surface-800 transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
