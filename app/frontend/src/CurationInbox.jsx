import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { api } from './api'
import { useCurationKeyboard } from './useCurationKeyboard'
import { useCurationPosts } from './useCurationPosts'
import { useCurationPreferences } from './useCurationPreferences'
import { useCurationPreviewState } from './useCurationPreviewState'
import { useCurationSearch } from './useCurationSearch'
import { useCurationSelection } from './useCurationSelection'
import { useDesktopPreviewResize } from './useDesktopPreviewResize'
import { useInfiniteLoadMore } from './useInfiniteLoadMore'
import { useMediaQuery } from './useMediaQuery'
import { usePostPreview } from './usePostPreview'
import { useSelectedPostListScroll } from './useSelectedPostListScroll'
import { postsPayloadWithChainStats, postsPayloadWithPayout } from './postPayloadUpdates'
import { postReadTransition, selectedLoadedPostIds, selectedReadTransition } from './curationReadState'
import { curationViewState } from './curationViewState'
import { scrollPreviewPane } from './previewScroll'
import CurationPostListPanel from './components/CurationPostListPanel'
import CurationPreviewPanels from './components/CurationPreviewPanels'
import TagsModal from './components/TagsModal'
import Toolbar from './components/Toolbar'

const CurationInbox = forwardRef(function CurationInbox({session, refreshKey = 0, resetKey = 0, theme = 'light', helpVisible = false, setHelpVisible = () => {}, onRefreshVotingPower}, ref) {
  const [busy, setBusy] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const desktopLayoutRef = useRef(null)
  const desktopPreviewScrollRef = useRef(null)
  const mobilePreviewScrollRef = useRef(null)
  const isMobilePreviewLayout = useMediaQuery('(max-width: 1279px)')
  const {desktopLayoutStyle, desktopPreviewPercent, startDesktopResize} = useDesktopPreviewResize(desktopLayoutRef)
  const {
    selectedId,
    setSelectedId,
    selectedPostIds,
    allMatchingSelected,
    applyLoadedSelection,
    applyReadTransition: applySelectionReadTransition,
    removeSelectedPostId,
    clearAllMatchingSelection,
    togglePostSelection,
    toggleLoadedSelection,
    selectAllMatching,
    clearSelection
  } = useCurationSelection()
  const previewState = usePostPreview(selectedId, {desktopPreviewScrollRef, mobilePreviewScrollRef})
  const {
    previewActive,
    setPreviewActive,
    mobilePreviewOpen,
    setMobilePreviewOpen,
    closePreview,
    togglePreview,
    selectPost
  } = useCurationPreviewState({isMobilePreviewLayout, setSelectedId})
  const closeTags = useCallback(() => setTagsOpen(false), [])

  const {
    query,
    setQuery,
    draftTag,
    setDraftTag,
    draftQuery,
    setDraftQuery,
    searchMode,
    setSearchMode,
    applyLoadedQuery,
    updateQuery,
    updateSignal,
    submitQuery,
    resetQueryInput,
    searchKeywordsFromFilters,
    searchKeywordSuggestion,
    focusTag,
    focusAuthor
  } = useCurationSearch({
    resetKey,
    closePreviewOnFocus: isMobilePreviewLayout,
    onClosePreview: closePreview,
    onCloseTags: closeTags
  })

  const applyLoadedPosts = useCallback((payload) => {
    applyLoadedSelection(payload)
    applyLoadedQuery(payload.query)
  }, [applyLoadedQuery, applyLoadedSelection])
  const {
    postsPayload,
    setPostsPayload,
    loading,
    loadingMore,
    error,
    loadMoreError,
    hasMorePosts,
    loadMorePosts,
    handleLoadError
  } = useCurationPosts({query, refreshKey, onPostsLoaded: applyLoadedPosts})

  const {
    posts,
    selectedIndex,
    selectedPost,
    ignoredTags,
    poisonedPillTags,
    favoriteTags,
    pastTags,
    activeTag,
    activeTagIgnored,
    totalPosts,
    loadedPostsCount,
    resultCountLabel,
    keywordSearchSuggestion,
    keywordDidYouMean,
    contextSuggestions,
    visibleSelectionCount,
    allLoadedSelected,
    canSelectAllMatching,
    compactModeSelector
  } = curationViewState({
    postsPayload,
    session,
    selectedId,
    selectedPostIds,
    allMatchingSelected,
    hasMorePosts,
    isMobilePreviewLayout,
    desktopPreviewPercent
  })
  const listScrollRef = useSelectedPostListScroll(selectedId)
  const loadMoreRef = useInfiniteLoadMore({hasMorePosts, loading, loadingMore, onLoadMore: loadMorePosts})
  const {
    toggleMute,
    toggleOnlyFavorites,
    toggleIgnoredTag,
    toggleFavorite,
    togglePoisonedPill,
    removePastTag,
    clearPastTags,
    clearIgnoredTags
  } = useCurationPreferences({
    postsPayload,
    activeTag,
    activeTagIgnored,
    favoriteTags,
    poisonedPillTags,
    setPostsPayload,
    setQuery,
    setBusy,
    handleError: handleLoadError
  })

  const selectedPostRef = useRef(null)
  selectedPostRef.current = selectedPost

  const applyReadTransition = useCallback((transition) => {
    if (applySelectionReadTransition(transition)) {
      setPreviewActive(false)
      setMobilePreviewOpen(false)
    }
  }, [applySelectionReadTransition, setMobilePreviewOpen, setPreviewActive])

  const markPostReadAndMove = useCallback(async (post, direction = 1) => {
    if (!post) return

    setBusy(true)
    try {
      const result = await api.markRead(post.id)
      clearAllMatchingSelection()
      removeSelectedPostId(post.id)
      setPostsPayload((payload) => {
        const transition = postReadTransition(payload, {post, result, query, direction})
        applyReadTransition(transition)
        return transition.payload
      })
    } catch (err) {
      handleLoadError(err)
    } finally {
      setBusy(false)
    }
  }, [applyReadTransition, clearAllMatchingSelection, handleLoadError, query, removeSelectedPostId])

  const markSelectedRead = async () => {
    const postIds = selectedLoadedPostIds(posts, selectedPostIds)
    if (!postIds.length && !allMatchingSelected) return

    setBusy(true)
    try {
      const result = await api.markManyRead(allMatchingSelected ? {all_matching: true, query} : postIds)
      clearSelection()
      setPostsPayload((payload) => {
        const transition = selectedReadTransition(payload, {postIds, allMatchingSelected, result, query, selectedId})
        applyReadTransition(transition)
        return transition.payload
      })
    } catch (err) {
      handleLoadError(err)
    } finally {
      setBusy(false)
    }
  }

  const updatePostChainStats = useCallback((postId, statsPayload, options = {}) => {
    if (!statsPayload || statsPayload.status !== 'ready') return

    setPostsPayload((payload) => postsPayloadWithChainStats(payload, postId, statsPayload))
    if (options.refreshVotingPower) onRefreshVotingPower?.()
  }, [onRefreshVotingPower])

  const updatePostPayout = useCallback((postId, payoutPayload) => {
    if (!payoutPayload || payoutPayload.status !== 'ready') return

    setPostsPayload((payload) => postsPayloadWithPayout(payload, postId, payoutPayload))
  }, [])

  const moveSelection = useCallback((direction) => {
    if (!posts.length) return
    const nextIndex = Math.min(Math.max(selectedIndex + direction, 0), posts.length - 1)
    setSelectedId(posts[nextIndex].id)
  }, [posts, selectedIndex])

  useImperativeHandle(ref, () => ({
    openTags: () => setTagsOpen(true),
    focusAuthor
  }), [focusAuthor])

  const markSelectedReadAndMove = useCallback((direction) => {
    markPostReadAndMove(selectedPostRef.current, direction)
  }, [markPostReadAndMove])

  const markSelectedReadAndMoveNext = useCallback(() => {
    markPostReadAndMove(selectedPostRef.current, 1)
  }, [markPostReadAndMove])

  const scrollPreview = useCallback((direction) => {
    const pane = mobilePreviewOpen ? mobilePreviewScrollRef.current : desktopPreviewScrollRef.current
    const result = scrollPreviewPane(pane, direction)
    if (result.advanceSelection) moveSelection(direction)
  }, [mobilePreviewOpen, moveSelection])

  useCurationKeyboard({
    enabled: !loading && !busy,
    hasPosts: posts.length > 0,
    previewActive,
    setPreviewActive,
    togglePreview,
    closePreview,
    moveSelection,
    markSelectedReadAndMove,
    scrollPreview,
    shortcutsVisible: helpVisible,
    setShortcutsVisible: setHelpVisible
  })

  const updateTagPanelQuery = (updates) => {
    if (Object.prototype.hasOwnProperty.call(updates, 'tag')) {
      focusTag(updates.tag)
      return
    }

    updateQuery(updates)
  }

  const tagPanelProps = {
    relatedTags: postsPayload?.related_tags || [],
    pastTags,
    favoriteTags,
    ignoredTags,
    poisonedPillTags,
    activeTag,
    updateQuery: updateTagPanelQuery,
    toggleFavorite,
    togglePoisonedPill,
    removePastTag,
    clearPastTags,
    clearIgnoredTags
  }

  return (
    <>
      <main ref={desktopLayoutRef} className="curation-desktop-layout safe-area-bottom mx-auto grid max-w-[1800px] grid-cols-1 gap-4 px-3 py-3 sm:px-4 sm:py-4" style={desktopLayoutStyle}>
        <section className="min-w-0">
          <Toolbar
            query={query}
            draftTag={draftTag}
            setDraftTag={setDraftTag}
            draftQuery={draftQuery}
            setDraftQuery={setDraftQuery}
            searchMode={searchMode}
            setSearchMode={setSearchMode}
            submitQuery={submitQuery}
            resetQueryInput={resetQueryInput}
            updateQuery={updateQuery}
            updateSignal={updateSignal}
            markSelectedRead={markSelectedRead}
            selectedCount={visibleSelectionCount}
            toggleIgnoredTag={toggleIgnoredTag}
            activeTag={activeTag}
            activeTagIgnored={activeTagIgnored}
            loading={loading || busy}
            payload={postsPayload}
            toggleMute={toggleMute}
            toggleOnlyFavorites={toggleOnlyFavorites}
            compactModeSelector={compactModeSelector}
          />

          {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <CurationPostListPanel
            listScrollRef={listScrollRef}
            loading={loading}
            resultCountLabel={resultCountLabel}
            posts={posts}
            allLoadedSelected={allLoadedSelected}
            allMatchingSelected={allMatchingSelected}
            canSelectAllMatching={canSelectAllMatching}
            loadedPostsCount={loadedPostsCount}
            selectedCount={visibleSelectionCount}
            totalPosts={totalPosts}
            onToggleLoaded={() => toggleLoadedSelection(posts, allLoadedSelected)}
            onSelectAllMatching={() => selectAllMatching(posts)}
            onClearSelection={clearSelection}
            contextSuggestions={contextSuggestions}
            keywordSearchSuggestion={keywordSearchSuggestion}
            keywordDidYouMean={keywordDidYouMean}
            onApplySuggestion={(updates) => updateQuery(updates)}
            onSearchKeywordsFromFilters={() => searchKeywordsFromFilters(keywordSearchSuggestion)}
            onSearchKeywordSuggestion={() => searchKeywordSuggestion(keywordDidYouMean)}
            selectedId={selectedId}
            selectedPostIds={selectedPostIds}
            ignoredTags={ignoredTags}
            onSelect={selectPost}
            onToggleSelected={(postId) => togglePostSelection(postId, posts)}
            onSelectTag={focusTag}
            onSelectAuthor={focusAuthor}
            onPayoutRefresh={updatePostPayout}
            loadMoreRef={loadMoreRef}
            postsPayload={postsPayload}
            loadMoreError={loadMoreError}
            hasMorePosts={hasMorePosts}
            loadingMore={loadingMore}
            onLoadMore={loadMorePosts}
          />
        </section>

        {!isMobilePreviewLayout && (
          <div className="desktop-resize-handle hidden xl:flex" role="separator" aria-label="Resize list and post view" aria-orientation="vertical" tabIndex={0} onPointerDown={startDesktopResize}>
            <span />
          </div>
        )}

        <CurationPreviewPanels
          mobilePreviewOpen={mobilePreviewOpen}
          selectedPost={selectedPost}
          previewState={previewState}
          previewActive={previewActive}
          desktopPreviewScrollRef={desktopPreviewScrollRef}
          mobilePreviewScrollRef={mobilePreviewScrollRef}
          accountName={session.account.name}
          hivesignerAvailable={session.preferences.hivesigner_available}
          theme={theme}
          onClosePreview={closePreview}
          onPrevious={() => moveSelection(-1)}
          onNext={() => moveSelection(1)}
          onMarkReadNext={markSelectedReadAndMoveNext}
          onSelectTag={focusTag}
          onSelectAuthor={focusAuthor}
          onChainStatsRefresh={updatePostChainStats}
          readBusy={busy}
          hasPrevious={selectedIndex > 0}
          hasNext={selectedIndex >= 0 && selectedIndex < posts.length - 1}
        />
      </main>

      <TagsModal
        open={tagsOpen}
        onClose={closeTags}
        tagPanelProps={tagPanelProps}
      />

    </>
  )
})

export default CurationInbox
