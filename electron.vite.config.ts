import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Optional chromadb embedding back-ends we don't use — must be excluded
// to avoid Rollup failing on missing optional deps.
const chromaOptionals = (id: string): boolean => {
  const pkgs = [
    'chromadb-default-embed',
    '@chroma-core/default-embed',
    '@xenova/transformers',
    'onnxruntime-node',
    'onnxruntime-web',
    'sharp',
    'canvas'
  ]
  return pkgs.some((p) => id === p || id.startsWith(p + '/'))
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/main/index.ts')
      }
    },
    resolve: {
      alias: {
        '@main': resolve('electron/main')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/preload/index.ts')
      }
    }
  },
  renderer: {
    root: resolve('src'),
    resolve: {
      alias: {
        '@renderer': resolve('src'),
        '@': resolve('src'),
        // Stub out optional chromadb embedding back-ends we don't use
        '@chroma-core/default-embed': resolve('src/shims/chroma-default-embed.ts'),
        'chromadb-default-embed': resolve('src/shims/chroma-default-embed.ts')
      }
    },
    plugins: [react()],
    css: {
      postcss: resolve('postcss.config.js')
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production')
    },
    optimizeDeps: {
      exclude: [
        '@chroma-core/default-embed',
        'chromadb-default-embed',
        '@xenova/transformers',
        'onnxruntime-node',
        'onnxruntime-web'
      ]
    },
    build: {
      rollupOptions: {
        input: resolve('src/index.html'),
        external: chromaOptionals
      }
    }
  }
})
