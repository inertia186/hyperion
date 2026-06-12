import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { api } from './api'
import { useCurationKeyboard } from './useCurationKeyboard'
import { useCurationPosts } from './useCurationPosts'
import { useCurationPreferences } from './useCurationPreferences'
import { useCurationSearch } from './useCurationSearch'
import { useDesktopPreviewResize } from './useDesktopPreviewResize'
import { useMediaQuery } from './useMediaQuery'
import { usePostPreview } from './usePostPreview'
import { postsPayloadWithChainStats, postsPayloadWithPayout } from './postPayloadUpdates'
import { postReadTransition, selectedIdsAfterPostRead, selectedLoadedPostIds, selectedReadTransition } from './curationReadState'
import { scrollPreviewPane } from './previewScroll'
import CurationPostListPanel from './components/CurationPostListPanel'
import CurationPreviewPanels from './components/CurationPreviewPanels'
import TagsModal from './components/TagsModal'
import Toolbar from './components/Toolbar'
import {
  COMPACT_MODE_SELECTOR_PREVIEW_PERCENT,
  emptyContextSuggestions,
  keywordSuggestionFromFilterQuery,
  postsResultCountLabel,
  selectionAfterAllMatching,
  selectionAfterLoadedToggle,
  selectionAfterPostToggle
} from './curationInboxState'

