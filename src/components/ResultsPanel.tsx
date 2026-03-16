import {
  FileText, File, Code, Braces, Database, Terminal, Table,
  ExternalLink, FolderOpen, ArrowLeft, Search, AlertCircle,
  Loader2, FileSearch
} from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '@/store/appStore'
import type { SearchResult } from '@/types'
import { getFileIconInfo, formatFileSize } from '@/lib/fileParser'

const ICON_MAP: Record<string, React.ElementType> = {
  'file-text': FileText, 'code': Code, 'braces': Braces,
  'database': Database, 'terminal': Terminal, 'table': Table, 'file': File
}

function FileIcon({ ext }: { ext: string }) {
  const { icon, color } = getFileIconInfo(ext)
  const Icon = ICON_MAP[icon] ?? File
  return <Icon className={clsx('w-5 h-5 shrink-0', color)} />
}

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

interface ResultCardProps {
  result: SearchResult
  rank: number
}

function ResultCard({ result, rank }: ResultCardProps) {
  const handleOpen = () => window.api.openPath(result.filePath)
  const handleReveal = () => window.api.showItemInFolder(result.filePath)

  const dir = result.filePath
    .replace(result.fileName, '')
    .replace(/[/\\]$/, '')
    .split(/[/\\]/)
    .slice(-2)
    .join('/')

  return (
    <div className="group bg-surface-800 hover:bg-surface-750 border border-surface-700 hover:border-surface-600 rounded-xl p-4 transition-all cursor-pointer"
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

          {/* Snippet */}
          {result.snippet && (
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
        <span className="text-surface-700 ml-auto text-xs">
          Chunk #{result.chunkIndex}
        </span>
      </div>
    </div>
  )
}

// ─── Results Panel ────────────────────────────────────────────────────────────

export function ResultsPanel() {
  const { search, setActivePanel, clearSearch } = useAppStore()

  const { results, isSearching, hasSearched, error, query, mode } = search

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
              <ResultCard key={`${result.filePath}-${result.chunkIndex}`} result={result} rank={i + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
