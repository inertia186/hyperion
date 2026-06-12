import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { useSessionBootstrap } from './useSessionBootstrap'

function renderBootstrap(overrides = {}) {
  const applySessionTheme = overrides.applySessionTheme || vi.fn((payload) => ({...payload, normalized: true}))
  const setSession = overrides.setSession || vi.fn()
  const setError = overrides.setError || vi.fn()
  const redirectToLogin = overrides.redirectToLogin || vi.fn()
  const sessionApi = overrides.sessionApi || vi.fn().mockResolvedValue({
    authenticated: true,
    account: {name: 'fixture-curator'},
    preferences: {theme: 'dark'}
  })

  renderHook(() => useSessionBootstrap({
    applySessionTheme,
    setSession,
    setError,
    sessionApi,
    redirectToLogin
  }))

  return {applySessionTheme, setSession, setError, redirectToLogin, sessionApi}
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useSessionBootstrap', () => {
  test('loads an authenticated session and normalizes its theme', async () => {
    const tools = renderBootstrap()

    await waitFor(() => expect(tools.setSession).toHaveBeenCalledWith(expect.objectContaining({
      authenticated: true,
      normalized: true
    })))
    expect(tools.applySessionTheme).toHaveBeenCalledWith(expect.objectContaining({preferences: {theme: 'dark'}}))
    expect(tools.redirectToLogin).not.toHaveBeenCalled()
    expect(tools.setError).not.toHaveBeenCalled()
  })

  test('redirects unauthenticated session payloads to login', async () => {
    const tools = renderBootstrap({
      sessionApi: vi.fn().mockResolvedValue({authenticated: false, login_url: '/sessions/new'})
    })

    await waitFor(() => expect(tools.redirectToLogin).toHaveBeenCalledWith('/sessions/new'))
    expect(tools.setSession).not.toHaveBeenCalled()
    expect(tools.setError).not.toHaveBeenCalled()
  })

  test('redirects 401 API errors with login URLs', async () => {
    const tools = renderBootstrap({
      sessionApi: vi.fn().mockRejectedValue({status: 401, payload: {login_url: '/sessions/new'}})
    })

    await waitFor(() => expect(tools.redirectToLogin).toHaveBeenCalledWith('/sessions/new'))
    expect(tools.setSession).not.toHaveBeenCalled()
    expect(tools.setError).not.toHaveBeenCalled()
  })

  test('reports non-authentication bootstrap errors', async () => {
    const tools = renderBootstrap({
      sessionApi: vi.fn().mockRejectedValue(new Error('Session unavailable'))
    })

    await waitFor(() => expect(tools.setError).toHaveBeenCalledWith('Session unavailable'))
    expect(tools.redirectToLogin).not.toHaveBeenCalled()
    expect(tools.setSession).not.toHaveBeenCalled()
  })
})
