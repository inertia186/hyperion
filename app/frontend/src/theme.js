export const THEME_STORAGE_KEY = 'hyperion.theme'
export const THEMES = ['system', 'light', 'dark']

export function normalizeTheme(theme) {
  return THEMES.includes(theme) ? theme : 'system'
}

export function storedTheme() {
  try {
    return normalizeTheme(window.localStorage?.getItem(THEME_STORAGE_KEY))
  } catch (_error) {
    return 'system'
  }
}

export function writeStoredTheme(theme) {
  try {
    window.localStorage?.setItem(THEME_STORAGE_KEY, normalizeTheme(theme))
  } catch (_error) {
    // Local storage can be unavailable in private or restricted contexts.
  }
}

export function systemPrefersDark() {
  return !!window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
}

export function resolvedTheme(theme) {
  const normalizedTheme = normalizeTheme(theme)
  return normalizedTheme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : normalizedTheme
}

export function applyTheme(theme) {
  const resolved = resolvedTheme(theme)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.style.colorScheme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0f172a' : '#ffffff')
  return resolved
}
