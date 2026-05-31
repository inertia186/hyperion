const CACHE_VERSION = 'hyperion-app-shell-v1'
const CORE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/maskable-icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico'
]

const isCacheableAsset = (url) => {
  if (url.origin === self.location.origin) {
    return [
      '/vite/',
      '/assets/',
      '/pwa-icon-',
      '/maskable-icon-',
      '/apple-touch-icon',
      '/favicon'
    ].some((prefix) => url.pathname.startsWith(prefix))
  }

  return url.href === 'https://cdn.jsdelivr.net/npm/@hiveio/hive-js/dist/hive.min.js'
}

const cacheFirst = async (request) => {
  const cache = await caches.open(CACHE_VERSION)
  const cached = await cache.match(request)

  if (cached) {
    return cached
  }

  const response = await fetch(request)

  if (response && response.status < 400) {
    cache.put(request, response.clone()).catch(() => {})
  }

  return response
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const {request} = event

  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)

  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    return
  }

  if (request.mode === 'navigate') {
    if (url.origin === self.location.origin && url.pathname === '/') {
      event.respondWith(fetch(request).catch(() => caches.match('/')))
    }

    return
  }

  if (isCacheableAsset(url)) {
    event.respondWith(cacheFirst(request))
  }
})
