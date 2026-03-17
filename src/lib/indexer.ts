import type { FileInfo, IndexedFile, AppSettings } from '@/types'
import { chunkText, generateSnippet, isBinaryMediaFile } from './fileParser'
import {
  getOrCreateCollection,
  addDocuments,
  addDocumentsWithEmbeddings,
  embedMultimodal,
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
 * Text/code files are chunked and embedded via the collection's embedding function.
 * Binary media files (images, audio, video) are embedded directly via the
 * Gemini Embedding 2 multimodal API and stored with pre-computed vectors.
 *
 * Pass `existingCollectionName` to reuse the collection that was created during
 * a previous indexing run (important when only indexing a subset of files).
 */
export async function indexFiles(
  files: FileInfo[],
  settings: AppSettings,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
  existingCollectionName?: string
): Promise<{ collectionName: string; result: IndexResult }> {
  const supported = files.filter((f) => f.supported)
  const collectionName = existingCollectionName ?? collectionNameFromDir(
    files[0]?.path.split(/[/\\]/).slice(0, -1).join('/') ?? 'openfiles'
  )

  const collection = await getOrCreateCollection(collectionName)
  const result: IndexResult = { indexed: 0, skipped: 0, errors: [] }

  for (let i = 0; i < supported.length; i++) {
    if (signal?.aborted) break

    const file = supported[i]
    onProgress(i, supported.length, file.name)

    try {
      if (isBinaryMediaFile(file.ext)) {
        await indexBinaryFile(file, collection, result)
      } else {
        await indexTextFile(file, collection, settings, result)
      }
    } catch (err) {
      result.errors.push(`${file.name}: ${String(err)}`)
    }
  }

  onProgress(supported.length, supported.length, '')
  return { collectionName, result }
}

async function indexBinaryFile(
  file: FileInfo,
  collection: Collection,
  result: IndexResult
): Promise<void> {
  const binary = await window.api.readFileBinary(file.path)
  if (!binary) { result.skipped++; return }

  await deleteByFilePath(collection, file.path)

  const embedding = await embedMultimodal(binary.base64, binary.mimeType)
  const mediaType = binary.mimeType.split('/')[0] // 'image' | 'audio' | 'video'
  const label = `[${mediaType}] ${file.name}`

  await addDocumentsWithEmbeddings({
    collection,
    ids: [`${encodeId(file.path)}::0`],
    embeddings: [embedding],
    documents: [label],
    metadatas: [{
      filePath: file.path,
      fileName: file.name,
      ext: file.ext,
      size: file.size,
      modified: file.modified,
      chunkIndex: 0,
      charStart: 0,
      charEnd: 0,
      snippet: label,
      mediaType: binary.mimeType
    }]
  })
  result.indexed++
}

async function indexTextFile(
  file: FileInfo,
  collection: Collection,
  settings: AppSettings,
  result: IndexResult
): Promise<void> {
  const text = await window.api.readFileContent(file.path)
  if (!text?.trim()) { result.skipped++; return }

  await deleteByFilePath(collection, file.path)

  const chunks = chunkText(text, settings.chunkSize, settings.chunkOverlap, file.ext)
  if (chunks.length === 0) { result.skipped++; return }

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
    if (isBinaryMediaFile(file.ext)) {
      const binary = await window.api.readFileBinary(file.path)
      if (!binary) return null

      await deleteByFilePath(collection, file.path)

      const embedding = await embedMultimodal(binary.base64, binary.mimeType)
      const mediaType = binary.mimeType.split('/')[0]
      const label = `[${mediaType}] ${file.name}`

      await addDocumentsWithEmbeddings({
        collection,
        ids: [`${encodeId(file.path)}::0`],
        embeddings: [embedding],
        documents: [label],
        metadatas: [{
          filePath: file.path,
          fileName: file.name,
          ext: file.ext,
          size: file.size,
          modified: file.modified,
          chunkIndex: 0,
          charStart: 0,
          charEnd: 0,
          snippet: label,
          mediaType: binary.mimeType
        }]
      })

      return { path: file.path, name: file.name, ext: file.ext, size: file.size, modified: file.modified, chunkCount: 1, indexedAt: Date.now() }
    }

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
