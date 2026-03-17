import { app, BrowserWindow, ipcMain, dialog, shell, net, protocol } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { promises as fs, existsSync, readdirSync } from 'fs'
import path from 'path'
import { spawn, execFileSync, ChildProcess } from 'child_process'

let mainWindow: BrowserWindow | null = null
let chromaProcess: ChildProcess | null = null
let chromaReady = false
let chromaPort = 8765

let chromaStartPromise: Promise<{ success: boolean; port: number; message: string }> | null = null

const SUPPORTED_EXTENSIONS = new Set([
  // Text / documents
  '.txt', '.md', '.pdf', '.docx', '.csv',
  '.py', '.js', '.ts', '.jsx', '.tsx',
  '.rs', '.go', '.java', '.c', '.cpp', '.h', '.hpp',
  '.rb', '.php', '.swift', '.kt', '.scala',
  '.r', '.sql', '.sh', '.bash', '.zsh',
  '.yaml', '.yml', '.json', '.toml', '.ini', '.env',
  '.xml', '.html', '.css', '.scss', '.sass', '.less',
  '.vue', '.svelte', '.astro', '.mdx',
  // Binary media — embedded natively by gemini-embedding-2-preview
  '.jpg', '.jpeg', '.png',
  '.mp4', '.mov',
  '.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac'
])

// MIME types for binary media files sent to the Gemini Embedding API
const BINARY_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.aac': 'audio/aac'
}

const IGNORE_DIRS = new Set([
  'node_modules', '__pycache__', '.git', '.svn', '.hg',
  'dist', 'build', 'out', '.next', '.nuxt', '.vite',
  'coverage', '.nyc_output', 'vendor', 'target', '.cargo',
  '.idea', '.vscode', '__MACOSX', 'thumbs.db'
])

// ─── Window ───────────────────────────────────────────────────────────────────

