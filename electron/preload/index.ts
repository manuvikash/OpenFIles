import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // Dialogs
  openDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openDirectory'),
  openFile: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFile'),

  // File system
  scanDirectory: (dirPath: string): Promise<FileInfo[]> =>
    ipcRenderer.invoke('fs:scanDirectory', dirPath),
  readFileContent: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:readFileContent', filePath),
  getDirectoryTree: (dirPath: string): Promise<DirNode> =>
    ipcRenderer.invoke('fs:getDirectoryTree', dirPath),
  getFileStat: (filePath: string): Promise<{ size: number; modified: number } | null> =>
    ipcRenderer.invoke('fs:getFileStat', filePath),

  // ChromaDB
  startChroma: (): Promise<{ success: boolean; port: number; message: string }> =>
    ipcRenderer.invoke('chroma:start'),
  getChromaDataPath: (): Promise<string> =>
    ipcRenderer.invoke('chroma:getDataPath'),
  isChromaReady: (): Promise<boolean> =>
    ipcRenderer.invoke('chroma:isReady'),

  // Shell
  openPath: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('shell:openPath', filePath),
  showItemInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('shell:showItemInFolder', filePath)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}

// Type declarations for the renderer
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
