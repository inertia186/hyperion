import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { initialQuery } from './constants'
import { queryParams } from './format'
import { useCurationKeyboard } from './useCurationKeyboard'
import { useCurationPreferences } from './useCurationPreferences'
import { useDesktopPreviewResize } from './useDesktopPreviewResize'
import { useMediaQuery } from './useMediaQuery'
import { usePostPreview } from './usePostPreview'
import { postsPayloadWithChainStats, postsPayloadWithPayout } from './postPayloadUpdates'
import { appendCurationPage, curationHasMorePosts } from './curationPagination'
import { scrollPreviewPane } from './previewScroll'
import CurationPostListPanel from './components/CurationPostListPanel'
import CurationPreviewPanels from './components/CurationPreviewPanels'
import TagsModal from './components/TagsModal'
import Toolbar from './components/Toolbar'
import {
  COMPACT_MODE_SELECTOR_PREVIEW_PERCENT,
  adjustReadCounts,
  emptyContextSuggestions,
  keywordSuggestionFromFilterQuery,
  parseQueryInput,
  postsResultCountLabel,
  queryInputValue,
  selectionAfterPostRemoval,
  selectionAfterPostsRemoval
} from './curationInboxState'

const CurationInbox = forwardRef(function CurationInbox({session, refreshKey = 0, resetKey = 0, theme = 'light', helpVisible = false, setHelpVisible = () => {}, onRefreshVotingPower}, ref) {
  const [query, setQuery] = useState(initialQuery)
  const [draftTag, setDraftTag] = useState('')
  const [draftQuery, setDraftQuery] = useState('')
  const [searchMode, setSearchMode] = useState('filters')
  const [postsPayload, setPostsPayload] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [selectedPostIds, setSelectedPostIds] = useState(() => new Set())
  const [allMatchingSelected, setAllMatchingSelected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [loadMoreError, setLoadMoreError] = useState(null)
  const [previewActive, setPreviewActive] = useState(false)
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const desktopLayoutRef = useRef(null)
  const listScrollRef = useRef(null)
  const desktopPreviewScrollRef = useRef(null)
  const mobilePreviewScrollRef = useRef(null)
  const loadMoreRef = useRef(null)
  const resetKeyRef = useRef(resetKey)
  const isMobilePreviewLayout = useMediaQuery('(max-width: 1279px)')
  const {desktopLayoutStyle, desktopPreviewPercent, startDesktopResize} = useDesktopPreviewResize(desktopLayoutRef)
  const previewState = usePostPreview(selectedId, {desktopPreviewScrollRef, mobilePreviewScrollRef})

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
  const hasMorePosts = curationHasMorePosts(pagination)
  const resultCountLabel = postsPayload ? postsResultCountLabel(postsPayload.query, totalPosts, loadedPostsCount, hasMorePosts) : ''
  const keywordSearchSuggestion = postsPayload && !postsPayload.query?.only_keyword ? keywordSuggestionFromFilterQuery(postsPayload.query) : ''
  const keywordDidYouMean = postsPayload?.query?.only_keyword ? postsPayload.keyword_suggestion : ''
  const contextSuggestions = postsPayload && !postsPayload.query?.only_keyword ? emptyContextSuggestions(postsPayload.query, postsPayload.mode_counts) : []
  const visibleSelectionCount = allMatchingSelected ? totalPosts : selectedPostIds.size
  const allLoadedSelected = posts.length > 0 && posts.every((post) => selectedPostIds.has(post.id))
  const canSelectAllMatching = allLoadedSelected && !allMatchingSelected && totalPosts > loadedPostsCount
  const params = useMemo(() => queryParams(query), [query])
  const compactModeSelector = isMobilePreviewLayout || desktopPreviewPercent >= COMPACT_MODE_SELECTOR_PREVIEW_PERCENT
  const handleError = useCallback((err) => {
    if (err.status === 401 && err.payload?.login_url) {
      window.location.assign(err.payload.login_url)
      return
    }

    setError(err.message || 'Request failed')
    setLoading(false)
  }, [])
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
    handleError
  })

  const loadPosts = useCallback((nextQuery) => {
    setLoading(true)
    setError(null)
    setLoadMoreError(null)

    api.posts(queryParams(nextQuery))
      .then((payload) => {
        setPostsPayload(payload)
        setSelectedPostIds(new Set())
        setAllMatchingSelected(false)
        setSelectedId((current) => current && payload.posts.some((post) => post.id === current) ? current : payload.posts[0]?.id || null)
        setDraftTag(queryInputValue(payload.query))
        setDraftQuery(payload.query.query || '')
      })
      .catch(handleError)
      .finally(() => setLoading(false))
  }, [handleError])

  useEffect(() => {
    loadPosts(query)
  }, [loadPosts, query, refreshKey])

  const loadMorePosts = useCallback(() => {
    if (!postsPayload || loading || loadingMore || !hasMorePosts) return

    const nextPage = String(postsPayload.pagination.page + 1)
    const nextQuery = {...query, page: nextPage}
    setLoadingMore(true)
    setLoadMoreError(null)

    api.posts(queryParams(nextQuery))
      .then((payload) => {
        setPostsPayload((current) => appendCurationPage(current, payload))
      })
      .catch((err) => {
        if (err.status === 401 && err.payload?.login_url) {
          window.location.assign(err.payload.login_url)
          return
        }

        setLoadMoreError(err.message || 'Request failed')
      })
      .finally(() => setLoadingMore(false))
  }, [hasMorePosts, loading, loadingMore, postsPayload, query])

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

  const updateQuery = (updates) => {
    setQuery((current) => ({...current, ...updates, page: updates.page || '1'}))
  }

  const submitQuery = (event) => {
    event.preventDefault()
    if (searchMode === 'keyword') {
      updateQuery({
        tag: '',
        author: '',
        query: draftQuery.trim(),
        only_keyword: true,
        only_read: false,
        only_ignored: false,
        only_deleted: false,
        only_blacklisted: false
      })
      return
    }

    updateQuery({
      ...parseQueryInput(draftTag),
      query: '',
      only_keyword: false
    })
  }

  const resetQueryInput = () => {
    setDraftTag('')
    setDraftQuery('')
    setSearchMode('filters')
    updateQuery({tag: '', query: '', author: '', only_keyword: false})
  }

  useEffect(() => {
    if (resetKeyRef.current === resetKey) return

    resetKeyRef.current = resetKey
    resetQueryInput()
  }, [resetKey])

  const searchKeywordsFromFilters = () => {
    if (!keywordSearchSuggestion) return

    setSearchMode('keyword')
    setDraftQuery(keywordSearchSuggestion)
    updateQuery({
      tag: '',
      author: '',
      query: keywordSearchSuggestion,
      only_keyword: true,
      only_read: false,
      only_ignored: false,
      only_deleted: false,
      only_blacklisted: false
    })
  }

  const searchKeywordSuggestion = () => {
    if (!keywordDidYouMean) return

    setSearchMode('keyword')
    setDraftQuery(keywordDidYouMean)
    updateQuery({
      tag: '',
      author: '',
      query: keywordDidYouMean,
      only_keyword: true,
      only_read: false,
      only_ignored: false,
      only_deleted: false,
      only_blacklisted: false
    })
  }

  const selectedPostRef = useRef(null)
  selectedPostRef.current = selectedPost

  const selectAfterRemoval = useCallback((removedId, direction, sourcePosts) => {
    const selection = selectionAfterPostRemoval(removedId, direction, sourcePosts)

    if (selection.cleared) {
      setSelectedId(null)
      setPreviewActive(false)
      setMobilePreviewOpen(false)
      return selection.posts
    }

    setSelectedId(selection.selectedId)

    return selection.posts
  }, [])

  const selectAfterRemovingIds = useCallback((removedIds, sourcePosts) => {
    const selection = selectionAfterPostsRemoval(removedIds, selectedId, sourcePosts)

    if (selection.cleared) {
      setSelectedId(null)
      setPreviewActive(false)
      setMobilePreviewOpen(false)
      return selection.posts
    }

    if (selection.selectedId !== selectedId) setSelectedId(selection.selectedId)

    return selection.posts
  }, [selectedId])

  const markPostReadAndMove = useCallback(async (post, direction = 1) => {
    if (!post) return

    setBusy(true)
    try {
      const result = await api.markRead(post.id)
      setAllMatchingSelected(false)
      setSelectedPostIds((current) => {
        const next = new Set(current)
        next.delete(post.id)
        return next
      })
      setPostsPayload((payload) => {
        const markedPosts = payload.posts.map((item) => item.id === post.id ? {...item, read: result.read} : item)
        const nextPayload = adjustReadCounts(payload, query, post.read ? 0 : 1)

        if (query.only_read || query.only_keyword) {
          const currentIndex = payload.posts.findIndex((item) => item.id === post.id)
          const nextIndex = direction > 0 ? Math.min(currentIndex + 1, payload.posts.length - 1) : Math.max(currentIndex - 1, 0)
          if (payload.posts[nextIndex]) setSelectedId(payload.posts[nextIndex].id)

          return {...nextPayload, posts: markedPosts}
        }

        return {...nextPayload, posts: selectAfterRemoval(post.id, direction, markedPosts)}
      })
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }, [handleError, query.only_keyword, query.only_read, selectAfterRemoval])

  const togglePostSelection = (postId) => {
    if (allMatchingSelected) {
      setAllMatchingSelected(false)
      setSelectedPostIds(new Set(posts.filter((post) => post.id !== postId).map((post) => post.id)))
      return
    }

    setSelectedPostIds((current) => {
      const next = new Set(current)

      if (next.has(postId)) {
        next.delete(postId)
      } else {
        next.add(postId)
      }

      return next
    })
  }

  const toggleLoadedSelection = () => {
    if (allMatchingSelected || allLoadedSelected) {
      setAllMatchingSelected(false)
      setSelectedPostIds(new Set())
      return
    }

    setAllMatchingSelected(false)
    setSelectedPostIds(new Set(posts.map((post) => post.id)))
  }

  const selectAllMatching = () => {
    setSelectedPostIds(new Set(posts.map((post) => post.id)))
    setAllMatchingSelected(true)
  }

  const clearSelection = () => {
    setSelectedPostIds(new Set())
    setAllMatchingSelected(false)
  }

  const markSelectedRead = async () => {
    const postIds = posts.map((post) => post.id).filter((postId) => selectedPostIds.has(postId))
    if (!postIds.length && !allMatchingSelected) return

    setBusy(true)
    try {
      const result = await api.markManyRead(allMatchingSelected ? {all_matching: true, query} : postIds)
      clearSelection()
      setPostsPayload((payload) => {
        const markedPostIds = allMatchingSelected ? payload.posts.map((post) => post.id) : postIds
        const markedPosts = payload.posts.map((post) => postIds.includes(post.id) ? {...post, read: true} : post)
        const readDelta = allMatchingSelected ? result.marked_count ?? markedPostIds.length : markedPostIds.length
        const nextPayload = adjustReadCounts(payload, query, readDelta)

        if (query.only_read || query.only_keyword) {
          return {...nextPayload, posts: markedPosts.map((post) => markedPostIds.includes(post.id) ? {...post, read: true} : post)}
        }

        return {...nextPayload, posts: selectAfterRemovingIds(markedPostIds, markedPosts)}
      })
    } catch (err) {
      handleError(err)
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

  const closePreview = useCallback(() => {
    setPreviewActive(false)
    if (isMobilePreviewLayout) setMobilePreviewOpen(false)
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

  const switchToFilters = () => {
    setSearchMode('filters')
    setDraftQuery('')
  }

  const focusTag = (tag) => {
    switchToFilters()
    updateQuery({tag, query: '', only_keyword: false})
    if (isMobilePreviewLayout) closePreview()
    setTagsOpen(false)
  }

  const focusAuthor = (author) => {
    switchToFilters()
    updateQuery({author, query: '', only_keyword: false})
    if (isMobilePreviewLayout) closePreview()
    setTagsOpen(false)
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
    const pane = previewScrollTarget(mobilePreviewOpen ? mobilePreviewScrollRef.current : desktopPreviewScrollRef.current)
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
            onSearchKeywordsFromFilters={searchKeywordsFromFilters}
            onSearchKeywordSuggestion={searchKeywordSuggestion}
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
        onClose={() => setTagsOpen(false)}
        tagPanelProps={tagPanelProps}
      />

    </>
  )
})

export default CurationInbox

function previewScrollTarget(container) {
  return container
}
