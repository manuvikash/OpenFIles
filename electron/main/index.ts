import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { promises as fs } from 'fs'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'

let mainWindow: BrowserWindow | null = null
let chromaProcess: ChildProcess | null = null
let chromaReady = false

const SUPPORTED_EXTENSIONS = new Set([
  '.txt', '.md', '.pdf', '.docx', '.csv',
  '.py', '.js', '.ts', '.jsx', '.tsx',
  '.rs', '.go', '.java', '.c', '.cpp', '.h', '.hpp',
  '.rb', '.php', '.swift', '.kt', '.scala',
  '.r', '.sql', '.sh', '.bash', '.zsh',
  '.yaml', '.yml', '.json', '.toml', '.ini', '.env',
  '.xml', '.html', '.css', '.scss', '.sass', '.less',
  '.vue', '.svelte', '.astro', '.mdx'
])

const IGNORE_DIRS = new Set([
  'node_modules', '__pycache__', '.git', '.svn', '.hg',
  'dist', 'build', 'out', '.next', '.nuxt', '.vite',
  'coverage', '.nyc_output', 'vendor', 'target', '.cargo',
  '.idea', '.vscode', '__MACOSX', 'thumbs.db'
])

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
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

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

async function startChromaServer(): Promise<{ success: boolean; port: number; message: string }> {
  const port = 8765
  const dataPath = join(app.getPath('userData'), 'chroma_data')

  try {
    await fs.mkdir(dataPath, { recursive: true })
  } catch {}

  // Check if already running
  if (chromaReady) {
    return { success: true, port, message: 'ChromaDB already running' }
  }

  return new Promise((resolve) => {
    let settled = false

    const settle = (result: { success: boolean; port: number; message: string }) => {
      if (!settled) {
        settled = true
        if (result.success) chromaReady = true
        resolve(result)
      }
    }

    try {
      // Try to start chroma via python -m chromadb.cli.cli
      const args = ['run', '--path', dataPath, '--port', String(port)]

      chromaProcess = spawn('chroma', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        detached: false
      })

      const onData = (data: Buffer) => {
        const text = data.toString()
        console.log('[chroma]', text)
        if (
          text.includes('Uvicorn running') ||
          text.includes('Application startup complete') ||
          text.includes('Started server process') ||
          text.includes(`port ${port}`) ||
          text.includes('0.0.0.0:8765')
        ) {
          settle({ success: true, port, message: `ChromaDB running on port ${port}` })
        }
      }

      chromaProcess.stdout?.on('data', onData)
      chromaProcess.stderr?.on('data', onData)

      chromaProcess.on('error', (err) => {
        settle({ success: false, port, message: `Failed to start ChromaDB: ${err.message}` })
      })

      chromaProcess.on('close', (code) => {
        if (!settled) {
          settle({ success: false, port, message: `ChromaDB exited with code ${code}` })
        }
        chromaReady = false
      })

      // Timeout — assume it started (might already be running)
      setTimeout(() => {
        settle({ success: true, port, message: `ChromaDB startup timeout — assuming running on port ${port}` })
      }, 8000)
    } catch (err) {
      settle({ success: false, port, message: `Exception: ${String(err)}` })
    }
  })
}

interface FileInfo {
  name: string
  path: string
  ext: string
  size: number
  modified: number
  supported: boolean
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
            // Skip very large files (> 10MB) and empty files
            if (stat.size === 0 || stat.size > 10 * 1024 * 1024) continue
            files.push({
              name: entry.name,
              path: fullPath,
              ext,
              size: stat.size,
              modified: stat.mtimeMs,
              supported: SUPPORTED_EXTENSIONS.has(ext)
            })
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
      const buffer = await fs.readFile(filePath)
      const data = await pdfParse.default(buffer)
      return data.text
    } else if (ext === '.docx') {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ path: filePath })
      return result.value
    } else {
      const content = await fs.readFile(filePath, 'utf-8')
      return content
    }
  } catch (err) {
    console.error(`[readFile] Error reading ${filePath}:`, err)
    return ''
  }
}

async function getDirectoryTree(dirPath: string): Promise<DirNode> {
  interface DirNode {
    name: string
    path: string
    type: 'file' | 'directory'
    children?: DirNode[]
    ext?: string
  }

  async function buildTree(dir: string, depth = 0): Promise<DirNode> {
    const name = path.basename(dir)
    const node: DirNode = { name, path: dir, type: 'directory', children: [] }

    if (depth > 4) return node

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      const sorted = entries.sort((a, b) => {
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
          node.children!.push({
            name: entry.name,
            path: fullPath,
            type: 'file',
            ext: path.extname(entry.name).toLowerCase()
          })
        }
      }
    } catch {}

    return node
  }

  return buildTree(dirPath)
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.openfiles')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Window control IPC
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.handle('window:close', () => mainWindow?.close())

  // Dialog IPC
  ipcMain.handle('dialog:openDirectory', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Directory to Index'
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:openFile', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: 'Select File for Similarity Search'
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // File system IPC
  ipcMain.handle('fs:scanDirectory', async (_, dirPath: string) => {
    return await scanDirectory(dirPath)
  })

  ipcMain.handle('fs:readFileContent', async (_, filePath: string) => {
    return await readFileContent(filePath)
  })

  ipcMain.handle('fs:getDirectoryTree', async (_, dirPath: string) => {
    return await getDirectoryTree(dirPath)
  })

  ipcMain.handle('fs:getFileStat', async (_, filePath: string) => {
    try {
      const stat = await fs.stat(filePath)
      return { size: stat.size, modified: stat.mtimeMs }
    } catch {
      return null
    }
  })

  // ChromaDB IPC
  ipcMain.handle('chroma:start', async () => {
    return await startChromaServer()
  })

  ipcMain.handle('chroma:getDataPath', () => {
    return join(app.getPath('userData'), 'chroma_data')
  })

  ipcMain.handle('chroma:isReady', () => chromaReady)

  // Shell IPC
  ipcMain.handle('shell:openPath', async (_, filePath: string) => {
    return await shell.openPath(filePath)
  })

  ipcMain.handle('shell:showItemInFolder', async (_, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (chromaProcess) {
    chromaProcess.kill()
    chromaProcess = null
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
