// ─── File System ─────────────────────────────────────────────────────────────

export interface FileInfo {
  name: string
  path: string
  ext: string
  size: number
  modified: number
  supported: boolean
}

export interface DirNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: DirNode[]
  ext?: string
}

// ─── Indexing ─────────────────────────────────────────────────────────────────

export type IndexingStatus = 'idle' | 'scanning' | 'indexing' | 'complete' | 'error'

export interface IndexingProgress {
  status: IndexingStatus
  total: number
  indexed: number
  current: string
  error?: string
}

export interface IndexedFile {
  path: string
  name: string
  ext: string
  size: number
  modified: number
  chunkCount: number
  indexedAt: number
}

// ─── Search ───────────────────────────────────────────────────────────────────

export type SearchMode = 'semantic' | 'file'

export interface SearchResult {
  filePath: string
  fileName: string
  ext: string
  score: number          // 0–1 similarity
  snippet: string        // preview text chunk
  chunkIndex: number
}

export interface SearchState {
  query: string
  mode: SearchMode
  results: SearchResult[]
  isSearching: boolean
  hasSearched: boolean
  error?: string
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface AppSettings {
  geminiApiKey: string
  chromaPort: number
  chromaBinaryPath: string   // '' = auto-detect; set by user if auto-detect fails
  chunkSize: number
  chunkOverlap: number
  maxResults: number
  embeddingModel: string
  embeddingDimension: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  geminiApiKey: '',
  chromaPort: 8765,
  chromaBinaryPath: '',
  chunkSize: 512,
  chunkOverlap: 64,
  maxResults: 20,
  embeddingModel: 'gemini-embedding-2-preview',
  embeddingDimension: 768
}

// ─── App State ────────────────────────────────────────────────────────────────

export type ChromaStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface AppState {
  // Directory
  selectedDirectory: string | null
  directoryTree: DirNode | null
  files: FileInfo[]

  // Indexing
  indexingProgress: IndexingProgress
  indexedFiles: IndexedFile[]
  collectionName: string | null

  // Search
  search: SearchState

  // ChromaDB
  chromaStatus: ChromaStatus
  chromaPort: number

  // Settings
  settings: AppSettings
  showSettings: boolean

  // UI
  selectedFile: FileInfo | null
  sidebarWidth: number
  activePanel: 'files' | 'results'
}

// ─── Electron API ─────────────────────────────────────────────────────────────

export interface ElectronAPI {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>

  openDirectory: () => Promise<string | null>
  openFile: () => Promise<string | null>

  scanDirectory: (dirPath: string) => Promise<FileInfo[]>
  readFileContent: (filePath: string) => Promise<string>
  readFileBinary: (filePath: string) => Promise<{ base64: string; mimeType: string } | null>
  readFileThumbnail: (filePath: string, maxDim?: number) => Promise<{ base64: string; mimeType: string } | null>
  getDirectoryTree: (dirPath: string) => Promise<DirNode>
  getFileStat: (filePath: string) => Promise<{ size: number; modified: number } | null>

  startChroma: (opts?: { customBinaryPath?: string; port?: number }) => Promise<{ success: boolean; port: number; message: string }>
  detectChroma: (userPath?: string) => Promise<{ bin: string | null; checked: string[] }>
  getChromaDataPath: () => Promise<string>
  isChromaReady: () => Promise<boolean>
  openFileForBinary: () => Promise<string | null>

  openPath: (filePath: string) => Promise<string>
  showItemInFolder: (filePath: string) => Promise<void>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
