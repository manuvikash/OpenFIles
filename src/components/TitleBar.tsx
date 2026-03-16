import { Minus, Square, X, FolderSearch } from 'lucide-react'

export function TitleBar() {
  return (
    <div
      className="flex items-center justify-between h-9 bg-surface-950 border-b border-surface-800 select-none shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* App identity */}
      <div className="flex items-center gap-2 px-4">
        <FolderSearch className="w-4 h-4 text-accent-400" />
        <span className="text-sm font-semibold text-surface-200 tracking-wide">OpenFiles</span>
      </div>

      {/* Window controls — no drag */}
      <div
        className="flex items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={() => window.api.minimize()}
          className="flex items-center justify-center w-12 h-9 text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => window.api.maximize()}
          className="flex items-center justify-center w-12 h-9 text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          onClick={() => window.api.close()}
          className="flex items-center justify-center w-12 h-9 text-surface-400 hover:text-white hover:bg-red-600 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
