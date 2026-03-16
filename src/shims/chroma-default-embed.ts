// Stub shim — we use Gemini embeddings, not chromadb's default (local) embedder.
export class DefaultEmbeddingFunction {
  async generate(_texts: string[]): Promise<number[][]> {
    throw new Error(
      'DefaultEmbeddingFunction is not available. Use GoogleGeminiEmbeddingFunction instead.'
    )
  }
}
export default DefaultEmbeddingFunction
