import { useEffect, useState } from 'react'
import { Laptop, LogOut, Moon, Settings, Sun, X } from 'lucide-react'
import { api } from './api'
import CurationInbox from './CurationInbox'
import FullPageState from './components/FullPageState'
import { applyTheme, normalizeTheme, storedTheme, writeStoredTheme } from './theme'
import { closeOnBackdropClick, useModalDismiss } from './useModalDismiss'

export default function App() {
  const [session, setSession] = useState(null)
  const [error, setError] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
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

  useEffect(() => {
    api.session()
      .then((payload) => {
        if (!payload.authenticated) {
          window.location.assign(payload.login_url)
          return
        }

        const nextTheme = normalizeTheme(payload.preferences?.theme)
        setTheme(nextTheme)
        setSession({
          ...payload,
          preferences: {
            ...payload.preferences,
            theme: nextTheme
          }
        })
      })
      .catch((err) => {
        if (err.status === 401 && err.payload?.login_url) {
          window.location.assign(err.payload.login_url)
          return
        }

        setError(err.message || 'Request failed')
      })
  }, [])

  if (error) {
    return <FullPageState label={error} />
  }

  if (!session) {
    return <FullPageState label="Loading" />
  }

  const updateTheme = async (nextTheme) => {
    const normalizedTheme = normalizeTheme(nextTheme)
    const previousTheme = theme

    setTheme(normalizedTheme)
    setSession((current) => current ? {
      ...current,
      preferences: {
        ...current.preferences,
        theme: normalizedTheme
      }
    } : current)
    setThemeSaving(true)

    try {
      const payload = await api.setTheme(normalizedTheme)
      const savedTheme = normalizeTheme(payload.theme)
      setTheme(savedTheme)
      setSession((current) => current ? {
        ...current,
        preferences: {
          ...current.preferences,
          theme: savedTheme
        }
      } : current)
    } catch (err) {
      setTheme(previousTheme)
      setSession((current) => current ? {
        ...current,
        preferences: {
          ...current.preferences,
          theme: previousTheme
        }
      } : current)
      setError(err.message || 'Request failed')
    } finally {
      setThemeSaving(false)
    }
  }

  return (
    <div className="safe-area-shell min-h-screen bg-[#f6f7f9] text-slate-800 [min-height:100dvh] dark:bg-slate-950 dark:text-slate-200">
      <header className="safe-area-top border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-[1800px] items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4">
          <div className="text-xl font-semibold tracking-normal">Hyperion</div>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <img className="h-8 w-8 rounded-full" src={session.account.avatar_url} alt="" />
            <span className="hidden truncate text-sm font-medium sm:inline">{session.account.name}</span>
            <ThemeSelector theme={theme} onChange={updateTheme} disabled={themeSaving} />
            <button className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 hover:bg-slate-50 sm:h-9 sm:w-9 dark:border-slate-700 dark:hover:bg-slate-800" type="button" onClick={() => setSettingsOpen(true)} aria-label="Settings">
              <Settings size={16} />
            </button>
            <form action={`/sessions/${session.account.name}`} method="post">
              <input type="hidden" name="_method" value="delete" />
              <input type="hidden" name="authenticity_token" value={document.querySelector('meta[name="csrf-token"]')?.content || ''} />
              <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50 sm:h-9 dark:border-slate-700 dark:hover:bg-slate-800" type="submit">
                <LogOut size={16} />
                <span className="hidden sm:inline">Log out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <CurationInbox session={session} refreshKey={refreshKey} theme={effectiveTheme} />
      {settingsOpen && (
        <SettingsModal
          session={session}
          onClose={() => setSettingsOpen(false)}
          onSave={(payload) => {
            setSession((current) => ({
              ...current,
              preferences: {
                ...current.preferences,
                enabled_blacklist_sources: payload.enabled_blacklist_sources
              },
              blacklist_sources: payload.blacklist_sources
            }))
            setRefreshKey((key) => key + 1)
            setSettingsOpen(false)
          }}
        />
      )}
    </div>
  )
}

function ThemeSelector({theme, onChange, disabled}) {
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Laptop

  return (
    <label className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 hover:bg-slate-50 sm:h-9 sm:w-9 dark:border-slate-700 dark:hover:bg-slate-800" title={`Theme: ${theme}`}>
      <span className="sr-only">Theme</span>
      <Icon size={16} aria-hidden="true" />
      <select className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" value={theme} onChange={(event) => onChange(event.target.value)} disabled={disabled} aria-label="Theme">
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  )
}

function SettingsModal({session, onClose, onSave}) {
  const [selectedSources, setSelectedSources] = useState(() => new Set(session.preferences.enabled_blacklist_sources || []))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  useModalDismiss(true, onClose)

  const toggleSource = (community) => {
    setSelectedSources((current) => {
      const next = new Set(current)
      if (next.has(community)) {
        next.delete(community)
      } else {
        next.add(community)
      }
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    setError(null)

    try {
      const payload = await api.setBlacklists(Array.from(selectedSources))
      onSave(payload)
    } catch (err) {
      setError(err.message || 'Request failed')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/30 p-3 pt-16 sm:pt-24" role="dialog" aria-modal="true" aria-label="Settings" onClick={closeOnBackdropClick(onClose)}>
      <div className="w-full max-w-lg rounded-md border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <div className="text-sm font-semibold text-slate-900">Settings</div>
          <button className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" type="button" onClick={onClose} aria-label="Close settings">
            <X size={15} />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <div>
            <div className="text-sm font-medium text-slate-900">Blacklists</div>
            <div className="mt-1 text-xs text-slate-500">Choose which trusted community mute lists apply to this inbox.</div>
          </div>
          <div className="space-y-2">
            {(session.blacklist_sources || []).map((source) => (
              <label key={source.community} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm">
                <input className="h-4 w-4" type="checkbox" checked={selectedSources.has(source.community)} onChange={() => toggleSource(source.community)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800">{source.name}</span>
                  <span className="block truncate text-xs text-slate-500">{source.community}</span>
                </span>
              </label>
            ))}
          </div>
          {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>
        <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-3">
          <a className="text-sm text-blue-700 hover:underline" href="/tags">Tag management</a>
          <a className="text-sm text-blue-700 hover:underline" href="/posts">Legacy Inbox</a>
          <div className="ml-auto flex items-center gap-2">
            <button className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="inline-flex h-9 items-center rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50" type="button" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
