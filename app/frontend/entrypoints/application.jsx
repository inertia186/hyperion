import React from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/application.css'
import App from '../src/App'
import { registerServiceWorker } from '../src/registerServiceWorker'
import { applyTheme, storedTheme } from '../src/theme'

class BootErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {error: null}
  }

  static getDerivedStateFromError(error) {
    return {error}
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{padding: '1rem', font: '14px system-ui, sans-serif', whiteSpace: 'pre-wrap'}}>
          {this.state.error.message || 'Hyperion failed to render.'}
        </div>
      )
    }

    return this.props.children
  }
}

registerServiceWorker()
applyTheme(storedTheme())

const hiveApiUrl = document.querySelector('meta[name="hive-api-url"]')?.content
if (hiveApiUrl && window.hive?.api?.setOptions) {
  window.hive.api.setOptions({url: hiveApiUrl})
}

const root = document.getElementById('root')

if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <BootErrorBoundary>
        <App />
      </BootErrorBoundary>
    </React.StrictMode>
  )
} else {
  document.body.insertAdjacentHTML('afterbegin', '<div style="padding: 1rem; font: 14px system-ui, sans-serif;">Hyperion could not find the app root.</div>')
}
