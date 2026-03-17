import { useState } from 'react'
import {
  X, Eye, EyeOff, ExternalLink, AlertCircle, CheckCircle,
  Loader2, Database, Key, Sliders, FolderOpen, Scan
} from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '@/store/appStore'
import { initChromaClient, initEmbeddingFunction, heartbeat } from '@/lib/chromaClient'

interface FieldProps {
  label: string
  hint?: string
  children: React.ReactNode
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-surface-300 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-surface-600 mt-1">{hint}</p>}
    </div>
  )
}

export function SettingsModal() {
  const { settings, setSettings, setShowSettings, setChromaStatus, setChromaPort } = useAppStore()

  const [draft, setDraft] = useState({ ...settings })
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const handleSave = () => {
    setSettings(draft)
    initChromaClient(draft.chromaPort)
    if (draft.geminiApiKey) {
      initEmbeddingFunction(draft.geminiApiKey, draft.embeddingModel)
    }
    setChromaPort(draft.chromaPort)
    setShowSettings(false)
  }

  const handleTestChroma = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      initChromaClient(draft.chromaPort)
      const ok = await heartbeat()
      setTestResult({ ok, msg: ok ? `Connected on port ${draft.chromaPort}` : 'Could not reach ChromaDB — is it running?' })
      setChromaStatus(ok ? 'running' : 'error')
    } catch (err) {
      setTestResult({ ok: false, msg: String(err) })
      setChromaStatus('error')
    } finally {
      setTesting(false)
    }
  }

  const handleStartChroma = async () => {
    setChromaStatus('starting')
    setTestResult(null)
    const result = await window.api.startChroma({
      customBinaryPath: draft.chromaBinaryPath || undefined,
      port: draft.chromaPort
    })
    setChromaStatus(result.success ? 'running' : 'error')
    setTestResult({ ok: result.success, msg: result.message })
  }

  const handleDetectBinary = async () => {
    setDetecting(true)
    setTestResult(null)
    try {
      const { bin, checked } = await window.api.detectChroma(draft.chromaBinaryPath || undefined)
      if (bin) {
        setDraft((d) => ({ ...d, chromaBinaryPath: bin }))
        setTestResult({ ok: true, msg: `Found: ${bin}` })
      } else {
        setTestResult({
          ok: false,
          msg: `Could not auto-detect chroma binary.\nChecked:\n${checked.join('\n')}\n\nRun "pip install chromadb" or browse to set the path manually.`
        })
      }
    } catch (err) {
      setTestResult({ ok: false, msg: String(err) })
    } finally {
      setDetecting(false)
    }
  }

  const handleBrowseBinary = async () => {
    const p = await window.api.openFileForBinary()
    if (p) setDraft((d) => ({ ...d, chromaBinaryPath: p }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-900 border border-surface-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-accent-400" />
            <h2 className="text-base font-semibold text-surface-100">Settings</h2>
          </div>
          <button
            onClick={() => setShowSettings(false)}
            className="p-1.5 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-6">

          {/* ── Gemini API ───────────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Key className="w-4 h-4 text-surface-500" />
              <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Gemini API</h3>
            </div>

            <Field label="API Key" hint="Stored locally — never uploaded.">
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={draft.geminiApiKey}
                  onChange={(e) => setDraft({ ...draft, geminiApiKey: e.target.value })}
                  placeholder="AIza..."
                  className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 pr-10 text-sm text-surface-200 placeholder-surface-600 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                onClick={() => window.api.openPath('https://aistudio.google.com/apikey')}
                className="inline-flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300 mt-1.5"
              >
                Get a free API key at Google AI Studio
                <ExternalLink className="w-3 h-3" />
              </button>
            </Field>

            <Field label="Embedding Model">
              <select
                value={draft.embeddingModel}
                onChange={(e) => setDraft({ ...draft, embeddingModel: e.target.value })}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-200 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all"
              >
                <option value="gemini-embedding-2-preview">gemini-embedding-2-preview (recommended)</option>
                <option value="gemini-embedding-001">gemini-embedding-001</option>
                <option value="text-embedding-004">text-embedding-004</option>
              </select>
            </Field>
          </div>

          {/* ── ChromaDB ─────────────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Database className="w-4 h-4 text-surface-500" />
              <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">ChromaDB</h3>
            </div>

            <Field
              label="chroma Binary Path"
              hint='Leave blank for auto-detect. Set manually if auto-detect fails (e.g. C:\Users\you\AppData\Local\Programs\Python\Python313\Scripts\chroma.EXE).'
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={draft.chromaBinaryPath}
                  onChange={(e) => setDraft({ ...draft, chromaBinaryPath: e.target.value })}
                  placeholder="Auto-detect"
                  className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-200 placeholder-surface-600 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all font-mono"
                />
                <button
                  onClick={handleDetectBinary}
                  disabled={detecting}
                  title="Auto-detect"
                  className="flex items-center gap-1.5 px-3 py-2 text-xs bg-surface-700 hover:bg-surface-600 text-surface-200 rounded-lg transition-colors shrink-0"
                >
                  {detecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scan className="w-3.5 h-3.5" />}
                  Detect
                </button>
                <button
                  onClick={handleBrowseBinary}
                  title="Browse"
                  className="flex items-center gap-1.5 px-3 py-2 text-xs bg-surface-700 hover:bg-surface-600 text-surface-200 rounded-lg transition-colors shrink-0"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
              </div>
            </Field>

            <Field label="Port" hint="ChromaDB listens on this local port.">
              <input
                type="number"
                value={draft.chromaPort}
                onChange={(e) => setDraft({ ...draft, chromaPort: Number(e.target.value) })}
                min={1024} max={65535}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-200 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all"
              />
            </Field>

            <div className="flex gap-2 mt-2">
              <button
                onClick={handleStartChroma}
                className="flex items-center gap-2 px-3 py-1.5 text-xs bg-surface-700 hover:bg-surface-600 text-surface-200 rounded-lg transition-colors"
              >
                Start ChromaDB
              </button>
              <button
                onClick={handleTestChroma}
                disabled={testing}
                className="flex items-center gap-2 px-3 py-1.5 text-xs bg-surface-700 hover:bg-surface-600 text-surface-200 rounded-lg transition-colors"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Test Connection
              </button>
            </div>

            {testResult && (
              <div className={clsx(
                'flex items-start gap-2 mt-3 text-xs rounded-lg px-3 py-2 border',
                testResult.ok
                  ? 'text-success bg-success/10 border-success/30'
                  : 'text-danger bg-danger/10 border-danger/30'
              )}>
                {testResult.ok
                  ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                }
                <span className="whitespace-pre-wrap break-all">{testResult.msg}</span>
              </div>
            )}
          </div>

          {/* ── Indexing ─────────────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sliders className="w-4 h-4 text-surface-500" />
              <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Indexing</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Chunk Size (tokens)" hint="Approx tokens per chunk">
                <input
                  type="number"
                  value={draft.chunkSize}
                  onChange={(e) => setDraft({ ...draft, chunkSize: Number(e.target.value) })}
                  min={128} max={2048} step={64}
                  className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-200 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all"
                />
              </Field>

              <Field label="Chunk Overlap (tokens)">
                <input
                  type="number"
                  value={draft.chunkOverlap}
                  onChange={(e) => setDraft({ ...draft, chunkOverlap: Number(e.target.value) })}
                  min={0} max={512} step={16}
                  className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-200 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all"
                />
              </Field>
            </div>

            <Field label="Max Search Results" hint="Maximum files returned per search">
              <input
                type="number"
                value={draft.maxResults}
                onChange={(e) => setDraft({ ...draft, maxResults: Number(e.target.value) })}
                min={1} max={100}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-200 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all"
              />
            </Field>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-800">
          <button
            onClick={() => setShowSettings(false)}
            className="px-4 py-2 text-sm text-surface-400 hover:text-surface-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-sm font-medium bg-accent-600 hover:bg-accent-500 text-white rounded-xl transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
