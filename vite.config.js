import { defineConfig } from 'vite'
import RubyPlugin from 'vite-plugin-ruby'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    RubyPlugin(),
    react()
  ],
  resolve: {
    alias: {
      fs: fileURLToPath(new URL('./app/frontend/shims/empty.js', import.meta.url)),
      'node:fs': fileURLToPath(new URL('./app/frontend/shims/empty.js', import.meta.url)),
      os: fileURLToPath(new URL('./app/frontend/shims/os.js', import.meta.url)),
      'node:os': fileURLToPath(new URL('./app/frontend/shims/os.js', import.meta.url)),
      postcss: fileURLToPath(new URL('./app/frontend/shims/postcss.js', import.meta.url)),
      url: fileURLToPath(new URL('./app/frontend/shims/url.js', import.meta.url)),
      'node:url': fileURLToPath(new URL('./app/frontend/shims/url.js', import.meta.url))
    }
  },
  server: {
    allowedHosts: ['toto.local', 'hyperion.test', 'toto.tail1b9f02.ts.net'],
    hmr: false
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js']
  }
})
