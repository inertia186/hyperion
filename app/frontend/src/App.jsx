import { useEffect, useRef, useState } from 'react'
import { CalendarDays, CircleHelp, Code2, Laptop, LogOut, Menu, Monitor, Moon, PanelsTopLeft, Settings, Sun, Tags, Terminal, X } from 'lucide-react'
import { api } from './api'
import CurationInbox from './CurationInbox'
import FullPageState from './components/FullPageState'
import ShortcutsPanel from './components/ShortcutsPanel'
import TimelineModal from './components/TimelineModal'
import { imageProxy } from './format'
import { THEME_OPTIONS, themeOption } from './theme'
import { closeOnBackdropClick, useModalDismiss } from './useModalDismiss'
import { useThemePreference } from './useThemePreference'
import { useVotingPower } from './useVotingPower'
import hyperionLogo from '../../assets/images/favicon.svg'

export default function App() {
  const [session, setSession] = useState(null)
  const [error, setError] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [resetKey, setResetKey] = useState(0)
  const inboxRef = useRef(null)
  const {votingPower, refreshVotingPower} = useVotingPower({authenticated: !!session?.authenticated})
  const {theme, effectiveTheme, themeSaving, applySessionTheme, updateTheme} = useThemePreference({setSession, onError: setError})

  useEffect(() => {
    api.session()
      .then((payload) => {
        if (!payload.authenticated) {
          window.location.assign(payload.login_url)
          return
        }

        setSession(applySessionTheme(payload))
      })
      .catch((err) => {
        if (err.status === 401 && err.payload?.login_url) {
          window.location.assign(err.payload.login_url)
          return
        }

        setError(err.message || 'Request failed')
      })
  }, [applySessionTheme])

  if (error) {
    return <FullPageState label={error} />
  }

  if (!session) {
    return <FullPageState label="Loading" />
  }

  return (
    <div className="safe-area-shell min-h-screen bg-[#f6f7f9] text-slate-800 [min-height:100dvh] dark:bg-slate-950 dark:text-slate-200">
      <header className="app-header safe-area-top border-b">
        <div className="mx-auto flex max-w-[1800px] items-center gap-2 px-2 py-2.5 sm:gap-4 sm:px-4 sm:py-3">
          <button className="inline-flex h-10 min-w-0 shrink items-center gap-2 rounded-md px-1.5 text-lg font-semibold tracking-normal text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:text-xl dark:text-slate-100 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-900" type="button" onClick={() => setResetKey((key) => key + 1)} title="Reset">
            <img className="h-7 w-7 object-contain dark:invert" src={hyperionLogo} alt="" />
            <span className="truncate">Hyperion</span>
          </button>
          <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-3">
            <img className="hidden h-8 w-8 rounded-full min-[420px]:block" src={imageProxy(session.account.avatar_url, '0x64')} alt="" />
            <VotingPowerBadge votingPower={votingPower} />
            <span className="hidden truncate text-sm font-medium sm:inline">{session.account.name}</span>
            <div className="hidden items-center gap-3 min-[560px]:flex">
              <ThemeSelector theme={theme} onChange={updateTheme} disabled={themeSaving} />
              <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" type="button" onClick={() => setSettingsOpen(true)} aria-label="Settings">
                <Settings size={16} />
              </button>
              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" type="button" onClick={() => inboxRef.current?.openTags()}>
                <Tags size={16} />
                <span>Tags</span>
              </button>
              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" type="button" onClick={() => setTimelineOpen(true)}>
                <CalendarDays size={16} />
                <span>This Week</span>
              </button>
              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" type="button" onClick={() => setHelpOpen(true)}>
                <CircleHelp size={16} />
                <span>Help</span>
              </button>
              <LogoutForm accountName={session.account.name} />
            </div>
            <HeaderMenu
              accountName={session.account.name}
              theme={theme}
              themeSaving={themeSaving}
              onThemeChange={updateTheme}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenTags={() => inboxRef.current?.openTags()}
              onOpenTimeline={() => setTimelineOpen(true)}
              onOpenHelp={() => setHelpOpen(true)}
            />
          </div>
        </div>
      </header>

      <CurationInbox
        ref={inboxRef}
        session={session}
        refreshKey={refreshKey}
        resetKey={resetKey}
        theme={effectiveTheme}
        helpVisible={helpOpen}
        setHelpVisible={setHelpOpen}
        onRefreshVotingPower={refreshVotingPower}
      />
      <ShortcutsPanel visible={helpOpen} onClose={() => setHelpOpen(false)} />
      <TimelineModal visible={timelineOpen} onClose={() => setTimelineOpen(false)} onSelectAuthor={(author) => inboxRef.current?.focusAuthor(author)} />
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
  const option = themeOption(theme)
  const Icon = option.id === 'dark' ? Moon : option.id === 'light' ? Sun : option.id === 'norton' || option.id === 'bbs' ? Terminal : option.id.startsWith('franklin-') ? Monitor : option.id === 'darkula' ? Code2 : option.id === 'lcars' ? PanelsTopLeft : option.professional && option.mode === 'light' ? Sun : option.professional && option.mode === 'dark' ? Moon : Laptop

  return (
    <label className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 hover:bg-slate-50 sm:h-9 sm:w-9 dark:border-slate-700 dark:hover:bg-slate-800" title={`Theme: ${option.label}`}>
      <span className="sr-only">Theme</span>
      <Icon size={16} aria-hidden="true" />
      <select className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" value={theme} onChange={(event) => onChange(event.target.value)} disabled={disabled} aria-label="Theme">
        {THEME_OPTIONS.map((themeOption) => (
          <option key={themeOption.id} value={themeOption.id}>{themeOption.label}</option>
        ))}
      </select>
    </label>
  )
}

function HeaderMenu({accountName, theme, themeSaving, onThemeChange, onOpenSettings, onOpenTags, onOpenTimeline, onOpenHelp}) {
  const [open, setOpen] = useState(false)
  useModalDismiss(open, () => setOpen(false))

  const openSettings = () => {
    setOpen(false)
    onOpenSettings()
  }
  const openHelp = () => {
    setOpen(false)
    onOpenHelp()
  }
  const openTimeline = () => {
    setOpen(false)
    onOpenTimeline()
  }
  const openTags = () => {
    setOpen(false)
    onOpenTags()
  }

  return (
    <div className="relative min-[560px]:hidden">
      <button
        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Menu size={18} />
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-30 cursor-default" type="button" tabIndex={-1} aria-hidden="true" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-40 w-56 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900" aria-label="Account menu">
            <div className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">Theme</span>
              <ThemeSelector theme={theme} onChange={onThemeChange} disabled={themeSaving} />
            </div>
            <button className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800" type="button" onClick={openSettings}>
              <Settings size={16} />
              Open settings
            </button>
            <button className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800" type="button" onClick={openTags}>
              <Tags size={16} />
              Tags
            </button>
            <button className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800" type="button" onClick={openTimeline}>
              <CalendarDays size={16} />
              This Week
            </button>
            <button className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800" type="button" onClick={openHelp}>
              <CircleHelp size={16} />
              Help
            </button>
            <div className="border-t border-slate-100 px-1 py-1 dark:border-slate-800">
              <LogoutForm accountName={accountName} className="flex w-full items-center gap-3 rounded px-2 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800" />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function LogoutForm({accountName, className = 'inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}) {
  return (
    <form action={`/sessions/${accountName}`} method="post">
      <input type="hidden" name="_method" value="delete" />
      <input type="hidden" name="authenticity_token" value={document.querySelector('meta[name="csrf-token"]')?.content || ''} />
      <button className={className} type="submit">
        <LogOut size={16} />
        <span>Log out</span>
      </button>
    </form>
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
      <div className="settings-modal w-full max-w-lg rounded-md border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="settings-modal-header flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Settings</div>
          <button className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" type="button" onClick={onClose} aria-label="Close settings">
            <X size={15} />
          </button>
        </div>
        <div className="settings-modal-body space-y-5 px-4 py-4">
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
              <div key={source.account} className="settings-source-row flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
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
              <label key={source.account} className="settings-source-row flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                <input className="h-4 w-4" type="checkbox" checked={hivewatchersEnabled} onChange={(event) => setHivewatchersEnabled(event.target.checked)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800 dark:text-slate-200">{source.name}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{source.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="settings-modal-footer flex items-center gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
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
