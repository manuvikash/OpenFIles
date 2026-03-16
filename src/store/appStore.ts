import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AppState,
  FileInfo,
  DirNode,
  IndexingProgress,
  IndexedFile,
  SearchState,
  SearchResult,
  AppSettings,
  ChromaStatus
} from '@/types'
import { DEFAULT_SETTINGS } from '@/types'

interface AppStore extends AppState {
  // Directory actions
  setSelectedDirectory: (dir: string | null) => void
  setDirectoryTree: (tree: DirNode | null) => void
  setFiles: (files: FileInfo[]) => void

  // Indexing actions
  setIndexingProgress: (progress: Partial<IndexingProgress>) => void
  setIndexedFiles: (files: IndexedFile[]) => void
  addIndexedFile: (file: IndexedFile) => void
  setCollectionName: (name: string | null) => void

  // Search actions
  setSearch: (search: Partial<SearchState>) => void
  setSearchResults: (results: SearchResult[]) => void
  clearSearch: () => void

  // ChromaDB actions
  setChromaStatus: (status: ChromaStatus) => void
  setChromaPort: (port: number) => void

  // Settings actions
  setSettings: (settings: Partial<AppSettings>) => void
  setShowSettings: (show: boolean) => void

  // UI actions
  setSelectedFile: (file: FileInfo | null) => void
  setActivePanel: (panel: 'files' | 'results') => void
  setSidebarWidth: (width: number) => void
}

const initialSearch: SearchState = {
  query: '',
  mode: 'semantic',
  results: [],
  isSearching: false,
  hasSearched: false
}

const initialIndexing: IndexingProgress = {
  status: 'idle',
  total: 0,
  indexed: 0,
  current: ''
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      // Initial state
      selectedDirectory: null,
      directoryTree: null,
      files: [],

      indexingProgress: initialIndexing,
      indexedFiles: [],
      collectionName: null,

      search: initialSearch,

      chromaStatus: 'stopped',
      chromaPort: 8765,

      settings: DEFAULT_SETTINGS,
      showSettings: false,

      selectedFile: null,
      sidebarWidth: 260,
      activePanel: 'files',

      // Directory actions
      setSelectedDirectory: (dir) => set({ selectedDirectory: dir }),
      setDirectoryTree: (tree) => set({ directoryTree: tree }),
      setFiles: (files) => set({ files }),

      // Indexing actions
      setIndexingProgress: (progress) =>
        set((s) => ({ indexingProgress: { ...s.indexingProgress, ...progress } })),
      setIndexedFiles: (files) => set({ indexedFiles: files }),
      addIndexedFile: (file) =>
        set((s) => ({
          indexedFiles: [
            ...s.indexedFiles.filter((f) => f.path !== file.path),
            file
          ]
        })),
      setCollectionName: (name) => set({ collectionName: name }),

      // Search actions
      setSearch: (search) => set((s) => ({ search: { ...s.search, ...search } })),
      setSearchResults: (results) =>
        set((s) => ({
          search: { ...s.search, results, hasSearched: true, isSearching: false },
          activePanel: 'results'
        })),
      clearSearch: () =>
        set({
          search: initialSearch,
          activePanel: 'files'
        }),

      // ChromaDB actions
      setChromaStatus: (status) => set({ chromaStatus: status }),
      setChromaPort: (port) => set({ chromaPort: port }),

      // Settings actions
      setSettings: (settings) =>
        set((s) => ({ settings: { ...s.settings, ...settings } })),
      setShowSettings: (show) => set({ showSettings: show }),

      // UI actions
      setSelectedFile: (file) => set({ selectedFile: file }),
      setActivePanel: (panel) => set({ activePanel: panel }),
      setSidebarWidth: (width) => set({ sidebarWidth: width })
    }),
    {
      name: 'openfiles-storage',
      partialize: (state) => ({
        settings: state.settings,
        selectedDirectory: state.selectedDirectory,
        indexedFiles: state.indexedFiles,
        collectionName: state.collectionName,
        sidebarWidth: state.sidebarWidth,
        chromaPort: state.chromaPort
      })
    }
  )
)
