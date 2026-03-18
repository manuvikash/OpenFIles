import { useState, useMemo } from 'react'
import {
  FileText, File, Code, Braces, Database, Terminal, Table, Image, Video, Music,
  ExternalLink, FolderOpen, ArrowLeft, Search, AlertCircle,
  Loader2, FileSearch, ZoomIn
} from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '@/store/appStore'
import type { SearchResult } from '@/types'
import { getFileIconInfo } from '@/lib/fileParser'
import { useImagePreview } from '@/hooks/useImagePreview'
import { useInView } from '@/hooks/useInView'
import { ImageLightbox } from '@/components/ImageLightbox'
import type { LightboxItem } from '@/components/ImageLightbox'

// ─── Constants ────────────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png'])

function isImageResult(result: SearchResult): boolean {
  return IMAGE_EXTENSIONS.has(result.ext.toLowerCase())
}

// ─── Icon Map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  'file-text': FileText, 'code': Code, 'braces': Braces,
  'database': Database, 'terminal': Terminal, 'table': Table, 'file': File,
  'image': Image, 'video': Video, 'music': Music
}

function FileIcon({ ext }: { ext: string }) {
  const { icon, color } = getFileIconInfo(ext)
  const Icon = ICON_MAP[icon] ?? File
  return <Icon className={clsx('w-5 h-5 shrink-0', color)} />
}

// ─── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color =
    pct >= 80 ? 'text-success bg-success/10 border-success/30' :
    pct >= 60 ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' :
    'text-surface-400 bg-surface-700 border-surface-600'

  return (
    <span className={clsx('text-xs font-mono px-2 py-0.5 rounded border', color)}>
      {pct}%
    </span>
  )
}

// ─── Image thumbnail with lazy load ──────────────────────────────────────────

function ResultImageThumb({
  filePath,
  fileName,
  onPreview
}: {
  filePath: string
  fileName: string
  onPreview: () => void
}) {
  const { ref, inView } = useInView()
  // 800px gives good sharpness for the wide 16:9 card preview without loading the full file
  const { src, loading } = useImagePreview(inView ? filePath : null, { maxDim: 800 })

  return (
    <div
      ref={ref}
      onClick={(e) => { e.stopPropagation(); onPreview() }}
      className="group/thumb relative w-full aspect-video rounded-lg overflow-hidden bg-surface-900 cursor-zoom-in mt-2"
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-surface-600 animate-spin" />
        </div>
      )}
      {src && (
        <img src={src} alt={fileName} className="w-full h-full object-cover" />
      )}
      {/* Zoom overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/thumb:bg-black/30 transition-colors">
        <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover/thumb:opacity-100 drop-shadow-lg transition-opacity" />
      </div>
    </div>
  )
}

// ─── Result Card ──────────────────────────────────────────────────────────────

interface ResultCardProps {
  result: SearchResult
  rank: number
  onPreview?: () => void
}

function ResultCard({ result, rank, onPreview }: ResultCardProps) {
  const handleOpen = () => window.api.openPath(result.filePath)
  const handleReveal = () => window.api.showItemInFolder(result.filePath)
  const isImg = isImageResult(result)

  const dir = result.filePath
    .replace(result.fileName, '')
    .replace(/[/\\]$/, '')
    .split(/[/\\]/)
    .slice(-2)
    .join('/')

  return (
    <div
      className="group bg-surface-800 hover:bg-surface-750 border border-surface-700 hover:border-surface-600 rounded-xl p-4 transition-all cursor-pointer"
      onClick={handleOpen}
    >
      <div className="flex items-start gap-3">
        {/* Rank */}
        <span className="text-xs text-surface-600 font-mono w-5 shrink-0 pt-0.5">#{rank}</span>

        <FileIcon ext={result.ext} />

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-surface-100 truncate">{result.fileName}</h3>
              <p className="text-xs text-surface-600 truncate mt-0.5">…/{dir}</p>
            </div>
            <ScoreBadge score={result.score} />
          </div>

          {/* Image preview */}
          {isImg && onPreview && (
            <ResultImageThumb
              filePath={result.filePath}
              fileName={result.fileName}
              onPreview={onPreview}
            />
          )}

          {/* Text snippet — skip for images (snippet is just "[image] filename") */}
          {!isImg && result.snippet && (
            <p className="text-xs text-surface-400 leading-relaxed line-clamp-3 bg-surface-900/50 rounded-lg px-3 py-2 mt-2 font-mono border border-surface-700/50">
              {result.snippet}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-700/50 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); handleOpen() }}
          className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-200 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleReveal() }}
          className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-200 transition-colors"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Reveal
        </button>
        {isImg && onPreview && (
          <button
            onClick={(e) => { e.stopPropagation(); onPreview() }}
            className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-200 transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
            Preview
          </button>
        )}
        {!isImg && (
          <span className="text-surface-700 ml-auto text-xs">
            Chunk #{result.chunkIndex}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Results Panel ────────────────────────────────────────────────────────────

export function ResultsPanel() {
  const { search, setActivePanel, clearSearch } = useAppStore()
  const { results, isSearching, hasSearched, error, query, mode } = search

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // Build a deduplicated list of image results for lightbox navigation
  const imageResults = useMemo(
    () => results.filter(isImageResult),
    [results]
  )
  const lightboxItems: LightboxItem[] = useMemo(
    () => imageResults.map((r) => ({ path: r.filePath, name: r.fileName })),
    [imageResults]
  )

  const openLightbox = (result: SearchResult) => {
    const idx = imageResults.findIndex((r) => r.filePath === result.filePath)
    if (idx !== -1) setLightboxIndex(idx)
  }

  const handleBack = () => {
    clearSearch()
    setActivePanel('files')
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-800 shrink-0">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-xs text-surface-500 hover:text-surface-300 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          {mode === 'file'
            ? <FileSearch className="w-4 h-4 text-accent-400 shrink-0" />
            : <Search className="w-4 h-4 text-accent-400 shrink-0" />
          }
          <span className="text-sm font-medium text-surface-200 truncate">
            {mode === 'file' ? `Similar to: ${query.split(/[/\\]/).pop()}` : `"${query}"`}
          </span>
        </div>

        {!isSearching && hasSearched && !error && (
          <span className="text-xs text-surface-500 shrink-0">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Loading */}
        {isSearching && (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Loader2 className="w-8 h-8 text-accent-400 animate-spin" />
            <p className="text-sm text-surface-400">Searching with AI embeddings…</p>
          </div>
        )}

        {/* Error */}
        {!isSearching && error && (
          <div className="flex items-start gap-3 p-4 bg-danger/10 border border-danger/30 rounded-xl text-danger">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Search failed</p>
              <p className="text-xs mt-1 opacity-80">{error}</p>
            </div>
          </div>
        )}

        {/* No results */}
        {!isSearching && !error && hasSearched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
            <Search className="w-10 h-10 text-surface-700" />
            <p className="text-surface-400 text-sm font-medium">No matching files found</p>
            <p className="text-surface-600 text-xs max-w-xs">
              Try a different query, or make sure the directory has been indexed first.
            </p>
          </div>
        )}

        {/* Results */}
        {!isSearching && !error && results.length > 0 && (
          <div className="flex flex-col gap-3">
            {results.map((result, i) => (
              <ResultCard
                key={`${result.filePath}-${result.chunkIndex}`}
                result={result}
                rank={i + 1}
                onPreview={isImageResult(result) ? () => openLightbox(result) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && lightboxItems.length > 0 && (
        <ImageLightbox
          items={lightboxItems}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={setLightboxIndex}
        />
      )}
    </div>
  )
}
