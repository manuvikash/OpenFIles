import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

// StrictMode intentionally double-invokes effects in dev, which causes
// two concurrent IPC calls to startChroma and a spurious "port in use" error.
// The mutex in the main process handles this, but removing StrictMode
// keeps the dev experience clean (and production never uses it anyway).
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <App />
)