const CurationInbox = forwardRef(function CurationInbox({session, refreshKey = 0, resetKey = 0, theme = 'light', helpVisible = false, setHelpVisible = () => {}, onRefreshVotingPower}, ref) {
  const [selectedId, setSelectedId] = useState(null)
  const [selectedPostIds, setSelectedPostIds] = useState(() => new Set())
  const [allMatchingSelected, setAllMatchingSelected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [previewActive, setPreviewActive] = useState(false)
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const desktopLayoutRef = useRef(null)
  const listScrollRef = useRef(null)
  const desktopPreviewScrollRef = useRef(null)
  const mobilePreviewScrollRef = useRef(null)
  const loadMoreRef = useRef(null)
  const isMobilePreviewLayout = useMediaQuery('(max-width: 1279px)')
  const {desktopLayoutStyle, desktopPreviewPercent, startDesktopResize} = useDesktopPreviewResize(desktopLayoutRef)
  const previewState = usePostPreview(selectedId, {desktopPreviewScrollRef, mobilePreviewScrollRef})
  const closePreview = useCallback(() => {
    setPreviewActive(false)
    if (isMobilePreviewLayout) setMobilePreviewOpen(false)
  }, [isMobilePreviewLayout])
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
    setSelectedPostIds(new Set())
    setAllMatchingSelected(false)
    setSelectedId((current) => current && payload.posts.some((post) => post.id === current) ? current : payload.posts[0]?.id || null)
    applyLoadedQuery(payload.query)
  }, [applyLoadedQuery])
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

  const posts = postsPayload?.posts || []
  const selectedIndex = posts.findIndex((post) => post.id === selectedId)
  const selectedPost = posts[selectedIndex] || null
  const ignoredTags = postsPayload?.ignored_tags || session.ignored_tags || []
  const poisonedPillTags = postsPayload?.poisoned_pill_tags || session.poisoned_pill_tags || []
  const favoriteTags = postsPayload?.favorite_tags || session.favorite_tags || []
  const pastTags = postsPayload?.past_tags || session.past_tags || []
  const activeTag = postsPayload?.query?.tag || ''
  const activeTagIgnored = activeTag && ignoredTags.includes(activeTag)
  const pagination = postsPayload?.pagination
  const totalPosts = pagination?.total_count || 0
  const loadedPostsCount = posts.length
  const resultCountLabel = postsPayload ? postsResultCountLabel(postsPayload.query, totalPosts, loadedPostsCount, hasMorePosts) : ''
  const keywordSearchSuggestion = postsPayload && !postsPayload.query?.only_keyword ? keywordSuggestionFromFilterQuery(postsPayload.query) : ''
  const keywordDidYouMean = postsPayload?.query?.only_keyword ? postsPayload.keyword_suggestion : ''
  const contextSuggestions = postsPayload && !postsPayload.query?.only_keyword ? emptyContextSuggestions(postsPayload.query, postsPayload.mode_counts) : []
  const visibleSelectionCount = allMatchingSelected ? totalPosts : selectedPostIds.size
  const allLoadedSelected = posts.length > 0 && posts.every((post) => selectedPostIds.has(post.id))
  const canSelectAllMatching = allLoadedSelected && !allMatchingSelected && totalPosts > loadedPostsCount
  const compactModeSelector = isMobilePreviewLayout || desktopPreviewPercent >= COMPACT_MODE_SELECTOR_PREVIEW_PERCENT
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

  useEffect(() => {
    if (!hasMorePosts || loading || loadingMore || typeof IntersectionObserver === 'undefined') return undefined

    const target = loadMoreRef.current
    if (!target) return undefined

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMorePosts()
    }, {rootMargin: '600px 0px'})

    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMorePosts, loading, loadingMore, loadMorePosts])

  useEffect(() => {
    if (!isMobilePreviewLayout) {
      setMobilePreviewOpen(false)
    }
  }, [isMobilePreviewLayout])

  useEffect(() => {
    document.body.classList.toggle('mobile-preview-open', mobilePreviewOpen && isMobilePreviewLayout)

    return () => document.body.classList.remove('mobile-preview-open')
  }, [isMobilePreviewLayout, mobilePreviewOpen])

  const selectedPostRef = useRef(null)
  selectedPostRef.current = selectedPost

  const applyReadTransition = useCallback((transition) => {
    if (transition.clearPreview) {
      setSelectedId(null)
      setPreviewActive(false)
      setMobilePreviewOpen(false)
      return
    }

    if (transition.selectedId !== null && transition.selectedId !== selectedId) setSelectedId(transition.selectedId)
  }, [selectedId])

  const markPostReadAndMove = useCallback(async (post, direction = 1) => {
    if (!post) return

    setBusy(true)
    try {
      const result = await api.markRead(post.id)
      setAllMatchingSelected(false)
      setSelectedPostIds((current) => selectedIdsAfterPostRead(current, post.id))
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
  }, [applyReadTransition, handleLoadError, query])

  const togglePostSelection = (postId) => {
    const selection = selectionAfterPostToggle(postId, posts, selectedPostIds, allMatchingSelected)
    setAllMatchingSelected(selection.allMatchingSelected)
    setSelectedPostIds(selection.selectedPostIds)
  }

  const toggleLoadedSelection = () => {
    const selection = selectionAfterLoadedToggle(posts, allLoadedSelected, allMatchingSelected)
    setAllMatchingSelected(selection.allMatchingSelected)
    setSelectedPostIds(selection.selectedPostIds)
  }

  const selectAllMatching = () => {
    const selection = selectionAfterAllMatching(posts)
    setSelectedPostIds(selection.selectedPostIds)
    setAllMatchingSelected(selection.allMatchingSelected)
  }

  const clearSelection = () => {
    setSelectedPostIds(new Set())
    setAllMatchingSelected(false)
  }

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

  useEffect(() => {
    if (!selectedId) return

    const row = listScrollRef.current?.querySelector('[data-selected="true"]')
    row?.scrollIntoView?.({block: 'center'})
  }, [selectedId])

  const moveSelection = useCallback((direction) => {
    if (!posts.length) return
    const nextIndex = Math.min(Math.max(selectedIndex + direction, 0), posts.length - 1)
    setSelectedId(posts[nextIndex].id)
  }, [posts, selectedIndex])

  const openPreview = useCallback(() => {
    setPreviewActive(true)
    if (isMobilePreviewLayout) setMobilePreviewOpen(true)
  }, [isMobilePreviewLayout])

  const togglePreview = useCallback(() => {
    if (previewActive) {
      closePreview()
    } else {
      openPreview()
    }
  }, [closePreview, openPreview, previewActive])

  const selectPost = (postId) => {
    setSelectedId(postId)
    if (isMobilePreviewLayout) openPreview()
  }

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
            onToggleLoaded={toggleLoadedSelection}
            onSelectAllMatching={selectAllMatching}
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
            onToggleSelected={togglePostSelection}
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
