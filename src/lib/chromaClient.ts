import { ChromaClient, Collection } from 'chromadb'
import { GoogleGeminiEmbeddingFunction } from '@chroma-core/google-gemini'

let client: ChromaClient | null = null
let embeddingFunction: GoogleGeminiEmbeddingFunction | null = null

export function initChromaClient(port = 8765): ChromaClient {
  client = new ChromaClient({ path: `http://localhost:${port}` })
  return client
}

export function getClient(): ChromaClient {
  if (!client) throw new Error('ChromaDB client not initialised. Call initChromaClient() first.')
  return client
}

export function initEmbeddingFunction(apiKey: string, model = 'gemini-embedding-001'): GoogleGeminiEmbeddingFunction {
  embeddingFunction = new GoogleGeminiEmbeddingFunction({
    apiKey,
    modelName: model
  })
  return embeddingFunction
}

export function getEmbeddingFunction(): GoogleGeminiEmbeddingFunction {
  if (!embeddingFunction) throw new Error('Embedding function not initialised. Call initEmbeddingFunction() first.')
  return embeddingFunction
}

export async function getOrCreateCollection(name: string): Promise<Collection> {
  const c = getClient()
  const ef = getEmbeddingFunction()
  return c.getOrCreateCollection({ name, embeddingFunction: ef })
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
    const c = getClient()
    await c.heartbeat()
    return true
  } catch {
    return false
  }
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
  // ChromaDB has a limit of 5000 per batch — chunk if needed
  const BATCH = 100
  for (let i = 0; i < ids.length; i += BATCH) {
    await collection.add({
      ids: ids.slice(i, i + BATCH),
      documents: documents.slice(i, i + BATCH),
      metadatas: metadatas.slice(i, i + BATCH)
    })
  }
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

export async function queryCollection(params: QueryParams): Promise<QueryResult[]> {
  const { collection, queryTexts, nResults = 20, where } = params
  const results = await collection.query({
    queryTexts,
    nResults,
    ...(where ? { where } : {})
  })

  const output: QueryResult[] = []
  if (!results.ids?.[0]) return output

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
