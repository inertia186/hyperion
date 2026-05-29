import { CheckSquare, Eye, Filter, Search, Star, StarOff, Tags, Volume2, VolumeX, X } from 'lucide-react'
import { SORTS } from '../constants'
import ModeSelector from './ModeSelector'

export default function Toolbar({
  query,
  draftTag,
  setDraftTag,
  submitQuery,
  updateQuery,
  markSelectedRead,
  selectedCount,
  toggleIgnoredTag,
  activeTag,
  activeAuthor,
  activeTagIgnored,
  loading,
  payload,
  toggleMute,
  toggleOnlyFavorites,
  onOpenTags,
  compactModeSelector = false
}) {
  return (
    <div className="mb-3 rounded-md border border-slate-200 bg-white p-3">
      <form className="flex gap-2" onSubmit={submitQuery} role="search" aria-label="Post query">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Tag, author, app, excluded tags</span>
          <div className="flex h-11 items-center gap-2 rounded-md border border-slate-300 px-2 focus-within:border-blue-500">
            <Search size={16} className="text-slate-400" />
            <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={draftTag} onChange={(event) => setDraftTag(event.target.value)} placeholder="haf @author app:peakd -spam" />
          </div>
        </label>
        <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:min-w-24" type="submit" disabled={loading} aria-label="Search">
          <Filter size={16} />
          <span className="hidden sm:inline">Search</span>
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ModeSelector query={query} counts={payload?.mode_counts} compact={compactModeSelector} onChange={updateQuery} />
        <ChipButton
          active={!activeTag}
          label="All tags"
          onClick={() => updateQuery({tag: ''})}
        />
        {activeTag && (
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 text-sm text-blue-800 hover:bg-blue-100" type="button" onClick={() => updateQuery({tag: ''})} aria-label={`Clear tag ${activeTag}`}>
            {activeTag}
            <X size={14} />
            <span className="sr-only">Clear active tag</span>
          </button>
        )}
        {activeAuthor && (
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 text-sm text-blue-800 hover:bg-blue-100" type="button" onClick={() => updateQuery({author: ''})} aria-label={`Clear author @${activeAuthor}`}>
            @{activeAuthor}
            <X size={14} />
            <span className="sr-only">Clear active author</span>
          </button>
        )}
        <label className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-2 text-sm">
          <span className="text-xs font-medium text-slate-500">Sort</span>
          <select className="min-w-0 bg-transparent text-sm outline-none" value={query.sort} onChange={(event) => updateQuery({sort: event.target.value})} aria-label="Sort posts">
            {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <PreferenceChip active={payload?.query?.muted_authors_enabled} iconOn={VolumeX} iconOff={Volume2} label="Mute" onClick={toggleMute} disabled={!payload || loading} />
        <PreferenceChip active={payload?.query?.only_favorite_tags} iconOn={Star} iconOff={StarOff} label="Favorites" onClick={toggleOnlyFavorites} disabled={!payload || loading} />
        <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm disabled:opacity-50" type="button" onClick={onOpenTags} disabled={!payload || loading}>
          <Tags size={16} />
          Tags
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <button className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50 disabled:opacity-50 sm:flex-none" type="button" onClick={markSelectedRead} disabled={loading || selectedCount === 0}>
          <CheckSquare size={16} />
          Mark selected read
          {selectedCount > 0 && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{selectedCount}</span>}
        </button>
        <button className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50 disabled:opacity-50 sm:flex-none" type="button" onClick={toggleIgnoredTag} disabled={!activeTag || loading}>
          {activeTagIgnored ? <Eye size={16} /> : <X size={16} />}
          {activeTagIgnored ? 'Unignore tag' : 'Ignore tag'}
        </button>
      </div>
    </div>
  )
}

function ChipButton({active, label, count, onClick}) {
  return (
    <button className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm ${active ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-300 bg-white'}`} type="button" onClick={onClick} aria-pressed={active}>
      {label}
      {count != null && <span className={`rounded px-1.5 py-0.5 text-[11px] ${active ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>{count}</span>}
    </button>
  )
}

function PreferenceChip({active, iconOn: IconOn, iconOff: IconOff, label, onClick, disabled}) {
  const Icon = active ? IconOn : IconOff
  return (
    <button className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm disabled:opacity-50 ${active ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white'}`} type="button" onClick={onClick} disabled={disabled} aria-pressed={!!active}>
      <Icon size={16} />
      {label}
    </button>
  )
}
