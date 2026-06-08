import { useEffect, useRef, useState } from 'react'
import { CheckSquare, Eye, Filter, RotateCcw, Search, Star, StarOff, Tags, Volume2, VolumeX, X } from 'lucide-react'
import { SORTS } from '../constants'
import ModeSelector from './ModeSelector'

const SEARCH_FORM_COMPACT_WIDTH = 520

export default function Toolbar({
  query,
  draftTag,
  setDraftTag,
  draftQuery,
  setDraftQuery,
  searchMode,
  setSearchMode,
  submitQuery,
  resetQueryInput,
  updateQuery,
  markSelectedRead,
  selectedCount,
  toggleIgnoredTag,
  activeTag,
  activeTagIgnored,
  loading,
  payload,
  toggleMute,
  toggleOnlyFavorites,
  onOpenTags,
  compactModeSelector = false
}) {
  const keywordMode = searchMode === 'keyword'
  const actionRowRef = useRef(null)
  const [compactSearchForm, setCompactSearchForm] = useState(false)
  const [selectionFeedback, setSelectionFeedback] = useState('')

  useEffect(() => {
    const updateCompactSearchForm = () => {
      const width = actionRowRef.current?.clientWidth || 0
      setCompactSearchForm(width > 0 && width < SEARCH_FORM_COMPACT_WIDTH)
    }

    updateCompactSearchForm()

    if (typeof ResizeObserver !== 'undefined' && actionRowRef.current) {
      const observer = new ResizeObserver(updateCompactSearchForm)
      observer.observe(actionRowRef.current)
      return () => observer.disconnect()
    }

    window.addEventListener('resize', updateCompactSearchForm)
    return () => window.removeEventListener('resize', updateCompactSearchForm)
  }, [])

  useEffect(() => {
    if (selectedCount > 0) setSelectionFeedback('')
  }, [selectedCount])

  const handleMarkSelectedRead = () => {
    if (selectedCount === 0) {
      setSelectionFeedback('Select posts first.')
      return
    }

    setSelectionFeedback('')
    markSelectedRead()
  }

  return (
    <div className="mb-3 rounded-md border border-slate-200 bg-white p-3">
      <div ref={actionRowRef} className="mb-2 flex flex-wrap items-center gap-2">
        {compactSearchForm ? (
          <label className="inline-flex h-9 min-w-0 items-center gap-2 rounded-md border border-slate-300 bg-white px-2 text-sm">
            <span className="text-xs font-medium text-slate-500">Search</span>
            <select className="min-w-0 bg-transparent text-base outline-none md:text-sm" value={searchMode} onChange={(event) => setSearchMode(event.target.value)} aria-label="Search form">
              <option value="filters">Filters</option>
              <option value="keyword">Keywords</option>
            </select>
          </label>
        ) : (
          <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white" role="group" aria-label="Search form">
            <button className={`inline-flex h-9 items-center gap-2 border-r border-slate-300 px-3 text-sm ${!keywordMode ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50'}`} type="button" onClick={() => setSearchMode('filters')} aria-pressed={!keywordMode}>
              <Filter size={16} />
              Filters
            </button>
            <button className={`inline-flex h-9 items-center gap-2 px-3 text-sm ${keywordMode ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50'}`} type="button" onClick={() => setSearchMode('keyword')} aria-pressed={keywordMode}>
              <Search size={16} />
              Keywords
            </button>
          </div>
        )}
        {!keywordMode && (
          <button className="ml-auto inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50 disabled:opacity-50" type="button" onClick={toggleIgnoredTag} disabled={!activeTag || loading}>
            {activeTagIgnored ? <Eye size={16} /> : <X size={16} />}
            {activeTagIgnored ? 'Unignore tag' : 'Ignore tag'}
          </button>
        )}
        <button className={`${keywordMode ? 'ml-auto ' : ''}inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50 disabled:opacity-50`} type="button" onClick={handleMarkSelectedRead} disabled={loading}>
          <CheckSquare size={16} />
          Mark as Read
          {selectedCount > 0 && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{selectedCount}</span>}
        </button>
        {selectionFeedback && <span className="text-xs font-medium text-amber-700" role="status">{selectionFeedback}</span>}
      </div>

      <form className="flex flex-wrap gap-2" onSubmit={submitQuery} role="search" aria-label={keywordMode ? 'Keyword search' : 'Post query'}>
        {keywordMode ? (
          <label className="min-w-0 flex-1">
            <span className="sr-only">Keywords</span>
            <div className="flex h-11 items-center gap-2 rounded-md border border-slate-300 px-2 focus-within:border-blue-500">
              <Search size={16} className="text-slate-400" />
              <input className="min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="title or body keywords" />
            </div>
          </label>
        ) : (
          <label className="min-w-0 flex-1">
            <span className="sr-only">Tag, author, app, excluded tags</span>
            <div className="flex h-11 items-center gap-2 rounded-md border border-slate-300 px-2 focus-within:border-blue-500">
              <Search size={16} className="text-slate-400" />
              <input className="min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm" value={draftTag} onChange={(event) => setDraftTag(event.target.value)} placeholder="photography @author app:peakd -contests" />
            </div>
          </label>
        )}
        <label className="inline-flex h-11 min-w-0 items-center gap-2 rounded-md border border-slate-300 bg-white px-2 text-sm">
          <span className="text-xs font-medium text-slate-500">Sort</span>
          <select className="min-w-0 bg-transparent text-base outline-none md:text-sm" value={query.sort} onChange={(event) => updateQuery({sort: event.target.value})} aria-label="Sort posts">
            {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:min-w-24" type="submit" disabled={loading} aria-label="Search">
          <Search size={16} />
          <span className="hidden sm:inline">Search</span>
        </button>
        <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:min-w-24" type="button" onClick={resetQueryInput} disabled={loading} aria-label="Reset">
          <RotateCcw size={16} />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!keywordMode && <ModeSelector query={query} counts={payload?.mode_counts} compact={compactModeSelector} onChange={updateQuery} />}
        {!keywordMode && (
          <>
            <PreferenceChip active={payload?.query?.muted_authors_enabled} iconOn={VolumeX} iconOff={Volume2} label="Mute" onClick={toggleMute} disabled={!payload || loading} />
            <PreferenceChip active={payload?.query?.only_favorite_tags} iconOn={Star} iconOff={StarOff} label="Favorites" onClick={toggleOnlyFavorites} disabled={!payload || loading} />
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm disabled:opacity-50" type="button" onClick={onOpenTags} disabled={!payload || loading}>
              <Tags size={16} />
              Tags
            </button>
          </>
        )}
      </div>
    </div>
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
