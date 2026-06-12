import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { sessionWithNormalizedTheme, useThemePreference } from './useThemePreference'

function installMatchMedia({matches = false} = {}) {
  const listeners = new Set()
  window.matchMedia = vi.fn(() => ({
    matches,
    addEventListener: (_event, listener) => listeners.add(listener),
    removeEventListener: (_event, listener) => listeners.delete(listener)
  }))

  return {
    setMatches(nextMatches) {
      matches = nextMatches
      listeners.forEach((listener) => listener({matches: nextMatches, media: '(prefers-color-scheme: dark)'}))
    }
  }
}

afterEach(() => {
  window.localStorage.clear()
  document.documentElement.className = ''
  document.documentElement.style.colorScheme = ''
  vi.restoreAllMocks()
})

describe('useThemePreference', () => {
  test('normalizes session theme payloads', () => {
    expect(sessionWithNormalizedTheme({preferences: {theme: 'dark'}}).preferences.theme).toBe('dark')
    expect(sessionWithNormalizedTheme({preferences: {theme: 'unknown'}}).preferences.theme).toBe('system')
  })

  test('applies stored system theme and follows color-scheme changes', () => {
    window.localStorage.setItem('hyperion.theme', 'system')
    const media = installMatchMedia({matches: false})

    const {result} = renderHook(() => useThemePreference())
    expect(result.current.theme).toBe('system')
    expect(result.current.effectiveTheme).toBe('light')
    expect(document.documentElement).not.toHaveClass('dark')

    act(() => media.setMatches(true))
    expect(result.current.effectiveTheme).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
  })

  test('applies session theme and stores it locally', async () => {
    installMatchMedia()
    const {result} = renderHook(() => useThemePreference())

    act(() => {
      const session = result.current.applySessionTheme({preferences: {theme: 'norton'}})
      expect(session.preferences.theme).toBe('norton')
    })

    await waitFor(() => expect(window.localStorage.getItem('hyperion.theme')).toBe('norton'))
    expect(document.documentElement).toHaveClass('theme-norton')
  })

  test('saves themes optimistically and rolls back on errors', async () => {
    installMatchMedia()
    let session = {preferences: {theme: 'light'}}
    const setSession = vi.fn((updater) => {
      session = updater(session)
    })
    const onError = vi.fn()
    const setThemeApi = vi.fn()
      .mockResolvedValueOnce({theme: 'dark'})
      .mockRejectedValueOnce(new Error('Theme unavailable'))

    const {result} = renderHook(() => useThemePreference({setSession, onError, setThemeApi}))

    await act(async () => {
      await result.current.updateTheme('dark')
    })
    expect(result.current.theme).toBe('dark')
    expect(session.preferences.theme).toBe('dark')
    expect(setThemeApi).toHaveBeenCalledWith('dark')

    await act(async () => {
      await result.current.updateTheme('lcars')
    })
    expect(result.current.theme).toBe('dark')
    expect(session.preferences.theme).toBe('dark')
    expect(onError).toHaveBeenCalledWith('Theme unavailable')
  })
})
