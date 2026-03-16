/**
 * Text chunking utilities for the renderer process.
 * Actual file content reading is handled by the Electron main process (via IPC).
 */

export interface TextChunk {
  text: string
  index: number
  charStart: number
  charEnd: number
}

const CODE_EXTENSIONS = new Set([
  '.py', '.js', '.ts', '.jsx', '.tsx', '.rs', '.go', '.java',
  '.c', '.cpp', '.h', '.hpp', '.rb', '.php', '.swift', '.kt',
  '.scala', '.r', '.sql', '.sh', '.bash', '.zsh', '.vue',
  '.svelte', '.astro', '.mdx'
])

const MARKUP_EXTENSIONS = new Set(['.html', '.xml', '.svg'])

/**
 * Returns an approximate token count (4 chars ≈ 1 token)
 */
export function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Cleans raw extracted text: normalises whitespace, removes null bytes, etc.
 */
export function cleanText(text: string): string {
  return text
    .replace(/\0/g, '')                        // null bytes
    .replace(/\r\n/g, '\n')                    // CRLF → LF
    .replace(/\r/g, '\n')                      // CR → LF
    .replace(/[ \t]+\n/g, '\n')               // trailing whitespace
    .replace(/\n{4,}/g, '\n\n\n')             // excessive blank lines
    .trim()
}

/**
 * Splits text into overlapping chunks of approximately `chunkSize` tokens.
 */
export function chunkText(
  text: string,
  chunkSize = 512,
  overlap = 64,
  ext = '.txt'
): TextChunk[] {
  const cleaned = cleanText(text)
  if (!cleaned) return []

  const chunks: TextChunk[] = []
  const chunkChars = chunkSize * 4
  const overlapChars = overlap * 4

  // For code files, try to split on function/class boundaries first
  if (CODE_EXTENSIONS.has(ext)) {
    return chunkCode(cleaned, chunkChars, overlapChars)
  }

  // For markdown, split on headings
  if (ext === '.md' || ext === '.mdx') {
    return chunkMarkdown(cleaned, chunkChars, overlapChars)
  }

  // Default: split on paragraphs, then sentences
  return chunkParagraphs(cleaned, chunkChars, overlapChars)
}

function chunkParagraphs(text: string, chunkChars: number, overlapChars: number): TextChunk[] {
  const paragraphs = text.split(/\n\n+/)
  const chunks: TextChunk[] = []
  let current = ''
  let charStart = 0
  let chunkIndex = 0
  let pos = 0

  for (const para of paragraphs) {
    const paraWithBreak = para + '\n\n'

    if (current.length + paraWithBreak.length > chunkChars && current.length > 0) {
      chunks.push({ text: current.trim(), index: chunkIndex++, charStart, charEnd: pos })
      // Overlap: keep last `overlapChars` characters
      const overlap = current.slice(-overlapChars)
      charStart = pos - overlap.length
      current = overlap + paraWithBreak
    } else {
      current += paraWithBreak
    }

    pos += paraWithBreak.length
  }

  if (current.trim()) {
    chunks.push({ text: current.trim(), index: chunkIndex, charStart, charEnd: pos })
  }

  return chunks
}

