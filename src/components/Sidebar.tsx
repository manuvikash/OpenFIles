import { useState, useCallback } from 'react'
import {
  FolderOpen, Folder, ChevronRight, ChevronDown,
  File, FileText, Code, Braces, Database, Terminal,
  Table, RefreshCw
} from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '@/store/appStore'
import type { DirNode } from '@/types'
import { getFileIconInfo } from '@/lib/fileParser'
import { collectionNameFromDir } from '@/lib/indexer'

// ─── Icon Mapping ─────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  'file-text': FileText,
  'code': Code,
  'braces': Braces,
  'database': Database,
  'terminal': Terminal,
  'table': Table,
  'file': File
}

function FileIcon({ ext, className }: { ext: string; className?: string }) {
  const { icon, color } = getFileIconInfo(ext)
  const Icon = ICON_MAP[icon] ?? File
  return <Icon className={clsx('w-3.5 h-3.5 shrink-0', color, className)} />
}

// ─── Tree Node ────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: DirNode
  depth: number
  selectedPath: string | null
  onSelectFile: (node: DirNode) => void
}

function TreeNode({ node, depth, selectedPath, onSelectFile }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1)

  const isDir = node.type === 'directory'
  const isSelected = !isDir && selectedPath === node.path
  const indent = depth * 12

  if (isDir) {
    return (
      <div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1.5 w-full px-2 py-1 text-left hover:bg-surface-800 rounded transition-colors group"
          style={{ paddingLeft: `${indent + 8}px` }}
        >
          <span className="text-surface-500 shrink-0">
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </span>
          {expanded
            ? <FolderOpen className="w-3.5 h-3.5 text-accent-400 shrink-0" />
            : <Folder className="w-3.5 h-3.5 text-surface-400 group-hover:text-accent-400 shrink-0" />
          }
          <span className="text-xs text-surface-300 truncate">{node.name}</span>
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => onSelectFile(node)}
      className={clsx(
        'flex items-center gap-1.5 w-full px-2 py-1 text-left rounded transition-colors',
        isSelected
          ? 'bg-accent-600/20 text-accent-300'
          : 'hover:bg-surface-800 text-surface-400 hover:text-surface-200'
      )}
      style={{ paddingLeft: `${indent + 20}px` }}
    >
      <FileIcon ext={node.ext ?? ''} />
      <span className="text-xs truncate">{node.name}</span>
    </button>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar() {
  const {
    selectedDirectory,
    directoryTree,
    files,
    indexedFiles,
    indexingProgress,
    selectedFile,
    setSelectedFile,
    setSelectedDirectory,
    setDirectoryTree,
    setFiles,
    setCollectionName
  } = useAppStore()

  const handleSelectDirectory = useCallback(async () => {
    const dir = await window.api.openDirectory()
    if (!dir) return

    setSelectedDirectory(dir)
    // Scope the collection to this directory immediately so search never
    // returns results from a previously-indexed different folder.
    setCollectionName(collectionNameFromDir(dir))
    const [tree, scanned] = await Promise.all([
      window.api.getDirectoryTree(dir),
      window.api.scanDirectory(dir)
    ])
    setDirectoryTree(tree)
    setFiles(scanned)
  }, [setSelectedDirectory, setCollectionName, setDirectoryTree, setFiles])

  const handleRefresh = useCallback(async () => {
    if (!selectedDirectory) return
    const [tree, scanned] = await Promise.all([
      window.api.getDirectoryTree(selectedDirectory),
      window.api.scanDirectory(selectedDirectory)
    ])
    setDirectoryTree(tree)
    setFiles(scanned)
  }, [selectedDirectory, setDirectoryTree, setFiles])

  const handleSelectFile = useCallback(
    (node: DirNode) => {
      const file = files.find((f) => f.path === node.path)
      if (file) setSelectedFile(file)
    },
    [files, setSelectedFile]
  )

  const supportedCount = files.filter((f) => f.supported).length
  const indexedCount = indexedFiles.length

  return (
    <div className="flex flex-col h-full bg-surface-900 border-r border-surface-800">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-surface-800 shrink-0">
        <span className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Explorer</span>
        {selectedDirectory && (
          <button
            onClick={handleRefresh}
            className="p-1 rounded text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Directory picker */}
      {!selectedDirectory ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 p-4">
          <Folder className="w-10 h-10 text-surface-600" />
          <p className="text-xs text-surface-500 text-center">No directory selected</p>
          <button
            onClick={handleSelectDirectory}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-white bg-accent-600 hover:bg-accent-500 rounded-lg transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Open Folder
          </button>
        </div>
      ) : (
        <>
          {/* Directory name */}
          <button
            onClick={handleSelectDirectory}
            className="flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-800 border-b border-surface-800 shrink-0 group"
          >
            <FolderOpen className="w-3.5 h-3.5 text-accent-400 shrink-0" />
            <span className="text-xs font-medium text-surface-200 truncate flex-1">
              {selectedDirectory.split(/[/\\]/).pop()}
            </span>
          </button>

          {/* Stats */}
          <div className="flex gap-3 px-3 py-2 border-b border-surface-800 shrink-0">
            <span className="text-xs text-surface-500">
              <span className="text-surface-300 font-medium">{supportedCount}</span> indexable
            </span>
            <span className="text-xs text-surface-500">
              <span className="text-surface-300 font-medium">{indexedCount}</span> indexed
            </span>
          </div>

          {/* Indexing progress bar */}
          {indexingProgress.status === 'indexing' && (
            <div className="px-3 py-2 border-b border-surface-800 shrink-0">
              <div className="flex justify-between text-xs text-surface-500 mb-1">
                <span className="truncate">{indexingProgress.current || 'Indexing...'}</span>
                <span>{indexingProgress.indexed}/{indexingProgress.total}</span>
              </div>
              <div className="h-1 bg-surface-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-500 transition-all duration-300"
                  style={{
                    width: `${indexingProgress.total > 0
                      ? (indexingProgress.indexed / indexingProgress.total) * 100
                      : 0}%`
                  }}
                />
              </div>
            </div>
          )}

          {/* File tree */}
          <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">
            {directoryTree?.children?.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                selectedPath={selectedFile?.path ?? null}
                onSelectFile={handleSelectFile}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
