import type { SearchResult, AppSettings } from '@/types'
import { getCollection, queryCollection } from './chromaClient'
import { chunkText, generateSnippet } from './fileParser'

/**
 * Semantic search: convert query to embedding and find similar chunks.
 */
export async function semanticSearch(
  query: string,
  collectionName: string,
  settings: AppSettings
): Promise<SearchResult[]> {
  const collection = await getCollection(collectionName)
  if (!collection) return []

  const raw = await queryCollection({
    collection,
    queryTexts: [query],
    nResults: settings.maxResults * 2  // fetch extra, deduplicate by file below
  })

  return deduplicateByFile(raw, settings.maxResults)
}

/**
 * File similarity search: use the content of a file as the query.
 */
export async function fileSimilaritySearch(
  filePath: string,
  collectionName: string,
  settings: AppSettings
): Promise<SearchResult[]> {
  const collection = await getCollection(collectionName)
  if (!collection) return []

  const text = await window.api.readFileContent(filePath)
  if (!text?.trim()) return []

  const ext = filePath.split('.').pop() ? `.${filePath.split('.').pop()!}` : '.txt'
  const chunks = chunkText(text, settings.chunkSize, settings.chunkOverlap, ext)

  if (chunks.length === 0) return []

  // Use the first few chunks as the query (representative sample)
  const queryText = chunks
    .slice(0, 3)
    .map((c) => c.text)
    .join('\n\n')

  const raw = await queryCollection({
    collection,
    queryTexts: [queryText],
    nResults: settings.maxResults * 2
  })

  // Exclude the query file itself from results
  const filtered = raw.filter(
    (r) => String(r.metadata.filePath) !== filePath
  )

  return deduplicateByFile(filtered, settings.maxResults)
}

/**
 * Deduplicate results so only the best-scoring chunk per file is returned.
 */
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
