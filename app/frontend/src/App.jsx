import { useCallback, useEffect, useState } from 'react'
import { Laptop, LogOut, Moon, Settings, Sun, X } from 'lucide-react'
import { api } from './api'
import CurationInbox from './CurationInbox'
import FullPageState from './components/FullPageState'
import { imageProxy } from './format'
import { applyTheme, normalizeTheme, storedTheme, writeStoredTheme } from './theme'
import { closeOnBackdropClick, useModalDismiss } from './useModalDismiss'
import hyperionLogo from '../../assets/images/favicon.svg'

export default function App() {
  const [session, setSession] = useState(null)
  const [error, setError] = useState(null)
  const [votingPower, setVotingPower] = useState({status: 'loading', percent: null})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [resetKey, setResetKey] = useState(0)
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

  const refreshVotingPower = useCallback(() => {
    if (!session?.authenticated) return Promise.resolve()

    return api.votingPower()
      .then((payload) => {
        setVotingPower(payload.status === 'ready' ? {status: 'ready', percent: payload.percent} : {status: 'unavailable', percent: null})
      })
      .catch(() => {
        setVotingPower({status: 'unavailable', percent: null})
      })
  }, [session?.authenticated])

  useEffect(() => {
    if (!session?.authenticated) return undefined

    let cancelled = false
    let intervalId
    const guardedRefreshVotingPower = () => {
      api.votingPower()
        .then((payload) => {
          if (cancelled) return
          setVotingPower(payload.status === 'ready' ? {status: 'ready', percent: payload.percent} : {status: 'unavailable', percent: null})
        })
        .catch(() => {
          if (cancelled) return
          setVotingPower({status: 'unavailable', percent: null})
        })
    }

    guardedRefreshVotingPower()
    intervalId = window.setInterval(guardedRefreshVotingPower, 60_000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [session?.authenticated])

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
          <button className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-1.5 text-xl font-semibold tracking-normal text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-slate-100 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-900" type="button" onClick={() => setResetKey((key) => key + 1)} title="Reset">
            <img className="h-7 w-7 object-contain dark:invert" src={hyperionLogo} alt="" />
            <span>Hyperion</span>
          </button>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <img className="h-8 w-8 rounded-full" src={imageProxy(session.account.avatar_url, '0x64')} alt="" />
            <VotingPowerBadge votingPower={votingPower} />
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

      <CurationInbox session={session} refreshKey={refreshKey} resetKey={resetKey} theme={effectiveTheme} onRefreshVotingPower={refreshVotingPower} />
      {settingsOpen && (
        <SettingsModal
          session={session}
          onSave={(payload) => {
            setSession((current) => current ? {
              ...current,
              preferences: {
                ...current.preferences,
                ...(payload.preferences || {})
              },
              ...(payload.offchain_blacklist_sources ? {offchain_blacklist_sources: payload.offchain_blacklist_sources} : {})
            } : current)
            setRefreshKey((key) => key + 1)
          }}
          onError={(message) => setError(message)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}

function VotingPowerBadge({votingPower}) {
  const label = votingPower.status === 'ready' && Number.isFinite(Number(votingPower.percent))
    ? `VP ${formatVotingPowerPercent(votingPower.percent)}`
    : 'VP --'

  return (
    <span className="inline-flex h-7 shrink-0 items-center rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-semibold tabular-nums text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" title="Current voting power" aria-label="Current voting power">
      {label}
    </span>
  )
}

function formatVotingPowerPercent(percent) {
  const rounded = Number(percent).toFixed(1)
  return `${rounded.endsWith('.0') ? rounded.slice(0, -2) : rounded}%`
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

function SettingsModal({session, onSave, onError, onClose}) {
  const [minimumReputation, setMinimumReputation] = useState(session.preferences?.minimum_reputation ?? 25)
  const [hivewatchersEnabled, setHivewatchersEnabled] = useState(!!session.preferences?.hivewatchers_blacklist_enabled)
  const [saving, setSaving] = useState(false)
  useModalDismiss(true, onClose)

  const save = async () => {
    setSaving(true)

    try {
      const [reputationPayload, blacklistPayload] = await Promise.all([
        api.setMinimumReputation(minimumReputation),
        api.setBlacklists({hivewatchers_blacklist_enabled: hivewatchersEnabled})
      ])
      setMinimumReputation(reputationPayload.minimum_reputation)
      setHivewatchersEnabled(!!blacklistPayload.hivewatchers_blacklist_enabled)
      onSave({
        preferences: {
          minimum_reputation: reputationPayload.minimum_reputation,
          hivewatchers_blacklist_enabled: !!blacklistPayload.hivewatchers_blacklist_enabled
        },
        offchain_blacklist_sources: blacklistPayload.offchain_blacklist_sources
      })
      onClose()
    } catch (err) {
      onError(err.message || 'Request failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/30 p-3 pt-16 sm:pt-24" role="dialog" aria-modal="true" aria-label="Settings" onClick={closeOnBackdropClick(onClose)}>
      <div className="w-full max-w-lg rounded-md border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Settings</div>
          <button className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" type="button" onClick={onClose} aria-label="Close settings">
            <X size={15} />
          </button>
        </div>
        <div className="space-y-5 px-4 py-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Minimum reputation</span>
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Posts below this appear in Ignored.</span>
            <input
              className="mt-2 h-10 w-28 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              type="number"
              aria-label="Minimum reputation"
              min="-100"
              max="100"
              step="1"
              value={minimumReputation}
              onChange={(event) => setMinimumReputation(event.target.value)}
            />
          </label>
          <div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">On-chain blacklists</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              This inbox uses your Hive blacklist and{' '}
              <a className="text-blue-700 hover:underline dark:text-blue-300" href={`https://hive.blog/@${session.account.name}/lists/followed_blacklists`} target="_blank" rel="noreferrer">
                blacklist subscriptions
              </a>.
            </div>
          </div>
          <div className="space-y-2">
            {(session.blacklist_sources || []).map((source) => (
              <div key={source.account} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800 dark:text-slate-200">{source.name}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">@{source.account}</span>
                </span>
              </div>
            ))}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Off-chain blacklists</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Optional external sources applied during indexing.</div>
          </div>
          <div className="space-y-2">
            {(session.offchain_blacklist_sources || []).map((source) => (
              <label key={source.account} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                <input className="h-4 w-4" type="checkbox" checked={hivewatchersEnabled} onChange={(event) => setHivewatchersEnabled(event.target.checked)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800 dark:text-slate-200">{source.name}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{source.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <a className="text-sm text-blue-700 hover:underline dark:text-blue-300" href="/tags">Tag management</a>
          <a className="text-sm text-blue-700 hover:underline dark:text-blue-300" href="/posts">Legacy Inbox</a>
          <div className="ml-auto flex items-center gap-2">
            <button className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" type="button" onClick={onClose}>Close</button>
            <button className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white" type="button" onClick={save} disabled={saving}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
