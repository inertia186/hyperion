import { useEffect, useRef, useState } from 'react'
import { CheckSquare, Eye, Filter, RotateCcw, Search, Star, StarOff, Volume2, VolumeX, X } from 'lucide-react'
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
    <div className="toolbar-shell mb-3 rounded-md border border-slate-200 bg-white p-2.5 sm:p-3">
      <div ref={actionRowRef} className="mb-2 flex flex-wrap items-center gap-2">
        {compactSearchForm ? (
          <label className="inline-flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-300 bg-white px-2 text-sm sm:h-9 sm:flex-none">
            <span className="text-xs font-medium text-slate-500">Search</span>
            <select className="min-w-0 bg-transparent text-base outline-none md:text-sm" value={searchMode} onChange={(event) => setSearchMode(event.target.value)} aria-label="Search form">
              <option value="filters">Filters</option>
              <option value="keyword">Keywords</option>
            </select>
          </label>
        ) : (
          <div className="inline-flex min-w-0 flex-1 overflow-hidden rounded-md border border-slate-300 bg-white sm:flex-none" role="group" aria-label="Search form">
            <button className={`inline-flex h-10 flex-1 items-center justify-center gap-2 border-r border-slate-300 px-3 text-sm sm:h-9 sm:flex-none ${!keywordMode ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50'}`} type="button" onClick={() => setSearchMode('filters')} aria-pressed={!keywordMode}>
              <Filter size={16} />
              Filters
            </button>
            <button className={`inline-flex h-10 flex-1 items-center justify-center gap-2 px-3 text-sm sm:h-9 sm:flex-none ${keywordMode ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50'}`} type="button" onClick={() => setSearchMode('keyword')} aria-pressed={keywordMode}>
              <Search size={16} />
              Keywords
            </button>
          </div>
        )}
        {!keywordMode && (
          <button className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50 disabled:opacity-50 sm:ml-auto sm:h-9 sm:flex-none" type="button" onClick={toggleIgnoredTag} disabled={!activeTag || loading}>
            {activeTagIgnored ? <Eye size={16} /> : <X size={16} />}
            {activeTagIgnored ? 'Unignore tag' : 'Ignore tag'}
          </button>
        )}
        <button className={`${keywordMode ? 'sm:ml-auto ' : ''}inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50 disabled:opacity-50 sm:h-9 sm:flex-none`} type="button" onClick={handleMarkSelectedRead} disabled={loading}>
          <CheckSquare size={16} />
          Mark as Read
          {selectedCount > 0 && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{selectedCount}</span>}
        </button>
        {selectionFeedback && <span className="text-xs font-medium text-amber-700" role="status">{selectionFeedback}</span>}
      </div>

      <form className="flex flex-wrap gap-2" onSubmit={submitQuery} role="search" aria-label={keywordMode ? 'Keyword search' : 'Post query'}>
        {keywordMode ? (
          <label className="toolbar-search-field min-w-[18rem] flex-[999_1_24rem] max-[520px]:min-w-full">
            <span className="toolbar-search-label mb-1 block text-xs font-medium text-slate-500">Keyword search</span>
            <div className="toolbar-search-control flex h-11 items-center gap-2 rounded-md border border-slate-300 px-2 focus-within:border-blue-500">
              <Search size={16} className="text-slate-400" />
              <input className="min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="Search title or body keywords" />
            </div>
          </label>
        ) : (
          <label className="toolbar-search-field min-w-[18rem] flex-[999_1_24rem] max-[520px]:min-w-full">
            <span className="sr-only">Tag, author, app, excluded tags</span>
            <div className="toolbar-search-control flex h-11 items-center gap-2 rounded-md border border-slate-300 px-2 focus-within:border-blue-500">
              <Search size={16} className="text-slate-400" />
              <input className="min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm" value={draftTag} onChange={(event) => setDraftTag(event.target.value)} placeholder="photography @author app:peakd -contests" />
            </div>
          </label>
        )}
        <label className="inline-flex h-11 w-[8.5rem] flex-none items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 text-sm sm:w-auto sm:gap-2">
          <span className="hidden text-xs font-medium text-slate-500 sm:inline">Sort</span>
          <select className="w-full min-w-0 bg-transparent text-base outline-none sm:w-auto md:text-sm" value={query.sort} onChange={(event) => updateQuery({sort: event.target.value})} aria-label="Sort posts">
            {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <span className="hidden min-w-0 flex-1 max-[520px]:block" aria-hidden="true" />
        <button className="inline-flex h-11 w-11 flex-none items-center justify-center gap-2 rounded-md bg-blue-600 px-0 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 min-[680px]:w-auto min-[680px]:min-w-24 min-[680px]:px-3" type="submit" disabled={loading} aria-label="Search">
          <Search size={16} />
          <span className="hidden min-[680px]:inline">Search</span>
        </button>
        <button className="inline-flex h-11 w-11 flex-none items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-0 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 min-[680px]:w-auto min-[680px]:min-w-24 min-[680px]:px-3" type="button" onClick={resetQueryInput} disabled={loading} aria-label="Reset">
          <RotateCcw size={16} />
          <span className="hidden min-[680px]:inline">Reset</span>
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!keywordMode && <ModeSelector query={query} counts={payload?.mode_counts} compact={compactModeSelector} onChange={updateQuery} />}
        {!keywordMode && (
          <>
            <PreferenceChip active={payload?.query?.muted_authors_enabled} iconOn={VolumeX} iconOff={Volume2} label="Mute" onClick={toggleMute} disabled={!payload || loading} />
            <PreferenceChip active={payload?.query?.only_favorite_tags} iconOn={Star} iconOff={StarOff} label="Favorites" onClick={toggleOnlyFavorites} disabled={!payload || loading} />
          </>
        )}
      </div>
    </div>
  )
}

function PreferenceChip({active, iconOn: IconOn, iconOff: IconOff, label, onClick, disabled}) {
  const Icon = active ? IconOn : IconOff
  return (
    <button className={`inline-flex h-10 w-10 items-center justify-center gap-2 rounded-md border px-0 text-sm disabled:opacity-50 min-[680px]:w-auto min-[680px]:px-3 ${active ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white'}`} type="button" onClick={onClick} disabled={disabled} aria-pressed={!!active} aria-label={label}>
      <Icon size={16} />
      <span className="hidden min-[680px]:inline">{label}</span>
    </button>
  )
}