function resolvePreloadPath(): string {
  const candidates = [
    join(__dirname, '../preload/index.mjs'),
    join(__dirname, '../preload/index.js')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return candidates[0]
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: resolvePreloadPath(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow!.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ─── ChromaDB: binary resolution ─────────────────────────────────────────────

/**
 * Locate the Python-installed `chroma` binary, returning its absolute path.
 *
 * Strategy (in order):
 *  1. User-supplied path (from Settings) — validated to exist on disk.
 *  2. Ask each Python interpreter where `chroma` is via `shutil.which`.
 *     Uses `shell: false` so the argument is passed directly to Python,
 *     never through cmd.exe (which would strip quotes and mangle `-c` scripts).
 *  3. Probe known Windows Python install directories for `chroma.exe` /
 *     `chroma.EXE` directly, handling any Python version subfolder.
 *
 * The node_modules copy is explicitly rejected at every step because npm adds
 * node_modules/.bin to PATH, which shadows the Python binary with the broken
 * Node-based CLI (ARM64-only on Windows x64).
 */
function findChromaBinary(userPath?: string): { bin: string | null; checked: string[] } {
  const checked: string[] = []

  // 1. User-supplied override
  if (userPath && userPath.trim()) {
    const p = userPath.trim()
    checked.push(p)
    if (existsSync(p)) {
      console.log(`[chroma] using user-supplied path: ${p}`)
      return { bin: p, checked }
    }
    console.warn(`[chroma] user-supplied path not found: ${p}`)
  }

  // 2. Ask Python via shutil.which — shell: false avoids cmd.exe mangling
  const pythonCandidates = process.platform === 'win32'
    ? ['py', 'python']
    : ['python3', 'python']

  for (const py of pythonCandidates) {
    try {
      const script = 'import shutil, sys; p = shutil.which("chroma"); sys.stdout.write(p if p else "")'
      const out = execFileSync(py, ['-c', script], {
        encoding: 'utf8',
        timeout: 5000,
        shell: false,       // CRITICAL: no cmd.exe — argument passed directly to Python
        windowsHide: true
      }).trim()

      checked.push(`${py} -> "${out}"`)

      if (out && !out.toLowerCase().includes('node_modules')) {
        console.log(`[chroma] resolved via ${py}: ${out}`)
        return { bin: out, checked }
      }
    } catch (err) {
      checked.push(`${py} -> error: ${(err as Error).message}`)
    }
  }

  // 3. Probe known Windows installation directories directly
  if (process.platform === 'win32') {
    const bases = [
      path.join(process.env['LOCALAPPDATA'] ?? '', 'Programs', 'Python'),
      path.join(process.env['APPDATA'] ?? '', 'Python'),
      path.join(process.env['PROGRAMFILES'] ?? '', 'Python'),
      path.join(process.env['PROGRAMFILES(X86)'] ?? '', 'Python'),
      'C:\\Python3',
      'C:\\Python'
    ].filter(Boolean)

    for (const base of bases) {
      if (!existsSync(base)) continue
      try {
        const entries = readdirSync(base, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isDirectory()) continue
          // Match any PythonXXX subfolder
          for (const exe of ['chroma.EXE', 'chroma.exe', 'chroma']) {
            const candidate = path.join(base, entry.name, 'Scripts', exe)
            checked.push(candidate)
            if (existsSync(candidate)) {
              console.log(`[chroma] found via path scan: ${candidate}`)
              return { bin: candidate, checked }
            }
          }
        }
      } catch { /* skip unreadable dirs */ }
    }
  }

  return { bin: null, checked }
}

// ─── ChromaDB: server lifecycle ───────────────────────────────────────────────

async function waitForChroma(port: number, timeoutMs = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/api/v2/heartbeat`)
      if (res.ok) return true
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

interface StartChromaOptions {
  customBinaryPath?: string
  port?: number
}

/**
 * Start the ChromaDB server.
 *
 * Thread-safety: concurrent callers all receive the same promise so only one
 * spawn ever happens per boot cycle.  "Port already in use" is treated as
 * success — it means a previous instance is still healthy.
 */
function startChromaServer(
  opts: StartChromaOptions = {}
): Promise<{ success: boolean; port: number; message: string }> {
  // Return the in-flight promise to every concurrent caller
  if (chromaStartPromise) return chromaStartPromise

  chromaStartPromise = _startChromaServer(opts).finally(() => {
    chromaStartPromise = null
  })
  return chromaStartPromise
}

async function _startChromaServer(
  opts: StartChromaOptions
): Promise<{ success: boolean; port: number; message: string }> {
  const port = opts.port ?? 8765
  chromaPort = port // keep module-level ref in sync for the protocol proxy
  const dataPath = join(app.getPath('userData'), 'chroma_data')

  try { await fs.mkdir(dataPath, { recursive: true }) } catch {}

  // Fast path: already running
  if (chromaReady) {
    const alive = await waitForChroma(port, 2000)
    if (alive) return { success: true, port, message: 'ChromaDB already running' }
    chromaReady = false  // stale — fall through and restart
  }

  // Check if another process already owns the port (e.g. from a previous session)
  const alreadyUp = await waitForChroma(port, 1000)
  if (alreadyUp) {
    chromaReady = true
    return { success: true, port, message: `ChromaDB already listening on port ${port}` }
  }

  // Resolve the binary
  const { bin: chromaBin, checked } = findChromaBinary(opts.customBinaryPath)
  if (!chromaBin) {
    const detail = checked.length > 0 ? ` Checked: ${checked.join('; ')}` : ''
    return {
      success: false,
      port,
      message:
        `Could not find the chroma binary.${detail}\n\n` +
        `Fix: run "pip install chromadb" then restart the app, or set the path manually ` +
        `in Settings → ChromaDB Binary Path.`
    }
  }

  return new Promise((resolve) => {
    let settled = false
    let log = ''

    const settle = (result: { success: boolean; port: number; message: string }) => {
      if (settled) return
      settled = true
      chromaReady = result.success
      resolve(result)
    }

    try {
      chromaProcess = spawn(
        chromaBin,
        ['run', '--path', dataPath, '--port', String(port)],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false,
          detached: false,
          windowsHide: true,
          env: {
            ...process.env,
            CHROMA_SERVER_CORS_ALLOW_ORIGINS: '["*"]'
          }
        }
      )

      chromaProcess.stdout?.on('data', (d: Buffer) => {
        const t = d.toString(); log += t
        console.log('[chroma]', t.trimEnd())
      })

      chromaProcess.stderr?.on('data', (d: Buffer) => {
        const t = d.toString(); log += t
        console.log('[chroma stderr]', t.trimEnd())
      })

      chromaProcess.on('error', (err) => {
        settle({ success: false, port, message: `Failed to start ChromaDB: ${err.message}` })
      })

      chromaProcess.on('close', async (code) => {
        chromaReady = false
        if (settled) return

        // "Address already in use" means another ChromaDB is healthy on this port
        const portTaken = log.includes('Address') && log.includes('not available')
        if (portTaken) {
          const alive = await waitForChroma(port, 3000)
          settle({
            success: alive,
            port,
            message: alive
              ? `ChromaDB already running on port ${port}`
              : `Port ${port} is in use but ChromaDB did not respond`
          })
          return
        }

        const tail = log.trim().split('\n').filter(Boolean).slice(-3).join(' | ')
        settle({
          success: false,
          port,
          message: `ChromaDB exited (code ${code})${tail ? `: ${tail}` : ''}`
        })
      })

      // Primary readiness check: poll HTTP heartbeat (works regardless of CLI log format)
      waitForChroma(port, 25_000).then((ok) => {
        const tail = log.trim().split('\n').filter(Boolean).slice(-2).join(' | ')
        settle({
          success: ok,
          port,
          message: ok
            ? `ChromaDB running on port ${port}`
            : `ChromaDB did not respond on port ${port} after 25s.${tail ? ` Log: ${tail}` : ''}`
        })
      })
    } catch (err) {
      settle({ success: false, port, message: `Exception launching ChromaDB: ${String(err)}` })
    }
  })
}

// ─── File system helpers ───────────────────────────────────────────────────────

interface FileInfo {
  name: string; path: string; ext: string
  size: number; modified: number; supported: boolean
}

interface DirNode {
  name: string; path: string; type: 'file' | 'directory'
  children?: DirNode[]; ext?: string
}

async function scanDirectory(dirPath: string): Promise<FileInfo[]> {
  const files: FileInfo[] = []
  async function walk(dir: string, depth = 0) {
    if (depth > 10) return
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.env') continue
        if (IGNORE_DIRS.has(entry.name)) continue
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1)
        } else if (entry.isFile()) {
          try {
            const ext = path.extname(entry.name).toLowerCase()
            const stat = await fs.stat(fullPath)
            const isBinaryMedia = ext in BINARY_MIME
            const maxSize = isBinaryMedia ? 50 * 1024 * 1024 : 10 * 1024 * 1024
            if (stat.size === 0 || stat.size > maxSize) continue
            files.push({ name: entry.name, path: fullPath, ext, size: stat.size, modified: stat.mtimeMs, supported: SUPPORTED_EXTENSIONS.has(ext) })
          } catch {}
        }
      }
    } catch {}
  }
  await walk(dirPath)
  return files
}

async function readFileContent(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()
  try {
    if (ext === '.pdf') {
      const pdfParse = await import('pdf-parse')
      const data = await pdfParse.default(await fs.readFile(filePath))
      return data.text
    } else if (ext === '.docx') {
      const mammoth = await import('mammoth')
      return (await mammoth.extractRawText({ path: filePath })).value
    } else {
      return await fs.readFile(filePath, 'utf-8')
    }
  } catch (err) {
    console.error(`[readFile] ${filePath}:`, err)
    return ''
  }
}

/**
 * Read a binary media file and return it as base64 with its MIME type,
 * ready to be passed directly to the Gemini Embedding API as inlineData.
 */
async function readFileBinary(
  filePath: string
): Promise<{ base64: string; mimeType: string } | null> {
  const ext = path.extname(filePath).toLowerCase()
  const mimeType = BINARY_MIME[ext]
  if (!mimeType) return null
  try {
    const buffer = await fs.readFile(filePath)
    return { base64: buffer.toString('base64'), mimeType }
  } catch (err) {
    console.error(`[readFileBinary] ${filePath}:`, err)
    return null
  }
}

async function getDirectoryTree(dirPath: string): Promise<DirNode> {
  async function buildTree(dir: string, depth = 0): Promise<DirNode> {
    const name = path.basename(dir)
    const node: DirNode = { name, path: dir, type: 'directory', children: [] }
    if (depth > 4) return node
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      const sorted = [...entries].sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })
      for (const entry of sorted) {
        if (entry.name.startsWith('.') && entry.name !== '.env') continue
        if (IGNORE_DIRS.has(entry.name)) continue
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          node.children!.push(await buildTree(fullPath, depth + 1))
        } else {
          node.children!.push({ name: entry.name, path: fullPath, type: 'file', ext: path.extname(entry.name).toLowerCase() })
        }
      }
    } catch {}
    return node
  }
  return buildTree(dirPath)
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.openfiles')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  // Proxy all HTTP requests destined for the local ChromaDB server through the
  // main process so CORS never applies.  The Rust-based ChromaDB binary doesn't
  // send CORS headers AND returns non-2xx for OPTIONS preflight, so the renderer
  // (browser context) can never reach it directly.  `protocol.handle('http')`
  // intercepts every HTTP request; we forward ChromaDB traffic via `net.fetch`
  // (main-process networking, no CORS) and add the required headers.  All other
  // traffic (Vite dev server, external APIs) passes through unchanged.
  protocol.handle('http', async (request) => {
    const url = new URL(request.url)
    const isChroma = url.hostname === 'localhost' && url.port === String(chromaPort)

    if (!isChroma) {
      return net.fetch(request, { bypassCustomProtocolHandlers: true })
    }

    // Respond to CORS preflight directly — ChromaDB doesn't handle OPTIONS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Max-Age': '86400'
        }
      })
    }

    // Forward the real request and add CORS headers to the response
    const response = await net.fetch(request, { bypassCustomProtocolHandlers: true })
    const headers = new Headers(response.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    })
  })

  // Window controls
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize())
  ipcMain.handle('window:close', () => mainWindow?.close())

  // Dialogs
  ipcMain.handle('dialog:openDirectory', async () => {
    if (!mainWindow) return null
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], title: 'Select Directory to Index' })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('dialog:openFile', async () => {
    if (!mainWindow) return null
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], title: 'Select File for Similarity Search' })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('dialog:openFileForBinary', async () => {
    if (!mainWindow) return null
    const r = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: 'Locate chroma binary',
      filters: [
        { name: 'Executable', extensions: ['exe', 'EXE', ''] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    return r.canceled ? null : r.filePaths[0]
  })

  // File system
  ipcMain.handle('fs:scanDirectory', async (_, dirPath: string) => scanDirectory(dirPath))
  ipcMain.handle('fs:readFileContent', async (_, filePath: string) => readFileContent(filePath))
  ipcMain.handle('fs:readFileBinary', async (_, filePath: string) => readFileBinary(filePath))
  ipcMain.handle('fs:getDirectoryTree', async (_, dirPath: string) => getDirectoryTree(dirPath))
  ipcMain.handle('fs:getFileStat', async (_, filePath: string) => {
    try { const s = await fs.stat(filePath); return { size: s.size, modified: s.mtimeMs } } catch { return null }
  })

  // ChromaDB
  ipcMain.handle('chroma:start', async (_, opts: StartChromaOptions = {}) => startChromaServer(opts))
  ipcMain.handle('chroma:getDataPath', () => join(app.getPath('userData'), 'chroma_data'))
  ipcMain.handle('chroma:isReady', () => chromaReady)
  ipcMain.handle('chroma:detect', (_, userPath?: string) => {
    const { bin, checked } = findChromaBinary(userPath)
    return { bin, checked }
  })

  // Shell
  ipcMain.handle('shell:openPath', async (_, filePath: string) => shell.openPath(filePath))
  ipcMain.handle('shell:showItemInFolder', (_, filePath: string) => shell.showItemInFolder(filePath))

  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  if (chromaProcess) { chromaProcess.kill(); chromaProcess = null }
  if (process.platform !== 'darwin') app.quit()
})
