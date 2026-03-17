import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close:    () => ipcRenderer.invoke('window:close'),

  // Dialogs
  openDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:openDirectory'),
  openFile:      (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile'),
  openFileForBinary: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFileForBinary'),

  // File system
  scanDirectory:    (dirPath: string)  => ipcRenderer.invoke('fs:scanDirectory',    dirPath),
  readFileContent:  (filePath: string) => ipcRenderer.invoke('fs:readFileContent',  filePath),
  readFileBinary:   (filePath: string) => ipcRenderer.invoke('fs:readFileBinary',   filePath),
  getDirectoryTree: (dirPath: string)  => ipcRenderer.invoke('fs:getDirectoryTree', dirPath),
  getFileStat:      (filePath: string) => ipcRenderer.invoke('fs:getFileStat',      filePath),

  // ChromaDB
  startChroma: (opts?: { customBinaryPath?: string; port?: number })
    : Promise<{ success: boolean; port: number; message: string }> =>
    ipcRenderer.invoke('chroma:start', opts ?? {}),

  detectChroma: (userPath?: string)
    : Promise<{ bin: string | null; checked: string[] }> =>
    ipcRenderer.invoke('chroma:detect', userPath),

  getChromaDataPath: (): Promise<string>  => ipcRenderer.invoke('chroma:getDataPath'),
  isChromaReady:     (): Promise<boolean> => ipcRenderer.invoke('chroma:isReady'),

  // Shell
  openPath:          (filePath: string) => ipcRenderer.invoke('shell:openPath',          filePath),
  showItemInFolder:  (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder',   filePath),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (err) {
    console.error(err)
  }
} else {
  // @ts-ignore (non-sandboxed fallback)
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
