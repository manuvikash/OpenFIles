import { useCallback, useState } from 'react'
import {
  FileText, File, Code, Braces, Database, Terminal,
  Table, ExternalLink, FolderOpen, FolderSearch,
  Loader2, CheckCircle, AlertCircle, Play
} from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '@/store/appStore'
import type { FileInfo } from '@/types'
import {
  getFileIconInfo, formatFileSize, formatRelativeTime, isSupportedExtension
} from '@/lib/fileParser'
import { indexFiles } from '@/lib/indexer'
import { collectionNameFromDir } from '@/lib/indexer'

const ICON_MAP: Record<string, React.ElementType> = {
  'file-text': FileText, 'code': Code, 'braces': Braces,
  'database': Database, 'terminal': Terminal, 'table': Table, 'file': File
}

function FileIcon({ ext, size = 'md' }: { ext: string; size?: 'sm' | 'md' | 'lg' }) {
  const { icon, color } = getFileIconInfo(ext)
  const Icon = ICON_MAP[icon] ?? File
  const sizeClass = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-5 h-5'
  return <Icon className={clsx(sizeClass, color)} />
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  const { selectedDirectory, setSelectedDirectory, setDirectoryTree, setFiles } = useAppStore()

  const handleOpen = async () => {
    const dir = await window.api.openDirectory()
    if (!dir) return
    setSelectedDirectory(dir)
    const [tree, scanned] = await Promise.all([
      window.api.getDirectoryTree(dir),
      window.api.scanDirectory(dir)
    ])
    setDirectoryTree(tree)
    setFiles(scanned)
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center p-8">
      <div className="w-20 h-20 rounded-2xl bg-surface-800 flex items-center justify-center">
        <FolderSearch className="w-10 h-10 text-surface-600" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-surface-200 mb-2">No directory selected</h2>
        <p className="text-surface-500 text-sm max-w-sm">
          Open a folder to start indexing and searching your files with semantic AI search.
        </p>
      </div>
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 px-5 py-2.5 bg-accent-600 hover:bg-accent-500 text-white text-sm font-medium rounded-xl transition-colors shadow-lg shadow-accent-900/20"
      >
        <FolderOpen className="w-4 h-4" />
        Open Folder
      </button>
    </div>
  )
}

// ─── Index Button / Progress ──────────────────────────────────────────────────

function IndexSection() {
  const {
    files, settings, collectionName, indexingProgress,
    setIndexingProgress, setIndexedFiles, addIndexedFile, setCollectionName,
    chromaStatus
  } = useAppStore()

  const [abortController, setAbortController] = useState<AbortController | null>(null)

  const supportedFiles = files.filter((f) => f.supported)
  const isIndexing = indexingProgress.status === 'indexing'
  const isComplete = indexingProgress.status === 'complete'
  const hasError = indexingProgress.status === 'error'
  const canIndex = chromaStatus === 'running' && settings.geminiApiKey !== '' && !isIndexing

  const handleIndex = useCallback(async () => {
    if (!canIndex || supportedFiles.length === 0) return

    const ac = new AbortController()
    setAbortController(ac)
    setIndexedFiles([])
    setIndexingProgress({ status: 'indexing', total: supportedFiles.length, indexed: 0, current: '' })

    try {
      const { collectionName: name, result } = await indexFiles(
        supportedFiles,
        settings,
        (indexed, total, current) => {
          setIndexingProgress({ indexed, total, current, status: 'indexing' })
        },
        ac.signal
      )

      setCollectionName(name)
      setIndexingProgress({
        status: 'complete',
        indexed: result.indexed,
        total: supportedFiles.length,
        current: '',
        error: result.errors.length > 0 ? `${result.errors.length} file(s) failed` : undefined
      })

      // Store indexed file records
      for (const f of supportedFiles) {
        addIndexedFile({
          path: f.path, name: f.name, ext: f.ext,
          size: f.size, modified: f.modified,
          chunkCount: 0, indexedAt: Date.now()
        })
      }
    } catch (err) {
      setIndexingProgress({ status: 'error', error: String(err) })
    } finally {
      setAbortController(null)
    }
  }, [canIndex, supportedFiles, settings, setIndexingProgress, setIndexedFiles, addIndexedFile, setCollectionName])

  const handleCancel = () => {
    abortController?.abort()
    setIndexingProgress({ status: 'idle' })
  }

  const pct = indexingProgress.total > 0
    ? Math.round((indexingProgress.indexed / indexingProgress.total) * 100)
    : 0

  if (supportedFiles.length === 0) return null

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-surface-850 border-b border-surface-800 shrink-0">
      {isIndexing ? (
        <>
          <Loader2 className="w-4 h-4 text-accent-400 animate-spin shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-surface-400 truncate">
                {indexingProgress.current ? `Indexing ${indexingProgress.current}` : 'Indexing…'}
              </span>
              <span className="text-surface-300 ml-2 shrink-0">
                {indexingProgress.indexed}/{indexingProgress.total} ({pct}%)
              </span>
            </div>
            <div className="h-1.5 bg-surface-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-500 transition-all duration-200 rounded-full"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-xs text-surface-400 hover:text-surface-200 bg-surface-700 hover:bg-surface-600 rounded-lg transition-colors shrink-0"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          {isComplete && (
            <CheckCircle className="w-4 h-4 text-success shrink-0" />
          )}
          {hasError && (
            <AlertCircle className="w-4 h-4 text-danger shrink-0" />
          )}
          {!isComplete && !hasError && (
            <Database className="w-4 h-4 text-surface-500 shrink-0" />
          )}

          <span className="text-xs text-surface-400 flex-1">
            {isComplete
              ? `Indexed ${indexingProgress.indexed} of ${indexingProgress.total} files${indexingProgress.error ? ` (${indexingProgress.error})` : ''}`
              : hasError
              ? `Error: ${indexingProgress.error}`
              : `${supportedFiles.length} files ready to index`}
          </span>

          <button
            onClick={handleIndex}
            disabled={!canIndex}
            className={clsx(
              'flex items-center gap-2 px-4 py-1.5 text-xs font-medium rounded-lg transition-colors shrink-0',
              canIndex
                ? 'bg-accent-600 hover:bg-accent-500 text-white'
                : 'bg-surface-700 text-surface-500 cursor-not-allowed'
            )}
          >
            <Play className="w-3 h-3" />
            {isComplete ? 'Re-index' : 'Index Files'}
          </button>
        </>
      )}
    </div>
  )
}