function chunkMarkdown(text: string, chunkChars: number, overlapChars: number): TextChunk[] {
  // Split on headings (# ## ###)
  const sections = text.split(/(?=^#{1,3} )/m)
  if (sections.length <= 1) return chunkParagraphs(text, chunkChars, overlapChars)

  const chunks: TextChunk[] = []
  let chunkIndex = 0
  let pos = 0

  for (const section of sections) {
    if (!section.trim()) { pos += section.length; continue }

    if (section.length <= chunkChars) {
      chunks.push({ text: section.trim(), index: chunkIndex++, charStart: pos, charEnd: pos + section.length })
      pos += section.length
    } else {
      // Section too long: fall back to paragraph chunking within the section
      const subChunks = chunkParagraphs(section, chunkChars, overlapChars)
      for (const sc of subChunks) {
        chunks.push({ ...sc, index: chunkIndex++, charStart: pos + sc.charStart, charEnd: pos + sc.charEnd })
      }
      pos += section.length
    }
  }

  return chunks
}

function chunkCode(text: string, chunkChars: number, overlapChars: number): TextChunk[] {
  // Try to split on top-level function/class definitions
  const lines = text.split('\n')
  const chunks: TextChunk[] = []
  let current = ''
  let charStart = 0
  let chunkIndex = 0
  let pos = 0

  for (const line of lines) {
    const lineWithBreak = line + '\n'
    const isTopLevel =
      /^(def |class |function |const |let |var |export |async function |pub fn |fn |func |package |import )/.test(line)

    if (isTopLevel && current.length > chunkChars * 0.5) {
      // Flush current chunk
      chunks.push({ text: current.trim(), index: chunkIndex++, charStart, charEnd: pos })
      const overlap = current.slice(-overlapChars)
      charStart = pos - overlap.length
      current = overlap + lineWithBreak
    } else if (current.length + lineWithBreak.length > chunkChars && current.length > 0) {
      chunks.push({ text: current.trim(), index: chunkIndex++, charStart, charEnd: pos })
      const overlap = current.slice(-overlapChars)
      charStart = pos - overlap.length
      current = overlap + lineWithBreak
    } else {
      current += lineWithBreak
    }

    pos += lineWithBreak.length
  }

  if (current.trim()) {
    chunks.push({ text: current.trim(), index: chunkIndex, charStart, charEnd: pos })
  }

  return chunks
}

/**
 * Generates a preview snippet from a chunk, optionally highlighting a query term.
 */
export function generateSnippet(text: string, maxLength = 200): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= maxLength) return trimmed
  return trimmed.slice(0, maxLength - 3) + '...'
}

/**
 * Returns a human-readable file size string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/**
 * Returns a human-readable relative time string.
 */
export function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 30) return `${days}d ago`
  return new Date(ms).toLocaleDateString()
}

/**
 * Maps a file extension to an icon name and colour class.
 */
export function getFileIconInfo(ext: string): { icon: string; color: string } {
  const map: Record<string, { icon: string; color: string }> = {
    '.pdf':  { icon: 'file-text', color: 'text-red-400' },
    '.docx': { icon: 'file-text', color: 'text-blue-400' },
    '.doc':  { icon: 'file-text', color: 'text-blue-400' },
    '.md':   { icon: 'file-text', color: 'text-purple-400' },
    '.mdx':  { icon: 'file-text', color: 'text-purple-400' },
    '.txt':  { icon: 'file-text', color: 'text-surface-300' },
    '.csv':  { icon: 'table', color: 'text-green-400' },
    '.py':   { icon: 'code', color: 'text-yellow-400' },
    '.js':   { icon: 'code', color: 'text-yellow-300' },
    '.ts':   { icon: 'code', color: 'text-blue-300' },
    '.jsx':  { icon: 'code', color: 'text-cyan-400' },
    '.tsx':  { icon: 'code', color: 'text-cyan-300' },
    '.rs':   { icon: 'code', color: 'text-orange-400' },
    '.go':   { icon: 'code', color: 'text-cyan-500' },
    '.java': { icon: 'code', color: 'text-red-300' },
    '.json': { icon: 'braces', color: 'text-yellow-200' },
    '.yaml': { icon: 'braces', color: 'text-pink-400' },
    '.yml':  { icon: 'braces', color: 'text-pink-400' },
    '.toml': { icon: 'braces', color: 'text-orange-300' },
    '.html': { icon: 'code', color: 'text-orange-400' },
    '.css':  { icon: 'code', color: 'text-blue-400' },
    '.scss': { icon: 'code', color: 'text-pink-300' },
    '.sql':  { icon: 'database', color: 'text-green-300' },
    '.sh':   { icon: 'terminal', color: 'text-green-400' },
    '.bash': { icon: 'terminal', color: 'text-green-400' },
  }
  return map[ext] ?? { icon: 'file', color: 'text-surface-400' }
}

export function isTextFile(ext: string): boolean {
  return !new Set(['.pdf', '.docx', '.doc']).has(ext)
}

export function isSupportedExtension(ext: string): boolean {
  const SUPPORTED = new Set([
    '.txt', '.md', '.pdf', '.docx', '.csv', '.mdx',
    '.py', '.js', '.ts', '.jsx', '.tsx',
    '.rs', '.go', '.java', '.c', '.cpp', '.h', '.hpp',
    '.rb', '.php', '.swift', '.kt', '.scala',
    '.r', '.sql', '.sh', '.bash', '.zsh',
    '.yaml', '.yml', '.json', '.toml', '.ini', '.env',
    '.xml', '.html', '.css', '.scss', '.sass', '.less',
    '.vue', '.svelte', '.astro'
  ])
  return SUPPORTED.has(ext)
}
