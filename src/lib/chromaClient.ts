import { ChromaClient, Collection } from 'chromadb'
import { GoogleGeminiEmbeddingFunction } from '@chroma-core/google-gemini'

let client: ChromaClient | null = null
let embeddingFunction: GoogleGeminiEmbeddingFunction | null = null
let chromaPort = 8765
let geminiApiKey = ''
let embeddingModelName = 'gemini-embedding-2-preview'

export function initChromaClient(port = 8765): ChromaClient {
  chromaPort = port
  client = new ChromaClient({ path: `http://localhost:${port}` })
  return client
}

export function getClient(): ChromaClient {
  if (!client) throw new Error('ChromaDB client not initialised. Call initChromaClient() first.')
  return client
}

export function initEmbeddingFunction(apiKey: string, model = 'gemini-embedding-2-preview'): GoogleGeminiEmbeddingFunction {
  geminiApiKey = apiKey
  embeddingModelName = model
  embeddingFunction = new GoogleGeminiEmbeddingFunction({ apiKey, modelName: model })
  return embeddingFunction
}

export function getEmbeddingFunction(): GoogleGeminiEmbeddingFunction {
  if (!embeddingFunction) throw new Error('Embedding function not initialised. Call initEmbeddingFunction() first.')
  return embeddingFunction
}

export async function getOrCreateCollection(name: string): Promise<Collection> {
  const c = getClient()
  const ef = getEmbeddingFunction()
  // cosine similarity is correct for semantic embeddings.
  // L2 (default) clusters all distances tightly in high-dim space.
  return c.getOrCreateCollection({
    name,
    embeddingFunction: ef,
    metadata: { 'hnsw:space': 'cosine' }
  })
}

export async function getCollection(name: string): Promise<Collection | null> {
  try {
    const c = getClient()
    const ef = getEmbeddingFunction()
    return await c.getCollection({ name, embeddingFunction: ef })
  } catch {
    return null
  }
}

export async function deleteCollection(name: string): Promise<void> {
  const c = getClient()
  try {
    await c.deleteCollection({ name })
  } catch {}
}

export async function listCollections(): Promise<string[]> {
  const c = getClient()
  const cols = await c.listCollections()
  return cols.map((col) => (typeof col === 'string' ? col : col.name))
}

export async function heartbeat(): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${chromaPort}/api/v2/heartbeat`)
    return res.ok
  } catch {
    return false
  }
}

// ─── Gemini embedding helpers ─────────────────────────────────────────────────

/**
 * Low-level Gemini embedContent call.
 * taskType distinguishes query vs document embedding spaces:
 *   RETRIEVAL_DOCUMENT — used when indexing content
 *   RETRIEVAL_QUERY    — used when embedding a search query (better recall)
 */
async function geminiEmbed(
  parts: unknown[],
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'
): Promise<number[]> {
  if (!geminiApiKey) throw new Error('Gemini API key not set. Open Settings and add your API key.')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${embeddingModelName}:embedContent?key=${geminiApiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${embeddingModelName}`,
      taskType,
      content: { parts }
    })
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gemini embed failed (${res.status}): ${body}`)
  }
  const data = await res.json()
  const values = data.embedding?.values as number[] | undefined
  if (!values?.length) throw new Error(`Gemini embed returned empty vector. Response: ${JSON.stringify(data)}`)
  console.debug(`[embed] ${taskType} → ${values.length}-dim vector, first3: [${values.slice(0, 3).map(v => v.toFixed(4)).join(', ')}]`)
  return values
}

/**
 * Embed a search query text with RETRIEVAL_QUERY task type.
 * This is the correct task type for queries — it maps into a different
 * (asymmetric) embedding subspace than documents, significantly improving recall.
 */
export async function embedQuery(text: string): Promise<number[]> {
  return geminiEmbed([{ text }], 'RETRIEVAL_QUERY')
}

/**
 * Embed a binary media file (image/audio/video) for indexing.
 */
export async function embedMultimodal(base64: string, mimeType: string): Promise<number[]> {
  return geminiEmbed([{ inlineData: { mimeType, data: base64 } }], 'RETRIEVAL_DOCUMENT')
}

// ─── Collection Helpers ───────────────────────────────────────────────────────

export interface AddDocumentsParams {
  collection: Collection
  ids: string[]
  documents: string[]
  metadatas: Record<string, string | number | boolean>[]
}

export async function addDocuments(params: AddDocumentsParams): Promise<void> {
  const { collection, ids, documents, metadatas } = params
  const BATCH = 100
  for (let i = 0; i < ids.length; i += BATCH) {
    await collection.add({
      ids: ids.slice(i, i + BATCH),
      documents: documents.slice(i, i + BATCH),
      metadatas: metadatas.slice(i, i + BATCH)
    })
  }
}

export interface AddWithEmbeddingsParams {
  collection: Collection
  ids: string[]
  embeddings: number[][]
  documents: string[]
  metadatas: Record<string, string | number | boolean>[]
}

export async function addDocumentsWithEmbeddings(params: AddWithEmbeddingsParams): Promise<void> {
  const { collection, ids, embeddings, documents, metadatas } = params
  await collection.add({ ids, embeddings, documents, metadatas })
}

export interface QueryParams {
  collection: Collection
  queryTexts: string[]
  nResults?: number
  where?: Record<string, unknown>
}

export interface QueryResult {
  id: string
  document: string
  metadata: Record<string, string | number | boolean>
  distance: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQueryResponse = any

export async function queryCollection(params: QueryParams): Promise<QueryResult[]> {
  const { collection, queryTexts, nResults = 20 } = params
  const results: AnyQueryResponse = await collection.query({ queryTexts, nResults })
  return parseQueryResults(results)
}

/**
 * Query using a pre-computed embedding — bypasses the collection's default
 * embedding function so we can use RETRIEVAL_QUERY task type.
 */
export async function queryCollectionByVector(params: {
  collection: Collection
  queryEmbedding: number[]
  nResults?: number
}): Promise<QueryResult[]> {
  const { collection, queryEmbedding, nResults = 20 } = params
  console.debug(`[query] sending ${queryEmbedding.length}-dim vector to ChromaDB, nResults=${nResults}`)
  const results: AnyQueryResponse = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults
  })
  const parsed = parseQueryResults(results)
  console.debug(
    `[query] ChromaDB returned ${parsed.length} results:`,
    parsed.slice(0, 5).map(r => ({ file: r.metadata.fileName, dist: r.distance.toFixed(4) }))
  )
  return parsed
}

function parseQueryResults(results: AnyQueryResponse): QueryResult[] {
  const output: QueryResult[] = []
  if (!results?.ids?.[0]) return output
  for (let i = 0; i < results.ids[0].length; i++) {
    output.push({
      id: results.ids[0][i],
      document: results.documents?.[0]?.[i] ?? '',
      metadata: (results.metadatas?.[0]?.[i] ?? {}) as Record<string, string | number | boolean>,
      distance: results.distances?.[0]?.[i] ?? 1
    })
  }
  return output
}

export async function deleteByFilePath(collection: Collection, filePath: string): Promise<void> {
  try {
    await collection.delete({ where: { filePath } })
  } catch {}
}

export async function countDocuments(collection: Collection): Promise<number> {
  return collection.count()
}
