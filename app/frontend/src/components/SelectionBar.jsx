import { CheckSquare, Square } from 'lucide-react'

export default function SelectionBar({
  allLoadedSelected,
  allMatchingSelected,
  canSelectAllMatching,
  loadedPostsCount,
  selectedCount,
  totalPosts,
  onToggleLoaded,
  onSelectAllMatching,
  onClearSelection
}) {
  const hasSelection = selectedCount > 0

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-2 text-slate-700 hover:bg-slate-50" type="button" onClick={onToggleLoaded} aria-label={allLoadedSelected || allMatchingSelected ? 'Clear loaded selection' : 'Select loaded posts'} aria-pressed={allLoadedSelected || allMatchingSelected}>
        {allLoadedSelected || allMatchingSelected ? <CheckSquare size={16} /> : <Square size={16} />}
        <span className="text-xs font-medium">{allLoadedSelected || allMatchingSelected ? 'Selected' : 'Select loaded'}</span>
      </button>

      <div className="min-w-0 flex-1 text-xs text-slate-600">
        {allMatchingSelected ? (
          <span>All {totalPosts} posts in this filter selected.</span>
        ) : hasSelection ? (
          <span>{selectedCount} selected.</span>
        ) : (
          <span>Select loaded posts for bulk actions.</span>
        )}
        {canSelectAllMatching && (
          <>
            <span> All {loadedPostsCount} loaded posts selected. </span>
            <button className="font-medium text-blue-700 hover:underline" type="button" onClick={onSelectAllMatching}>
              Select all {totalPosts} posts in this filter.
            </button>
          </>
        )}
      </div>

      {hasSelection && (
        <button className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 hover:bg-slate-50" type="button" onClick={onClearSelection}>
          Clear selection
        </button>
      )}
    </div>
  )
}
