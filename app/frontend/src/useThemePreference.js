import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { applyTheme, normalizeTheme, storedTheme, writeStoredTheme } from './theme'

export function sessionWithNormalizedTheme(payload) {
  const nextTheme = normalizeTheme(payload.preferences?.theme)
  return {
    ...payload,
    preferences: {
      ...payload.preferences,
      theme: nextTheme
    }
  }
}

function sessionWithTheme(current, theme) {
  return current ? {
    ...current,
    preferences: {
      ...current.preferences,
      theme
    }
  } : current
}

export function useThemePreference({setSession, onError, setThemeApi = api.setTheme} = {}) {
  const [theme, setTheme] = useState(() => storedTheme())
  const [effectiveTheme, setEffectiveTheme] = useState(() => applyTheme(storedTheme()))
  const [themeSaving, setThemeSaving] = useState(false)

  useEffect(() => {
    setEffectiveTheme(applyTheme(theme))
    writeStoredTheme(theme)

    if (theme !== 'system' || !window.matchMedia) return undefined

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => setEffectiveTheme(applyTheme('system'))
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    mediaQuery.addListener?.(handleChange)

    return () => {
      mediaQuery.removeListener?.(handleChange)
    }
  }, [theme])

  const applySessionTheme = useCallback((payload) => {
    const nextSession = sessionWithNormalizedTheme(payload)
    setTheme(nextSession.preferences.theme)
    return nextSession
  }, [])

  const updateTheme = useCallback(async (nextTheme) => {
    const normalizedTheme = normalizeTheme(nextTheme)
    const previousTheme = theme

    setTheme(normalizedTheme)
    setSession?.((current) => sessionWithTheme(current, normalizedTheme))
    setThemeSaving(true)

    try {
      const payload = await setThemeApi(normalizedTheme)
      const savedTheme = normalizeTheme(payload.theme)
      setTheme(savedTheme)
      setSession?.((current) => sessionWithTheme(current, savedTheme))
    } catch (err) {
      setTheme(previousTheme)
      setSession?.((current) => sessionWithTheme(current, previousTheme))
      onError?.(err.message || 'Request failed')
    } finally {
      setThemeSaving(false)
    }
  }, [onError, setSession, setThemeApi, theme])

  return {
    theme,
    effectiveTheme,
    themeSaving,
    applySessionTheme,
    updateTheme
  }
}
