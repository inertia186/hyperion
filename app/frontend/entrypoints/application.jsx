import React from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/application.css'
import App from '../src/App'
import { registerServiceWorker } from '../src/registerServiceWorker'
import { applyTheme, storedTheme } from '../src/theme'

registerServiceWorker()
applyTheme(storedTheme())

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
