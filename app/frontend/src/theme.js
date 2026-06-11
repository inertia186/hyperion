export const THEME_STORAGE_KEY = 'hyperion.theme'
export const THEME_OPTIONS = [
  {id: 'system', label: 'System', mode: 'system', rootClass: null, metaColor: '#ffffff'},
  {id: 'light', label: 'Light', mode: 'light', rootClass: null, metaColor: '#ffffff'},
  {id: 'dark', label: 'Dark', mode: 'dark', rootClass: null, metaColor: '#111317'},
  {id: 'mist', label: 'Mist', mode: 'light', rootClass: 'theme-mist', professional: true, metaColor: '#e8eef5'},
  {id: 'linen', label: 'Linen', mode: 'light', rootClass: 'theme-linen', professional: true, metaColor: '#f4efe7'},
  {id: 'sage', label: 'Sage', mode: 'light', rootClass: 'theme-sage', professional: true, metaColor: '#e8efe7'},
  {id: 'sky', label: 'Sky', mode: 'light', rootClass: 'theme-sky', professional: true, metaColor: '#e6f0fb'},
  {id: 'orchid', label: 'Orchid', mode: 'light', rootClass: 'theme-orchid', professional: true, metaColor: '#f0eaf7'},
  {id: 'carbon', label: 'Carbon', mode: 'dark', rootClass: 'theme-carbon', professional: true, metaColor: '#15171b'},
  {id: 'navy', label: 'Navy', mode: 'dark', rootClass: 'theme-navy', professional: true, metaColor: '#0b1426'},
  {id: 'pine', label: 'Pine', mode: 'dark', rootClass: 'theme-pine', professional: true, metaColor: '#071b16'},
  {id: 'plum', label: 'Plum', mode: 'dark', rootClass: 'theme-plum', professional: true, metaColor: '#1b1224'},
  {id: 'copper', label: 'Copper', mode: 'dark', rootClass: 'theme-copper', professional: true, metaColor: '#21150f'},
  {id: 'norton', label: 'Norton Commander', mode: 'dark', rootClass: 'theme-norton', metaColor: '#0000aa'},
  {id: 'franklin-amber', label: 'Franklin Amber', mode: 'dark', rootClass: 'theme-franklin-amber', metaColor: '#1c1200'},
  {id: 'franklin-green', label: 'Franklin Green', mode: 'dark', rootClass: 'theme-franklin-green', metaColor: '#001a08'},
  {id: 'darkula', label: 'Darkula', mode: 'dark', rootClass: 'theme-darkula', metaColor: '#2b2b2b'},
  {id: 'lcars', label: 'LCARS', mode: 'dark', rootClass: 'theme-lcars', metaColor: '#000000'},
  {id: 'bbs', label: 'BBS', mode: 'dark', rootClass: 'theme-bbs', metaColor: '#000000'}
]
export const THEMES = THEME_OPTIONS.map((theme) => theme.id)
export const PROFESSIONAL_THEMES = THEME_OPTIONS.filter((theme) => theme.professional)
export const PROFESSIONAL_THEME_IDS = PROFESSIONAL_THEMES.map((theme) => theme.id)
const ROOT_THEME_CLASSES = THEME_OPTIONS.map((theme) => theme.rootClass).filter(Boolean)

export function normalizeTheme(theme) {
  return THEMES.includes(theme) ? theme : 'system'
}

export function themeOption(theme) {
  const normalizedTheme = normalizeTheme(theme)
  return THEME_OPTIONS.find((option) => option.id === normalizedTheme) ?? THEME_OPTIONS[0]
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
  const option = themeOption(resolved)
  const darkLike = option.mode === 'dark'
  document.documentElement.classList.toggle('dark', darkLike)
  document.documentElement.classList.toggle('theme-pro', !!option.professional)
  ROOT_THEME_CLASSES.forEach((themeClass) => {
    document.documentElement.classList.toggle(themeClass, option.rootClass === themeClass)
  })
  document.documentElement.classList.toggle('theme-franklin', resolved === 'franklin-amber' || resolved === 'franklin-green')
  document.documentElement.style.colorScheme = darkLike ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', option.metaColor)
  return resolved
}
