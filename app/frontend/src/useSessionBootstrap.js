import { useEffect } from 'react'
import { api } from './api'

function redirectToLoginUrl(url) {
  window.location.assign(url)
}

export function useSessionBootstrap({
  applySessionTheme,
  setSession,
  setError,
  sessionApi = api.session,
  redirectToLogin = redirectToLoginUrl
}) {
  useEffect(() => {
    sessionApi()
      .then((payload) => {
        if (!payload.authenticated) {
          redirectToLogin(payload.login_url)
          return
        }

        setSession(applySessionTheme(payload))
      })
      .catch((err) => {
        if (err.status === 401 && err.payload?.login_url) {
          redirectToLogin(err.payload.login_url)
          return
        }

        setError(err.message || 'Request failed')
      })
  }, [applySessionTheme, redirectToLogin, sessionApi, setError, setSession])
}
