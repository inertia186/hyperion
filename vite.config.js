import { defineConfig } from 'vite'
import RubyPlugin from 'vite-plugin-ruby'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    RubyPlugin(),
    react()
  ],
  server: {
    allowedHosts: ['toto.local', 'hyperion.test', 'toto.tail1b9f02.ts.net'],
    hmr: false
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js']
  }
})
