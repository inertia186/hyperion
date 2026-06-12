import { Loader2 } from 'lucide-react'
import PostList from './PostList'
import PostListSkeleton from './PostListSkeleton'
import SelectionBar from './SelectionBar'

export default function CurationPostListPanel({
  listScrollRef,
  loading,
  resultCountLabel,
  posts,
  allLoadedSelected,
  allMatchingSelected,
  canSelectAllMatching,
  loadedPostsCount,
  selectedCount,
  totalPosts,
  onToggleLoaded,
  onSelectAllMatching,
  onClearSelection,
  contextSuggestions,
  keywordSearchSuggestion,
  keywordDidYouMean,
  onApplySuggestion,
  onSearchKeywordsFromFilters,
  onSearchKeywordSuggestion,
  selectedId,
  selectedPostIds,
  ignoredTags,
  onSelect,
  onToggleSelected,
  onSelectTag,
  onSelectAuthor,
  onPayoutRefresh,
  loadMoreRef,
  postsPayload,
  loadMoreError,
  hasMorePosts,
  loadingMore,
  onLoadMore
}) {
  return (
    <>
      <div ref={listScrollRef} className="post-list-shell overflow-hidden rounded-md border border-slate-200 bg-white">
        <div className={`flex items-center gap-3 border-b px-3 py-2 text-xs ${loading ? 'border-blue-100 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-500'}`}>
          {loading ? (
            <span className="inline-flex items-center gap-2 font-semibold" role="status" aria-live="polite">
              <Loader2 className="animate-spin" size={14} aria-hidden="true" />
              Loading posts...
            </span>
          ) : (
            <span>{resultCountLabel}</span>
          )}
        </div>
        {!loading && posts.length > 0 && (
          <SelectionBar
            allLoadedSelected={allLoadedSelected}
            allMatchingSelected={allMatchingSelected}
            canSelectAllMatching={canSelectAllMatching}
            loadedPostsCount={loadedPostsCount}
            selectedCount={selectedCount}
            totalPosts={totalPosts}
            onToggleLoaded={onToggleLoaded}
            onSelectAllMatching={onSelectAllMatching}
            onClearSelection={onClearSelection}
          />
        )}
        {loading ? (
          <PostListSkeleton />
        ) : posts.length === 0 ? (
          <EmptyPostList
            contextSuggestions={contextSuggestions}
            keywordSearchSuggestion={keywordSearchSuggestion}
            keywordDidYouMean={keywordDidYouMean}
            onApplySuggestion={onApplySuggestion}
            onSearchKeywordsFromFilters={onSearchKeywordsFromFilters}
            onSearchKeywordSuggestion={onSearchKeywordSuggestion}
          />
        ) : (
          <PostList
            posts={posts}
            selectedId={selectedId}
            selectedPostIds={selectedPostIds}
            allMatchingSelected={allMatchingSelected}
            ignoredTags={ignoredTags}
            onSelect={onSelect}
            onToggleSelected={onToggleSelected}
            onSelectTag={onSelectTag}
            onSelectAuthor={onSelectAuthor}
            onPayoutRefresh={onPayoutRefresh}
          />
        )}
      </div>

      {!loading && postsPayload && (
        <div ref={loadMoreRef} className="mt-3 flex flex-col items-center gap-2 text-sm text-slate-500">
          {loadMoreError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">{loadMoreError}</div>}
          {hasMorePosts ? (
            <button className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50 disabled:opacity-50" type="button" onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading more...' : 'Load more'}
            </button>
          ) : posts.length > 0 ? (
            <span>All loaded</span>
          ) : null}
        </div>
      )}
    </>
  )
}

function EmptyPostList({contextSuggestions, keywordSearchSuggestion, keywordDidYouMean, onApplySuggestion, onSearchKeywordsFromFilters, onSearchKeywordSuggestion}) {
  return (
    <div className="px-4 py-12 text-center text-sm text-slate-500">
      <div>All caught up for this view.</div>
      {contextSuggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {contextSuggestions.map((mode) => (
            <button key={mode.key} className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" type="button" onClick={() => onApplySuggestion(mode.updates)}>
              View {mode.label} ({mode.count})
            </button>
          ))}
        </div>
      )}
      {keywordSearchSuggestion && (
        <div className="mt-3">
          <button className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" type="button" onClick={onSearchKeywordsFromFilters}>
            Search keywords for "{keywordSearchSuggestion}"
          </button>
        </div>
      )}
      {keywordDidYouMean && (
        <div className="mt-3">
          <span className="mr-2">Did you mean:</span>
          <button className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" type="button" onClick={onSearchKeywordSuggestion}>
            {keywordDidYouMean}
          </button>
        </div>
      )}
    </div>
  )
}
