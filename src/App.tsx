import { useEffect, useCallback } from 'react'
import { useAppStore } from '@/store/appStore'
import { TitleBar } from '@/components/TitleBar'
import { Sidebar } from '@/components/Sidebar'
import { Toolbar } from '@/components/Toolbar'
import { FileGrid } from '@/components/FileGrid'
import { ResultsPanel } from '@/components/ResultsPanel'
import { SettingsModal } from '@/components/SettingsModal'
import { initChromaClient, initEmbeddingFunction, heartbeat } from '@/lib/chromaClient'

export default function App() {
  const {
    settings,
    chromaStatus,
    chromaPort,
    showSettings,
    activePanel,
    setChromaStatus,
    setChromaPort,
    setShowSettings
  } = useAppStore()


  // ─── Boot sequence ──────────────────────────────────────────────────────────

  const bootChroma = useCallback(async () => {
    setChromaStatus('starting')
    initChromaClient(chromaPort)

    // If already running (e.g. previous session left it open), use it immediately
    const alive = await heartbeat()
    if (alive) {
      setChromaStatus('running')
      return
    }

    // Ask the main process to start ChromaDB, passing the user-configured binary
    // path and port so it never falls back to a wrong binary
    const result = await window.api.startChroma({
      customBinaryPath: settings.chromaBinaryPath || undefined,
      port: chromaPort
    })

    if (result.success) {
      setChromaStatus('running')
      if (result.port !== chromaPort) {
        setChromaPort(result.port)
        initChromaClient(result.port)
      }
    } else {
      setChromaStatus('error')
    }
  }, [chromaPort, settings.chromaBinaryPath, setChromaStatus, setChromaPort])

  const initEmbeddings = useCallback(() => {
    if (settings.geminiApiKey) {
      initEmbeddingFunction(settings.geminiApiKey, settings.embeddingModel)
    }
  }, [settings.geminiApiKey, settings.embeddingModel])

  useEffect(() => {
    bootChroma()
  }, []) // Only on mount

  useEffect(() => {
    initEmbeddings()
  }, [initEmbeddings])

  // Re-init chroma client when port changes (from settings)
  useEffect(() => {
    if (chromaStatus === 'running') {
      initChromaClient(chromaPort)
    }
  }, [chromaPort]) // eslint-disable-line

  // ─── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        setShowSettings(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setShowSettings])

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-surface-950 text-surface-200 overflow-hidden">
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="w-64 shrink-0 overflow-hidden">
          <Sidebar />
        </div>

        {/* Resize handle (future: make this draggable) */}
        <div className="w-px bg-surface-800 shrink-0" />

        {/* Main content */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <Toolbar />

          <div className="flex-1 overflow-hidden">
            {activePanel === 'results' ? <ResultsPanel /> : <FileGrid />}
          </div>
        </div>
      </div>

      {/* Settings modal */}
      {showSettings && <SettingsModal />}

      {/* First-run overlay when no API key set */}
      {!settings.geminiApiKey && chromaStatus !== 'starting' && (
        <div className="fixed bottom-4 right-4 z-40 max-w-xs">
          <div className="bg-surface-800 border border-accent-600/40 rounded-xl p-4 shadow-2xl">
            <p className="text-sm text-surface-200 font-medium mb-1">Setup required</p>
            <p className="text-xs text-surface-400 mb-3">
              Add your Gemini API key to start indexing and searching files.
            </p>
            <button
              onClick={() => setShowSettings(true)}
              className="w-full py-2 text-xs font-medium bg-accent-600 hover:bg-accent-500 text-white rounded-lg transition-colors"
            >
              Open Settings
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
