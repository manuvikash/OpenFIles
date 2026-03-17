import { useState, useRef, useCallback } from 'react'
import {
  Search, X, FileSearch, Loader2, Settings,
  Database, AlertCircle, CheckCircle, Zap
} from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '@/store/appStore'
import type { SearchMode, ChromaStatus } from '@/types'
import { semanticSearch, fileSimilaritySearch } from '@/lib/search'

// ─── Chroma status badge ──────────────────────────────────────────────────────

function ChromaBadge({ status }: { status: ChromaStatus }) {
  const map: Record<ChromaStatus, { icon: React.ElementType; color: string; label: string }> = {
    stopped: { icon: AlertCircle, color: 'text-surface-500', label: 'DB offline' },
    starting: { icon: Loader2, color: 'text-yellow-400 animate-spin', label: 'DB starting' },
    running: { icon: CheckCircle, color: 'text-success', label: 'DB ready' },
    error: { icon: AlertCircle, color: 'text-danger', label: 'DB error' }
  }
  const { icon: Icon, color, label } = map[status]
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <Icon className={clsx('w-3.5 h-3.5', color)} />
      <span className="text-xs text-surface-500 hidden lg:inline">{label}</span>
    </div>
  )
}

// ─── Mode toggle ──────────────────────────────────────────────────────────────

interface ModeToggleProps {
  mode: SearchMode
  onChange: (mode: SearchMode) => void
}

function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="flex items-center bg-surface-800 rounded-lg p-0.5 text-xs shrink-0">
      <button
        onClick={() => onChange('semantic')}
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all',
          mode === 'semantic'
            ? 'bg-accent-600 text-white shadow-sm'
            : 'text-surface-400 hover:text-surface-200'
        )}
      >
        <Search className="w-3 h-3" />
        <span>Text</span>
      </button>
      <button
        onClick={() => onChange('file')}
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all',
          mode === 'file'
            ? 'bg-accent-600 text-white shadow-sm'
            : 'text-surface-400 hover:text-surface-200'
        )}
      >
        <FileSearch className="w-3 h-3" />
        <span>File</span>
      </button>
    </div>
  )
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

export function Toolbar() {
  const {
    search,
    chromaStatus,
    collectionName,
    settings,
    selectedFile,
    selectedDirectory,
    setSearch,
    setSearchResults,
    clearSearch,
    setShowSettings,
    setActivePanel
  } = useAppStore()

  const [localQuery, setLocalQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const canSearch =
    chromaStatus === 'running' &&
    collectionName != null &&
    settings.geminiApiKey !== '' &&
    !search.isSearching

  const handleSearch = useCallback(async () => {
    if (!canSearch) return

    const query = search.mode === 'file'
      ? (selectedFile?.path ?? localQuery.trim())
      : localQuery.trim()

    if (!query) return

    setSearch({ isSearching: true, query, error: undefined })

    try {
      let results
      if (search.mode === 'file' && selectedFile) {
        results = await fileSimilaritySearch(selectedFile.path, collectionName!, settings, selectedDirectory ?? undefined)
      } else {
        results = await semanticSearch(query, collectionName!, settings, selectedDirectory ?? undefined)
      }
      setSearchResults(results)
    } catch (err) {
      setSearch({ isSearching: false, error: String(err), hasSearched: true })
      setActivePanel('results')
    }
  }, [canSearch, search.mode, localQuery, selectedFile, collectionName, settings,
      selectedDirectory, setSearch, setSearchResults, setActivePanel])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
    if (e.key === 'Escape') handleClear()
  }

  const handleClear = () => {
    setLocalQuery('')
    clearSearch()
    inputRef.current?.focus()
  }

  const handleFileSearch = useCallback(async () => {
    const filePath = await window.api.openFile()
    if (filePath) {
      setLocalQuery(filePath)
      setSearch({ mode: 'file', query: filePath })
    }
  }, [setSearch])

  return (
    <div className="flex items-center gap-3 px-4 h-14 bg-surface-900 border-b border-surface-800 shrink-0">
      {/* Mode toggle */}
      <ModeToggle
        mode={search.mode}
        onChange={(mode) => {
          setSearch({ mode })
          clearSearch()
          setLocalQuery('')
        }}
      />

      {/* Search input */}
      <div className="relative flex-1 max-w-2xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500 pointer-events-none" />

        {search.mode === 'file' ? (
          <button
            onClick={handleFileSearch}
            className={clsx(
              'w-full pl-9 pr-10 py-2 text-sm text-left rounded-xl border transition-all',
              'bg-surface-800 border-surface-700',
              'hover:bg-surface-750 hover:border-surface-600',
              'focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500',
              localQuery ? 'text-surface-200' : 'text-surface-500'
            )}
          >
            {localQuery
              ? localQuery.split(/[/\\]/).pop()
              : 'Click to select a file for similarity search…'}
          </button>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Search files semantically… e.g. "meeting notes about Q3 budget"'
            className={clsx(
              'w-full pl-9 pr-10 py-2 text-sm rounded-xl border transition-all',
              'bg-surface-800 border-surface-700 text-surface-200 placeholder-surface-600',
              'hover:bg-surface-750 hover:border-surface-600',
              'focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500'
            )}
          />
        )}

        {(localQuery || search.hasSearched) && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search button */}
      <button
        onClick={handleSearch}
        disabled={!canSearch || (!localQuery.trim() && search.mode !== 'file')}
        className={clsx(
          'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all shrink-0',
          canSearch && (localQuery.trim() || search.mode === 'file')
            ? 'bg-accent-600 hover:bg-accent-500 text-white shadow-sm'
            : 'bg-surface-800 text-surface-600 cursor-not-allowed'
        )}
      >
        {search.isSearching ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Zap className="w-4 h-4" />
        )}
        <span>{search.isSearching ? 'Searching…' : 'Search'}</span>
      </button>

      {/* Right section */}
      <div className="flex items-center gap-3 ml-auto shrink-0">
        <ChromaBadge status={chromaStatus} />

        <button
          onClick={() => setShowSettings(true)}
          className="p-2 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
