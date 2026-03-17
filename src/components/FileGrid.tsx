import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FileText, File, Code, Braces, Database, Terminal,
  Table, ExternalLink, FolderOpen, FolderSearch,
  Loader2, CheckCircle, AlertCircle, Play,
  Image, Video, Music, LayoutList, LayoutGrid,
  ChevronLeft, ChevronRight, X, ZoomIn
} from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '@/store/appStore'
import type { FileInfo } from '@/types'
import {
  getFileIconInfo, formatFileSize, formatRelativeTime, isSupportedExtension
} from '@/lib/fileParser'
import { indexFiles, collectionNameFromDir } from '@/lib/indexer'
import { useImagePreview } from '@/hooks/useImagePreview'

// ─── Constants ────────────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png'])

function isImageFile(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext.toLowerCase())
}

// ─── Icon Map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  'file-text': FileText, 'code': Code, 'braces': Braces,
  'database': Database, 'terminal': Terminal, 'table': Table, 'file': File,
  'image': Image, 'video': Video, 'music': Music
}

function FileIcon({ ext, size = 'md' }: { ext: string; size?: 'sm' | 'md' | 'lg' }) {
  const { icon, color } = getFileIconInfo(ext)
  const Icon = ICON_MAP[icon] ?? File
  const sizeClass = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-5 h-5'
  return <Icon className={clsx(sizeClass, color)} />
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  const { selectedDirectory, setSelectedDirectory, setDirectoryTree, setFiles, setCollectionName } = useAppStore()

  const handleOpen = async () => {
    const dir = await window.api.openDirectory()
    if (!dir) return
    setSelectedDirectory(dir)
    setCollectionName(collectionNameFromDir(dir))
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
    files, settings, collectionName, indexedFiles, indexingProgress,
    setIndexingProgress, addIndexedFile, setCollectionName,
    chromaStatus
  } = useAppStore()

  const [abortController, setAbortController] = useState<AbortController | null>(null)

  const supportedFiles = files.filter((f) => f.supported)
  const indexedMap = new Map(indexedFiles.map((f) => [f.path, f]))

  const filesToIndex = supportedFiles.filter((f) => {
    const prev = indexedMap.get(f.path)
    return !prev || f.modified > prev.indexedAt
  })
  const unchangedCount = supportedFiles.length - filesToIndex.length
  const allUpToDate = filesToIndex.length === 0 && supportedFiles.length > 0

  const isIndexing = indexingProgress.status === 'indexing'
  const isComplete = indexingProgress.status === 'complete'
  const hasError = indexingProgress.status === 'error'
  const canIndex = chromaStatus === 'running' && settings.geminiApiKey !== '' && !isIndexing

  const handleIndex = useCallback(async (forceAll = false) => {
    if (!canIndex || supportedFiles.length === 0) return

    const queue = forceAll ? supportedFiles : filesToIndex
    if (queue.length === 0) return

    const ac = new AbortController()
    setAbortController(ac)
    setIndexingProgress({ status: 'indexing', total: queue.length, indexed: 0, current: '' })

    try {
      const { collectionName: name, result } = await indexFiles(
        queue,
        settings,
        (indexed, total, current) => {
          setIndexingProgress({ indexed, total, current, status: 'indexing' })
        },
        ac.signal,
        collectionName ?? undefined
      )

      setCollectionName(name)

      const now = Date.now()
      for (const f of queue) {
        addIndexedFile({
          path: f.path, name: f.name, ext: f.ext,
          size: f.size, modified: f.modified,
          chunkCount: 0, indexedAt: now
        })
      }

      const skippedMsg = (!forceAll && unchangedCount > 0) ? `, ${unchangedCount} unchanged` : ''
      setIndexingProgress({
        status: 'complete',
        indexed: result.indexed,
        total: queue.length,
        current: '',
        error: result.errors.length > 0
          ? `${result.errors.length} failed${skippedMsg}`
          : skippedMsg ? `0 failed${skippedMsg}` : undefined
      })
    } catch (err) {
      setIndexingProgress({ status: 'error', error: String(err) })
    } finally {
      setAbortController(null)
    }
  }, [canIndex, supportedFiles, filesToIndex, unchangedCount, collectionName, settings,
      setIndexingProgress, addIndexedFile, setCollectionName])

  const handleCancel = () => {
    abortController?.abort()
    setIndexingProgress({ status: 'idle' })
  }

  const pct = indexingProgress.total > 0
    ? Math.round((indexingProgress.indexed / indexingProgress.total) * 100)
    : 0

  if (supportedFiles.length === 0) return null

  const idleLabel = (() => {
    if (hasError) return `Error: ${indexingProgress.error}`
    if (isComplete) {
      return `Indexed ${indexingProgress.indexed} of ${indexingProgress.total}${indexingProgress.error ? ` (${indexingProgress.error})` : ''}`
    }
    if (allUpToDate) return `All ${supportedFiles.length} files up to date`
    if (unchangedCount > 0) return `${filesToIndex.length} new/modified · ${unchangedCount} up to date`
    return `${supportedFiles.length} files ready to index`
  })()

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
          {(isComplete || allUpToDate) && !hasError && (
            <CheckCircle className="w-4 h-4 text-success shrink-0" />
          )}
          {hasError && (
            <AlertCircle className="w-4 h-4 text-danger shrink-0" />
          )}
          {!isComplete && !allUpToDate && !hasError && (
            <Database className="w-4 h-4 text-surface-500 shrink-0" />
          )}

          <span className="text-xs text-surface-400 flex-1">{idleLabel}</span>

          <div className="flex items-center gap-2 shrink-0">
            {allUpToDate && (
              <button
                onClick={() => handleIndex(true)}
                disabled={!canIndex}
                title="Force re-index all files"
                className="px-3 py-1.5 text-xs text-surface-400 hover:text-surface-200 bg-surface-700 hover:bg-surface-600 disabled:opacity-40 rounded-lg transition-colors"
              >
                Re-index all
              </button>
            )}

            <button
              onClick={() => handleIndex(false)}
              disabled={!canIndex || allUpToDate}
              className={clsx(
                'flex items-center gap-2 px-4 py-1.5 text-xs font-medium rounded-lg transition-colors',
                canIndex && !allUpToDate
                  ? 'bg-accent-600 hover:bg-accent-500 text-white'
                  : 'bg-surface-700 text-surface-500 cursor-not-allowed'
              )}
            >
              <Play className="w-3 h-3" />
              {filesToIndex.length > 0 && unchangedCount > 0 ? 'Update Index' : 'Index Files'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Image Thumbnail ──────────────────────────────────────────────────────────

function ImageThumb({ filePath, className }: { filePath: string; className?: string }) {
  const { src, loading } = useImagePreview(filePath)
  return (
    <div className={clsx('bg-surface-900 overflow-hidden flex items-center justify-center', className)}>
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : loading ? (
        <Loader2 className="w-3 h-3 text-surface-600 animate-spin" />
      ) : (
        <Image className="w-3.5 h-3.5 text-surface-600" />
      )}
    </div>
  )
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

interface LightboxProps {
  files: FileInfo[]
  index: number
  onClose: () => void
  onChange: (index: number) => void
}

function Lightbox({ files, index, onClose, onChange }: LightboxProps) {
  const file = files[index]
  const { src, loading } = useImagePreview(file?.path)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onChange((index - 1 + files.length) % files.length)
      if (e.key === 'ArrowRight') onChange((index + 1) % files.length)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [index, files.length, onClose, onChange])

  if (!file) return null

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
              {index + 1} / {files.length}
            </span>
            <span className="text-sm font-medium text-surface-100 truncate">{file.name}</span>
            <span className="text-xs text-surface-600 shrink-0">{formatFileSize(file.size)}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={() => window.api.openPath(file.path)}
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
        <div className="flex-1 flex items-center justify-center bg-black/40 overflow-hidden" style={{ minHeight: 200 }}>
          {loading && (
            <Loader2 className="w-8 h-8 text-surface-500 animate-spin" />
          )}
          {src && (
            <img
              src={src}
              alt={file.name}
              className="max-w-full max-h-full object-contain"
              style={{ maxHeight: 'calc(92vh - 120px)' }}
            />
          )}
          {!loading && !src && (
            <p className="text-surface-600 text-sm">Could not load image</p>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-surface-800 shrink-0">
          <p className="text-xs text-surface-600 truncate flex-1">
            {file.path}
          </p>
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => onChange((index - 1 + files.length) % files.length)}
              className="flex items-center gap-1 text-xs text-surface-400 hover:text-surface-200 px-2 py-1 rounded-lg hover:bg-surface-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>
            <button
              onClick={() => onChange((index + 1) % files.length)}
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

// ─── List Row ─────────────────────────────────────────────────────────────────

interface FileRowProps {
  file: FileInfo
  isSelected: boolean
  isIndexed: boolean
  onClick: () => void
  onPreview?: () => void
}

function FileRow({ file, isSelected, isIndexed, onClick, onPreview }: FileRowProps) {
  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    window.api.openPath(file.path)
  }

  const handleReveal = (e: React.MouseEvent) => {
    e.stopPropagation()
    window.api.showItemInFolder(file.path)
  }

  const isImg = isImageFile(file.ext)

  return (
    <div
      onClick={onClick}
      className={clsx(
        'group flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-surface-800/50 transition-colors',
        isSelected ? 'bg-accent-600/10 border-l-2 border-l-accent-500' : 'hover:bg-surface-800/50'
      )}
    >
      {/* Thumbnail or icon */}
      {isImg ? (
        <div className="relative shrink-0">
          <ImageThumb
            filePath={file.path}
            className="w-10 h-10 rounded-md"
          />
          {onPreview && (
            <button
              onClick={(e) => { e.stopPropagation(); onPreview() }}
              title="Preview image"
              className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 rounded-md transition-colors opacity-0 group-hover:opacity-100"
            >
              <ZoomIn className="w-3.5 h-3.5 text-white drop-shadow" />
            </button>
          )}
        </div>
      ) : (
        <FileIcon ext={file.ext} />
      )}

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

// ─── Grid Tile ────────────────────────────────────────────────────────────────

interface GridTileProps {
  file: FileInfo
  isSelected: boolean
  isIndexed: boolean
  onClick: () => void
  onPreview?: () => void
}

function GridTile({ file, isSelected, isIndexed, onClick, onPreview }: GridTileProps) {
  const isImg = isImageFile(file.ext)
  const { src, loading } = useImagePreview(isImg ? file.path : null)

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    window.api.openPath(file.path)
  }

  return (
    <div
      onClick={onClick}
      className={clsx(
        'group relative flex flex-col rounded-xl overflow-hidden cursor-pointer border transition-all',
        isSelected
          ? 'border-accent-500 bg-accent-600/10'
          : 'border-surface-700 hover:border-surface-600 bg-surface-800 hover:bg-surface-750'
      )}
    >
      {/* Preview area */}
      <div className="relative aspect-square bg-surface-900 overflow-hidden">
        {isImg ? (
          <>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-surface-600 animate-spin" />
              </div>
            )}
            {src && (
              <img src={src} alt={file.name} className="absolute inset-0 w-full h-full object-cover" />
            )}
            {/* Preview button overlay */}
            {onPreview && (
              <button
                onClick={(e) => { e.stopPropagation(); onPreview() }}
                title="Preview"
                className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors"
              >
                <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition-opacity" />
              </button>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <FileIcon ext={file.ext} size="lg" />
          </div>
        )}

        {/* Indexed dot */}
        {isIndexed && (
          <span
            className="absolute top-2 right-2 w-2 h-2 rounded-full bg-success/80 ring-2 ring-surface-900"
            title="Indexed"
          />
        )}
      </div>

      {/* Label */}
      <div className="flex items-center gap-1.5 px-2 py-2 border-t border-surface-700/50">
        {!isImg && <FileIcon ext={file.ext} size="sm" />}
        <span className="text-xs text-surface-300 truncate flex-1 font-medium">{file.name}</span>
        <button
          onClick={handleOpen}
          title="Open file"
          className="shrink-0 p-0.5 text-surface-600 hover:text-surface-300 opacity-0 group-hover:opacity-100 transition-all"
        >
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// ─── View Toggle ──────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'grid'

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 bg-surface-800 rounded-lg p-0.5">
      <button
        onClick={() => onChange('list')}
        title="List view"
        className={clsx(
          'flex items-center justify-center w-6 h-6 rounded-md transition-colors',
          mode === 'list' ? 'bg-surface-700 text-surface-100' : 'text-surface-500 hover:text-surface-300'
        )}
      >
        <LayoutList className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => onChange('grid')}
        title="Grid view"
        className={clsx(
          'flex items-center justify-center w-6 h-6 rounded-md transition-colors',
          mode === 'grid' ? 'bg-surface-700 text-surface-100' : 'text-surface-500 hover:text-surface-300'
        )}
      >
        <LayoutGrid className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── FileGrid ─────────────────────────────────────────────────────────────────

export function FileGrid() {
  const { files, selectedFile, indexedFiles, selectedDirectory, setSelectedFile } = useAppStore()
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const indexedPaths = new Set(indexedFiles.map((f) => f.path))
  const indexedCount = files.filter((f) => indexedPaths.has(f.path)).length

  if (!selectedDirectory) return <EmptyState />

  const sorted = [...files].sort((a, b) => {
    if (a.supported && !b.supported) return -1
    if (!a.supported && b.supported) return 1
    return a.name.localeCompare(b.name)
  })

  // Image files in sorted order — used for lightbox navigation
  const imageFiles = sorted.filter((f) => isImageFile(f.ext))

  const openLightbox = (file: FileInfo) => {
    const idx = imageFiles.findIndex((f) => f.path === file.path)
    if (idx !== -1) setLightboxIndex(idx)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Stats bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-900 border-b border-surface-800 shrink-0">
        <span className="text-xs text-surface-500">
          {files.length} file{files.length !== 1 ? 's' : ''}
          {' · '}
          <span className="text-surface-400">{files.filter(f => f.supported).length} indexable</span>
          {indexedCount > 0 && (
            <> · <span className="text-success/80">{indexedCount} indexed</span></>
          )}
          {imageFiles.length > 0 && (
            <> · <span className="text-pink-400/80">{imageFiles.length} image{imageFiles.length !== 1 ? 's' : ''}</span></>
          )}
        </span>

        <div className="flex items-center gap-2">
          <span className="text-xs text-surface-600 hidden sm:block">
            {selectedDirectory.split(/[/\\]/).slice(-2).join('/')}
          </span>
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {/* Index section */}
      <IndexSection />

      {/* File list / grid */}
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-surface-600 text-sm">No files found in this directory.</p>
          </div>
        ) : viewMode === 'list' ? (
          sorted.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              isSelected={selectedFile?.path === file.path}
              isIndexed={indexedPaths.has(file.path)}
              onClick={() => setSelectedFile(file)}
              onPreview={isImageFile(file.ext) ? () => openLightbox(file) : undefined}
            />
          ))
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3">
            {sorted.map((file) => (
              <GridTile
                key={file.path}
                file={file}
                isSelected={selectedFile?.path === file.path}
                isIndexed={indexedPaths.has(file.path)}
                onClick={() => setSelectedFile(file)}
                onPreview={isImageFile(file.ext) ? () => openLightbox(file) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && imageFiles.length > 0 && (
        <Lightbox
          files={imageFiles}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={setLightboxIndex}
        />
      )}
    </div>
  )
}
