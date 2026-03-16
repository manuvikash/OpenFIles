import type { FileInfo, IndexedFile, AppSettings } from '@/types'
import { chunkText, generateSnippet } from './fileParser'
import {
  getOrCreateCollection,
  addDocuments,
  deleteByFilePath,
  countDocuments,
  deleteCollection,
  type AddDocumentsParams
} from './chromaClient'
import type { Collection } from 'chromadb'

export type ProgressCallback = (indexed: number, total: number, currentFile: string) => void

export interface IndexResult {
  indexed: number
  skipped: number
  errors: string[]
}

/**
 * Derive a stable ChromaDB collection name from the directory path.
 * Collection names must be 3–63 chars, alphanumeric + hyphens, no consecutive hyphens.
 */
export function collectionNameFromDir(dirPath: string): string {
  const base = dirPath
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 55)

  return `of-${base}` // prefix ensures ≥ 3 chars
}

/**
 * Index a list of files into ChromaDB.
 */
export async function indexFiles(
  files: FileInfo[],
  settings: AppSettings,
  onProgress: ProgressCallback,
  signal?: AbortSignal
): Promise<{ collectionName: string; result: IndexResult }> {
  const supported = files.filter((f) => f.supported)
  const collectionName = collectionNameFromDir(
    files[0]?.path.split(/[/\\]/).slice(0, -1).join('/') ?? 'openfiles'
  )

  const collection = await getOrCreateCollection(collectionName)
  const result: IndexResult = { indexed: 0, skipped: 0, errors: [] }

  for (let i = 0; i < supported.length; i++) {
    if (signal?.aborted) break

    const file = supported[i]
    onProgress(i, supported.length, file.name)

    try {
      const text = await window.api.readFileContent(file.path)
      if (!text?.trim()) { result.skipped++; continue }

      // Remove old chunks for this file (re-index if content changed)
      await deleteByFilePath(collection, file.path)

      const chunks = chunkText(text, settings.chunkSize, settings.chunkOverlap, file.ext)
      if (chunks.length === 0) { result.skipped++; continue }

      const ids = chunks.map((_, idx) => `${encodeId(file.path)}::${idx}`)
      const documents = chunks.map((c) => c.text)
      const metadatas = chunks.map((c) => ({
        filePath: file.path,
        fileName: file.name,
        ext: file.ext,
        size: file.size,
        modified: file.modified,
        chunkIndex: c.index,
        charStart: c.charStart,
        charEnd: c.charEnd,
        snippet: generateSnippet(c.text, 300)
      }))

      await addDocuments({ collection, ids, documents, metadatas } as AddDocumentsParams)
      result.indexed++
    } catch (err) {
      result.errors.push(`${file.name}: ${String(err)}`)
    }
  }

  onProgress(supported.length, supported.length, '')
  return { collectionName, result }
}

/**
 * Remove all indexed data for a specific file.
 */
export async function removeFileFromIndex(
  collection: Collection,
  filePath: string
): Promise<void> {
  await deleteByFilePath(collection, filePath)
}

/**
 * Re-index a single file (useful when file changes).
 */
export async function reindexFile(
  file: FileInfo,
  collection: Collection,
  settings: AppSettings
): Promise<IndexedFile | null> {
  try {
    const text = await window.api.readFileContent(file.path)
    if (!text?.trim()) return null

    await deleteByFilePath(collection, file.path)

    const chunks = chunkText(text, settings.chunkSize, settings.chunkOverlap, file.ext)
    if (chunks.length === 0) return null

    const ids = chunks.map((_, idx) => `${encodeId(file.path)}::${idx}`)
    const documents = chunks.map((c) => c.text)
    const metadatas = chunks.map((c) => ({
      filePath: file.path,
      fileName: file.name,
      ext: file.ext,
      size: file.size,
      modified: file.modified,
      chunkIndex: c.index,
      charStart: c.charStart,
      charEnd: c.charEnd,
      snippet: generateSnippet(c.text, 300)
    }))

    await addDocuments({ collection, ids, documents, metadatas } as AddDocumentsParams)

    return {
      path: file.path,
      name: file.name,
      ext: file.ext,
      size: file.size,
      modified: file.modified,
      chunkCount: chunks.length,
      indexedAt: Date.now()
    }
  } catch {
    return null
  }
}

/**
 * Clear all data in a collection and delete it.
 */
export async function clearIndex(collectionName: string): Promise<void> {
  await deleteCollection(collectionName)
}

/**
 * Count total vectors in a collection.
 */
export async function getIndexSize(collection: Collection): Promise<number> {
  return countDocuments(collection)
}

/**
 * Encode a file path into a safe ID prefix for ChromaDB.
 */
function encodeId(filePath: string): string {
  return filePath.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-200)
}
