import { useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../api'
import { closeOnBackdropClick, useModalDismiss } from '../useModalDismiss'

export default function SettingsModal({session, onSave, onError, onClose}) {
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
