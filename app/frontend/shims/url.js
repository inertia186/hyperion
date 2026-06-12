export const URL = globalThis.URL

export function fileURLToPath() {
  return ''
}

export function pathToFileURL(path) {
  return new URL(String(path), globalThis.location?.origin || 'http://localhost')
}

export default {
  URL,
  fileURLToPath,
  pathToFileURL
}
