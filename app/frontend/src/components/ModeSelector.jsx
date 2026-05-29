const modeOptions = [
  {key: 'unread', countKey: 'unread', label: 'Unread', updates: {only_read: false, only_ignored: false, only_deleted: false, only_blacklisted: false}},
  {key: 'only_read', countKey: 'read', label: 'Read', updates: {only_read: true, only_ignored: false, only_deleted: false, only_blacklisted: false}},
  {key: 'only_ignored', countKey: 'ignored', label: 'Ignored', updates: {only_ignored: true, only_read: false, only_deleted: false, only_blacklisted: false}},
  {key: 'only_deleted', countKey: 'deleted', label: 'Deleted', updates: {only_deleted: true, only_read: false, only_ignored: false, only_blacklisted: false}},
  {key: 'only_blacklisted', countKey: 'blacklisted', label: 'Blacklisted', updates: {only_blacklisted: true, only_read: false, only_ignored: false, only_deleted: false}}
]

export function activeModeKey(query) {
  return query.only_read ? 'only_read' : query.only_ignored ? 'only_ignored' : query.only_deleted ? 'only_deleted' : query.only_blacklisted ? 'only_blacklisted' : 'unread'
}

export default function ModeSelector({query, counts, compact = false, onChange}) {
  const activeMode = activeModeKey(query)

  if (compact) {
    return (
      <label className="inline-flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-300 bg-white px-2 text-sm sm:flex-none">
        <span className="text-xs font-medium text-slate-500">View</span>
        <select className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={activeMode} onChange={(event) => onChange(modeOptions.find((mode) => mode.key === event.target.value).updates)} aria-label="View mode">
          {modeOptions.map((mode) => (
            <option key={mode.key} value={mode.key}>{modeLabel(mode, counts)}</option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white" role="group" aria-label="View mode">
      {modeOptions.map((mode) => {
        const active = activeMode === mode.key

        return (
          <button
            key={mode.key}
            className={`inline-flex h-10 items-center gap-1.5 border-l border-slate-300 px-2.5 text-sm first:border-l-0 ${active ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50'}`}
            type="button"
            onClick={() => onChange(mode.updates)}
            aria-pressed={active}
          >
            {mode.label}
            <span className={`rounded px-1.5 py-0.5 text-[11px] ${active ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>{modeCount(mode, counts)}</span>
          </button>
        )
      })}
    </div>
  )
}

function modeLabel(mode, counts) {
  return `${mode.label} (${modeCount(mode, counts)})`
}

function modeCount(mode, counts) {
  return counts?.[mode.countKey] ?? 0
}
