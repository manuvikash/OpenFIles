# OpenFiles

Local semantic file search powered by Google Gemini embeddings and ChromaDB.

Search thousands of files using natural language or find files similar to a selected file — all running privately on your machine.

---

## Features

- **Semantic search** — Search by meaning, not just keywords. Ask things like _"meeting notes about Q3 budget"_ or _"machine learning research"_
- **File similarity search** — Select any indexed file and find related files
- **File explorer** — Browse your directory tree and view all files
- **Background indexing** — Index files asynchronously while the UI stays responsive
- **Persistent index** — ChromaDB stores embeddings locally; re-open the app without re-indexing
- **Supported file types** — `.txt`, `.md`, `.pdf`, `.docx`, `.csv`, `.py`, `.js`, `.ts`, `.jsx`, `.tsx`, `.rs`, `.go`, `.java`, `.c`, `.cpp`, `.h`, `.rb`, `.php`, `.swift`, `.kt`, `.sql`, `.sh`, `.yaml`, `.json`, `.toml`, `.html`, `.css`, `.scss`, and more

---

## Prerequisites

### 1. Node.js ≥ 18
Download from [nodejs.org](https://nodejs.org/).

### 2. Python ≥ 3.8 + ChromaDB
```bash
pip install chromadb
```
After installation, verify it works:
```bash
chroma --version
```

### 3. Google Gemini API Key
Get a free key at [Google AI Studio](https://aistudio.google.com/apikey).

---

## Quick Start

```bash
# Clone / open the project
cd OpenFiles

# Install Node.js dependencies
npm install

# Start in development mode
npm run dev
```

On first launch, click **Settings** (⚙️ top-right) and:
1. Paste your **Gemini API key**
2. Click **Start ChromaDB** (the app will launch the local vector DB)
3. Click **Test Connection** — you should see "Connected"
4. Save settings

---

## Usage

### Indexing a Directory

1. Click **Open Folder** in the left sidebar to select a directory
2. The file list populates automatically
3. Click **Index Files** in the main panel — a progress bar shows indexing status
4. When complete, the status bar shows the count of indexed files

### Semantic Search

1. Make sure the **Text** mode is selected in the toolbar (default)
2. Type a natural language query: `"annual report Q4"`, `"database migration script"`, `"TODO comments about auth"`
3. Press **Enter** or click **Search**
4. Results are ranked by similarity score and show a text preview

### File Similarity Search

1. Switch to **File** mode in the toolbar
2. Click the input field and select any file
3. Click **Search** — returns the most similar files from the index

### Opening Results

- Click any result card to **open the file** in the system default app
- Use the **Reveal** button to open the file's folder in Explorer

---

## Architecture

```
OpenFiles/
├── electron/
│   ├── main/index.ts       ← Electron main process
│   │                         (file system, dialogs, ChromaDB launcher)
│   └── preload/index.ts    ← IPC bridge (contextBridge)
├── src/
│   ├── components/         ← React UI components
│   │   ├── TitleBar.tsx
│   │   ├── Sidebar.tsx     ← Directory tree
│   │   ├── Toolbar.tsx     ← Search bar + mode toggle
│   │   ├── FileGrid.tsx    ← File list + index controls
│   │   ├── ResultsPanel.tsx← Search results
│   │   └── SettingsModal.tsx
│   ├── lib/
│   │   ├── chromaClient.ts ← ChromaDB JS client wrapper
│   │   ├── fileParser.ts   ← Text chunking + file utilities
│   │   ├── indexer.ts      ← Indexing orchestration
│   │   └── search.ts       ← Semantic + file similarity search
│   ├── store/appStore.ts   ← Zustand global state
│   └── types/index.ts      ← TypeScript types
├── electron.vite.config.ts
└── package.json
```

**Runtime flow:**
1. Electron main process starts ChromaDB (`chroma run --path <userData>/chroma_data`)
2. Renderer initialises `ChromaClient` pointing at `localhost:8765`
3. On indexing: main reads file content → renderer chunks text → Gemini generates embeddings → ChromaDB stores them
4. On search: query → Gemini embedding → ChromaDB vector search → results ranked by cosine distance

---

## Privacy

- **Files never leave your machine** — only embedding vectors are sent to Google's API
- ChromaDB runs fully locally — no cloud synchronisation
- API keys are stored in the app's local settings file (`electron-store`)

---

## Development Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start in dev mode with hot-reload |
| `npm run build` | Production build |
| `npm run package` | Build + create installer |

---

## Settings Reference

| Setting | Default | Description |
|---------|---------|-------------|
| Gemini API Key | _(required)_ | Your Google AI Studio key |
| Embedding Model | `gemini-embedding-2-preview` | Gemini model for embeddings |
| ChromaDB Port | `8765` | Local ChromaDB HTTP server port |
| Chunk Size | `512` | Approx tokens per text chunk |
| Chunk Overlap | `64` | Overlapping tokens between chunks |
| Max Results | `20` | Max files returned per search |

---

## Troubleshooting

**ChromaDB fails to start**
- Make sure `chroma` is in your PATH: `pip install chromadb` and restart your terminal
- Try starting manually: `chroma run --path ./data/chroma --port 8765`
- Then click "Test Connection" in settings

**No search results**
- Make sure you've indexed the directory first (click "Index Files")
- Check the ChromaDB status badge in the toolbar is green (DB ready)

**PDF / DOCX not extracting text**
- Ensure `pdf-parse` and `mammoth` are installed (`npm install`)
- Scanned PDFs (image-only) cannot be extracted without OCR — only text-based PDFs are supported

---

## Roadmap (Post-MVP)

- [ ] Watch for file changes and auto re-index
- [ ] Multi-directory support
- [ ] In-app file preview
- [ ] AI summarisation of results
- [ ] Export / share index
