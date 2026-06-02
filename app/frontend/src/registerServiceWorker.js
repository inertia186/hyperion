export function registerServiceWorker() {
  if (import.meta.env.MODE === 'test' || !('serviceWorker' in navigator)) {
    return
  }

  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => registrations.forEach((registration) => registration.unregister()))
      .catch(() => {})
    return
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', {scope: '/'}).catch((error) => {
      if (import.meta.env.DEV) {
        console.warn('Service worker registration failed', error)
      }
    })
  })
}