// ─── File Row ─────────────────────────────────────────────────────────────────

interface FileRowProps {
  file: FileInfo
  isSelected: boolean
  isIndexed: boolean
  onClick: () => void
}

function FileRow({ file, isSelected, isIndexed, onClick }: FileRowProps) {
  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    window.api.openPath(file.path)
  }

  const handleReveal = (e: React.MouseEvent) => {
    e.stopPropagation()
    window.api.showItemInFolder(file.path)
  }

  return (
    <div
      onClick={onClick}
      className={clsx(
        'group flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-surface-800/50 transition-colors',
        isSelected ? 'bg-accent-600/10 border-l-2 border-l-accent-500' : 'hover:bg-surface-800/50'
      )}
    >
      <FileIcon ext={file.ext} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={clsx(
            'text-sm font-medium truncate',
            isSelected ? 'text-accent-300' : 'text-surface-200'
          )}>
            {file.name}
          </span>
          {isIndexed && (
            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-success/70" title="Indexed" />
          )}
          {!file.supported && (
            <span className="text-xs text-surface-600 shrink-0">(unsupported)</span>
          )}
        </div>
        <p className="text-xs text-surface-600 truncate mt-0.5">
          {file.path.replace(file.name, '').replace(/[/\\]$/, '')}
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right hidden sm:block">
          <p className="text-xs text-surface-500">{formatFileSize(file.size)}</p>
          <p className="text-xs text-surface-600">{formatRelativeTime(file.modified)}</p>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleReveal}
            title="Reveal in Explorer"
            className="p-1.5 text-surface-500 hover:text-surface-300 hover:bg-surface-700 rounded transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleOpen}
            title="Open file"
            className="p-1.5 text-surface-500 hover:text-surface-300 hover:bg-surface-700 rounded transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── FileGrid ─────────────────────────────────────────────────────────────────

export function FileGrid() {
  const { files, selectedFile, indexedFiles, selectedDirectory, setSelectedFile } = useAppStore()
  const indexedPaths = new Set(indexedFiles.map((f) => f.path))

  if (!selectedDirectory) return <EmptyState />

  const sorted = [...files].sort((a, b) => {
    if (a.supported && !b.supported) return -1
    if (!a.supported && b.supported) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Stats bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-900 border-b border-surface-800 shrink-0">
        <span className="text-xs text-surface-500">
          {files.length} file{files.length !== 1 ? 's' : ''}
          {' · '}
          <span className="text-surface-400">{files.filter(f => f.supported).length} indexable</span>
        </span>
        <span className="text-xs text-surface-600">
          {selectedDirectory.split(/[/\\]/).slice(-2).join('/')}
        </span>
      </div>

      {/* Index section */}
      <IndexSection />

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-surface-600 text-sm">No files found in this directory.</p>
          </div>
        ) : (
          sorted.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              isSelected={selectedFile?.path === file.path}
              isIndexed={indexedPaths.has(file.path)}
              onClick={() => setSelectedFile(file)}
            />
          ))
        )}
      </div>
    </div>
  )
}
