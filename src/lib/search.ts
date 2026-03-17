import type { SearchResult, AppSettings } from '@/types'
import {
  getCollection,
  queryCollection,
  queryCollectionByVector,
  embedQuery
} from './chromaClient'
import { chunkText, generateSnippet } from './fileParser'

/**
 * Semantic search.
 *
 * Embeds the query with RETRIEVAL_QUERY task type so it lands in the correct
 * asymmetric subspace for retrieval (vs RETRIEVAL_DOCUMENT used at index time).
 * Then queries ChromaDB by vector (bypassing the collection's embedding function
 * which always uses RETRIEVAL_DOCUMENT).
 *
 * `directoryFilter` — when provided, only results whose filePath starts with
 * this prefix are returned, guaranteeing results come from the open folder.
 */
export async function semanticSearch(
  query: string,
  collectionName: string,
  settings: AppSettings,
  directoryFilter?: string
): Promise<SearchResult[]> {
  console.debug(`[search] query="${query}", collection="${collectionName}", dir="${directoryFilter}"`)

  const collection = await getCollection(collectionName)
  if (!collection) {
    console.warn('[search] collection not found:', collectionName)
    return []
  }

  const queryEmbedding = await embedQuery(query)

  // Fetch a larger pool so the directory filter still yields enough results.
  const raw = await queryCollectionByVector({
    collection,
    queryEmbedding,
    nResults: settings.maxResults * 4
  })

  const filtered = directoryFilter ? filterByDirectory(raw, directoryFilter) : raw
  const results = deduplicateByFile(filtered, settings.maxResults)
  console.debug(`[search] returning ${results.length} deduplicated results (pool: ${raw.length}, after dir filter: ${filtered.length})`)
  return results
}

/**
 * File similarity search: use the content of a file as the query.
 *
 * `directoryFilter` — when provided, only results whose filePath starts with
 * this prefix are returned.
 */
export async function fileSimilaritySearch(
  filePath: string,
  collectionName: string,
  settings: AppSettings,
  directoryFilter?: string
): Promise<SearchResult[]> {
  const collection = await getCollection(collectionName)
  if (!collection) return []

  const text = await window.api.readFileContent(filePath)
  if (!text?.trim()) return []

  const ext = filePath.split('.').pop() ? `.${filePath.split('.').pop()!}` : '.txt'
  const chunks = chunkText(text, settings.chunkSize, settings.chunkOverlap, ext)
  if (chunks.length === 0) return []

  const queryText = chunks.slice(0, 3).map((c) => c.text).join('\n\n')

  const raw = await queryCollection({
    collection,
    queryTexts: [queryText],
    nResults: settings.maxResults * 4
  })

  const sameFileRemoved = raw.filter((r) => String(r.metadata.filePath) !== filePath)
  const filtered = directoryFilter ? filterByDirectory(sameFileRemoved, directoryFilter) : sameFileRemoved
  return deduplicateByFile(filtered, settings.maxResults)
}

/**
 * Normalise a Windows or POSIX path to use forward slashes and lowercase,
 * so prefix matching works regardless of drive-letter casing or separator style.
 */
function normalisePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase()
}

function filterByDirectory<T extends { metadata: Record<string, string | number | boolean> }>(
  items: T[],
  directory: string
): T[] {
  const prefix = normalisePath(directory)
  // Ensure the prefix ends with a separator so "D:/foo" doesn't match "D:/foobar"
  const prefixWithSep = prefix.endsWith('/') ? prefix : `${prefix}/`
  return items.filter((item) => normalisePath(String(item.metadata.filePath)).startsWith(prefixWithSep))
}

function deduplicateByFile(
  raw: Array<{ id: string; document: string; metadata: Record<string, string | number | boolean>; distance: number }>,
  maxResults: number
): SearchResult[] {
  const best = new Map<string, typeof raw[0]>()

  for (const item of raw) {
    const fp = String(item.metadata.filePath)
    const existing = best.get(fp)
    if (!existing || item.distance < existing.distance) {
      best.set(fp, item)
    }
  }

  return Array.from(best.values())
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxResults)
    .map((item) => ({
      filePath: String(item.metadata.filePath),
      fileName: String(item.metadata.fileName),
      ext: String(item.metadata.ext),
      score: Math.max(0, 1 - item.distance),
      snippet: String(item.metadata.snippet || generateSnippet(item.document)),
      chunkIndex: Number(item.metadata.chunkIndex)
    }))
}
