/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          850: '#172033',
          900: '#0f172a',
          950: '#080f1e'
        },
        accent: {
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5'
        },
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444'
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'monospace']
      },
      animation: {
        'spin-slow': 'spin 2s linear infinite',
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite'
      }
    }
  },
  plugins: []
}
