import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { CheckSquare, Loader2, Square, X } from 'lucide-react'
import { api } from './api'
import { initialQuery } from './constants'
import { queryParams } from './format'
import { useCurationKeyboard } from './useCurationKeyboard'
import { closeOnBackdropClick, useModalDismiss } from './useModalDismiss'
import PostList from './components/PostList'
import PreviewPane from './components/PreviewPane'
import TagPanels from './components/TagPanels'
import Toolbar from './components/Toolbar'
import { activeModeKey, modeCount, modeOptions } from './components/ModeSelector'

const emptyPreviewState = {postId: null, status: 'idle', html: '', detail: null, error: null}
const DESKTOP_PREVIEW_STORAGE_KEY = 'hyperion.desktopPreviewPercent'
const DEFAULT_DESKTOP_PREVIEW_PERCENT = 65
const MIN_DESKTOP_PREVIEW_PERCENT = 28
const MAX_DESKTOP_PREVIEW_PERCENT = 65
const COMPACT_MODE_SELECTOR_PREVIEW_PERCENT = 50

const CurationInbox = forwardRef(function CurationInbox({session, refreshKey = 0, resetKey = 0, theme = 'light', helpVisible = false, setHelpVisible = () => {}, onRefreshVotingPower}, ref) {
  const [query, setQuery] = useState(initialQuery)
  const [draftTag, setDraftTag] = useState('')
  const [draftQuery, setDraftQuery] = useState('')
  const [searchMode, setSearchMode] = useState('filters')
  const [postsPayload, setPostsPayload] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [selectedPostIds, setSelectedPostIds] = useState(() => new Set())
  const [allMatchingSelected, setAllMatchingSelected] = useState(false)
  const [previewState, setPreviewState] = useState(emptyPreviewState)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [loadMoreError, setLoadMoreError] = useState(null)
  const [previewActive, setPreviewActive] = useState(false)
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [desktopPreviewPercent, setDesktopPreviewPercent] = useState(readDesktopPreviewPercent)
  const desktopLayoutRef = useRef(null)
  const listScrollRef = useRef(null)
  const desktopPreviewScrollRef = useRef(null)
  const mobilePreviewScrollRef = useRef(null)
  const loadMoreRef = useRef(null)
  const previewRequestRef = useRef(0)
  const resetKeyRef = useRef(resetKey)
  const isMobilePreviewLayout = useMediaQuery('(max-width: 1279px)')

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
  const hasMorePosts = !!pagination && pagination.page < pagination.total_pages
  const resultCountLabel = postsPayload ? postsResultCountLabel(postsPayload.query, totalPosts, loadedPostsCount, hasMorePosts) : ''
  const keywordSearchSuggestion = postsPayload && !postsPayload.query?.only_keyword ? keywordSuggestionFromFilterQuery(postsPayload.query) : ''
  const keywordDidYouMean = postsPayload?.query?.only_keyword ? postsPayload.keyword_suggestion : ''
  const contextSuggestions = postsPayload && !postsPayload.query?.only_keyword ? emptyContextSuggestions(postsPayload.query, postsPayload.mode_counts) : []
  const visibleSelectionCount = allMatchingSelected ? totalPosts : selectedPostIds.size
  const allLoadedSelected = posts.length > 0 && posts.every((post) => selectedPostIds.has(post.id))
  const canSelectAllMatching = allLoadedSelected && !allMatchingSelected && totalPosts > loadedPostsCount
  const params = useMemo(() => queryParams(query), [query])
  const desktopLayoutStyle = useMemo(() => ({
    '--desktop-preview-width': `${desktopPreviewPercent}%`
  }), [desktopPreviewPercent])
  const compactModeSelector = isMobilePreviewLayout || desktopPreviewPercent >= COMPACT_MODE_SELECTOR_PREVIEW_PERCENT
  const handleError = useCallback((err) => {
    if (err.status === 401 && err.payload?.login_url) {
      window.location.assign(err.payload.login_url)
      return
    }

    setError(err.message || 'Request failed')
    setLoading(false)
  }, [])

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
        setPostsPayload((current) => {
          if (!current) return payload

          const seenIds = new Set(current.posts.map((post) => post.id))
          const nextPosts = payload.posts.filter((post) => !seenIds.has(post.id))

          return {
            ...payload,
            posts: [...current.posts, ...nextPosts]
          }
        })
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
    if (!selectedId) {
      previewRequestRef.current += 1
      setPreviewState(emptyPreviewState)
      return
    }

    const requestId = previewRequestRef.current + 1
    previewRequestRef.current = requestId
    setPreviewState({postId: selectedId, status: 'loading', html: '', detail: null, error: null})

    api.post(selectedId)
      .then((payload) => {
        if (previewRequestRef.current !== requestId) return

        setPreviewState({postId: selectedId, status: 'ready', html: payload.body_html || '', detail: payload, error: null})
        if (desktopPreviewScrollRef.current) desktopPreviewScrollRef.current.scrollTop = 0
        if (mobilePreviewScrollRef.current) mobilePreviewScrollRef.current.scrollTop = 0
      })
      .catch((err) => {
        if (previewRequestRef.current !== requestId) return

        setPreviewState({postId: selectedId, status: 'error', html: '', detail: null, error: err.message || 'Request failed'})
      })
  }, [selectedId])

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

  const updateDesktopPreviewPercent = useCallback((clientX) => {
    if (!Number.isFinite(clientX)) return

    const rect = desktopLayoutRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return

    const nextPercent = clamp(((rect.right - clientX) / rect.width) * 100, MIN_DESKTOP_PREVIEW_PERCENT, MAX_DESKTOP_PREVIEW_PERCENT)
    const roundedPercent = Math.round(nextPercent)
    setDesktopPreviewPercent(roundedPercent)
    writeDesktopPreviewPercent(roundedPercent)
  }, [])

  const startDesktopResize = useCallback((event) => {
    if (event.button != null && event.button !== 0) return

    event.preventDefault()
    updateDesktopPreviewPercent(event.clientX)

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (moveEvent) => updateDesktopPreviewPercent(moveEvent.clientX)
    const stopResize = () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResize)
      window.removeEventListener('pointercancel', stopResize)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
  }, [updateDesktopPreviewPercent])

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
    const nextPosts = sourcePosts.filter((post) => post.id !== removedId)

    if (nextPosts.length === 0) {
      setSelectedId(null)
      setPreviewActive(false)
      setMobilePreviewOpen(false)
      setPreviewState(emptyPreviewState)
      return nextPosts
    }

    const removedIndex = sourcePosts.findIndex((post) => post.id === removedId)
    const nextIndex = direction > 0 ? Math.min(removedIndex, nextPosts.length - 1) : Math.max(removedIndex - 1, 0)
    setSelectedId(nextPosts[nextIndex].id)

    return nextPosts
  }, [])

  const selectAfterRemovingIds = useCallback((removedIds, sourcePosts) => {
    const removedSet = new Set(removedIds)
    const nextPosts = sourcePosts.filter((post) => !removedSet.has(post.id))

    if (nextPosts.length === 0) {
      setSelectedId(null)
      setPreviewActive(false)
      setMobilePreviewOpen(false)
      setPreviewState(emptyPreviewState)
      return nextPosts
    }

    if (removedSet.has(selectedId)) {
      const removedIndex = sourcePosts.findIndex((post) => post.id === selectedId)
      const nextIndex = Math.min(Math.max(removedIndex, 0), nextPosts.length - 1)
      setSelectedId(nextPosts[nextIndex].id)
    }

    return nextPosts
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

  const toggleMute = async () => {
    const enabled = !postsPayload.query.muted_authors_enabled
    setBusy(true)
    try {
      const payload = await api.setMute(enabled)
      setPostsPayload((current) => ({...current, query: {...current.query, muted_authors_enabled: payload.muted_authors_enabled}}))
      setQuery((current) => ({...current}))
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  const toggleOnlyFavorites = async () => {
    const enabled = !postsPayload.query.only_favorite_tags
    setBusy(true)
    try {
      const payload = await api.setOnlyFavoriteTags(enabled)
      setPostsPayload((current) => ({...current, query: {...current.query, only_favorite_tags: payload.only_favorite_tags}}))
      setQuery((current) => ({...current}))
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  const toggleIgnoredTag = async () => {
    if (!activeTag) return
    setBusy(true)
    try {
      const payload = activeTagIgnored ? await api.unignoreTag(activeTag) : await api.ignoreTag(activeTag)
      setPostsPayload((current) => ({...current, ignored_tags: payload.ignored_tags, poisoned_pill_tags: payload.poisoned_pill_tags, favorite_tags: payload.favorite_tags, past_tags: payload.past_tags}))
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  const toggleFavorite = async (tag) => {
    setBusy(true)
    try {
      const payload = favoriteTags.includes(tag) ? await api.unfavoriteTag(tag) : await api.favoriteTag(tag)
      setPostsPayload((current) => ({...current, ignored_tags: payload.ignored_tags, poisoned_pill_tags: payload.poisoned_pill_tags, favorite_tags: payload.favorite_tags, past_tags: payload.past_tags}))
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  const togglePoisonedPill = async (tag) => {
    setBusy(true)
    try {
      const payload = poisonedPillTags.includes(tag) ? await api.unpoisonTag(tag) : await api.poisonTag(tag)
      setPostsPayload((current) => ({...current, ignored_tags: payload.ignored_tags, poisoned_pill_tags: payload.poisoned_pill_tags, favorite_tags: payload.favorite_tags, past_tags: payload.past_tags}))
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  const removePastTag = async (tag) => {
    setBusy(true)
    try {
      const payload = await api.removePastTag(tag)
      setPostsPayload((current) => ({...current, ignored_tags: payload.ignored_tags, poisoned_pill_tags: payload.poisoned_pill_tags, favorite_tags: payload.favorite_tags, past_tags: payload.past_tags}))
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  const clearPastTags = async (onlyIgnored = false) => {
    if (!window.confirm('Clear these past tags?')) return

    setBusy(true)
    try {
      const payload = onlyIgnored ? await api.clearIgnoredPastTags() : await api.clearPastTags()
      setPostsPayload((current) => ({...current, ignored_tags: payload.ignored_tags, poisoned_pill_tags: payload.poisoned_pill_tags, favorite_tags: payload.favorite_tags, past_tags: payload.past_tags}))
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  const clearIgnoredTags = async () => {
    if (!window.confirm('Clear all ignored tags?')) return

    setBusy(true)
    try {
      const payload = await api.clearIgnoredTags()
      setPostsPayload((current) => ({...current, ignored_tags: payload.ignored_tags, poisoned_pill_tags: payload.poisoned_pill_tags, favorite_tags: payload.favorite_tags, past_tags: payload.past_tags}))
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  const updatePostChainStats = useCallback((postId, statsPayload, options = {}) => {
    if (!statsPayload || statsPayload.status !== 'ready') return

    setPostsPayload((payload) => {
      if (!payload) return payload
      const payoutFetchedAt = statsPayload.payout_fetched_at ?? (statsPayload.payout ? new Date().toISOString() : null)

      return {
        ...payload,
        posts: payload.posts.map((post) => post.id === postId ? {
          ...post,
          payout: statsPayload.payout ?? post.payout,
          payout_amount: statsPayload.payout_amount ?? post.payout_amount,
          payout_currency: statsPayload.payout_currency ?? post.payout_currency,
          payout_fetched_at: payoutFetchedAt ?? post.payout_fetched_at,
          payout_source: statsPayload.payout_source ?? post.payout_source,
          current_vote: statsPayload.current_vote ?? post.current_vote
        } : post)
      }
    })
    if (options.refreshVotingPower) onRefreshVotingPower?.()
  }, [onRefreshVotingPower])

  const updatePostPayout = useCallback((postId, payoutPayload) => {
    if (!payoutPayload || payoutPayload.status !== 'ready') return

    setPostsPayload((payload) => {
      if (!payload) return payload

      return {
        ...payload,
        posts: payload.posts.map((post) => post.id === postId ? {
          ...post,
          payout: payoutPayload.payout ?? post.payout,
          payout_amount: payoutPayload.payout_amount ?? post.payout_amount,
          payout_currency: payoutPayload.payout_currency ?? post.payout_currency,
          payout_fetched_at: payoutPayload.payout_fetched_at ?? post.payout_fetched_at,
          payout_source: payoutPayload.payout_source ?? post.payout_source
        } : post)
      }
    })
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

    if (!pane) {
      moveSelection(direction)
      return
    }

    const maxScrollTop = Math.max(pane.scrollHeight - pane.clientHeight, 0)
    const atTop = pane.scrollTop <= 0
    const atBottom = pane.scrollTop >= maxScrollTop - 1

    if ((direction > 0 && atBottom) || (direction < 0 && atTop)) {
      moveSelection(direction)
      return
    }

    const before = pane.scrollTop
    pane.scrollTop = Math.min(Math.max(before + (direction * Math.max(pane.clientHeight * 0.75, 180)), 0), maxScrollTop)

    if (pane.scrollTop === before) moveSelection(direction)
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
                selectedCount={visibleSelectionCount}
                totalPosts={totalPosts}
                onToggleLoaded={toggleLoadedSelection}
                onSelectAllMatching={selectAllMatching}
                onClearSelection={clearSelection}
              />
            )}
            {loading ? (
              <PostListSkeleton />
            ) : posts.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-slate-500">
                <div>All caught up for this view.</div>
                {contextSuggestions.length > 0 && (
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {contextSuggestions.map((mode) => (
                      <button key={mode.key} className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" type="button" onClick={() => updateQuery(mode.updates)}>
                        View {mode.label} ({mode.count})
                      </button>
                    ))}
                  </div>
                )}
                {keywordSearchSuggestion && (
                  <div className="mt-3">
                    <button className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" type="button" onClick={searchKeywordsFromFilters}>
                      Search keywords for "{keywordSearchSuggestion}"
                    </button>
                  </div>
                )}
                {keywordDidYouMean && (
                  <div className="mt-3">
                    <span className="mr-2">Did you mean:</span>
                    <button className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" type="button" onClick={searchKeywordSuggestion}>
                      {keywordDidYouMean}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <PostList
                posts={posts}
                selectedId={selectedId}
                selectedPostIds={selectedPostIds}
                allMatchingSelected={allMatchingSelected}
                ignoredTags={ignoredTags}
                onSelect={selectPost}
                onToggleSelected={togglePostSelection}
                onSelectTag={focusTag}
                onSelectAuthor={focusAuthor}
                onPayoutRefresh={updatePostPayout}
              />
            )}
          </div>

          {!loading && postsPayload && (
            <div ref={loadMoreRef} className="mt-3 flex flex-col items-center gap-2 text-sm text-slate-500">
              {loadMoreError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">{loadMoreError}</div>}
              {hasMorePosts ? (
                <button className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50 disabled:opacity-50" type="button" onClick={loadMorePosts} disabled={loadingMore}>
                  {loadingMore ? 'Loading more...' : 'Load more'}
                </button>
              ) : posts.length > 0 ? (
                <span>All loaded</span>
              ) : null}
            </div>
          )}
        </section>

        {!isMobilePreviewLayout && (
          <div className="desktop-resize-handle hidden xl:flex" role="separator" aria-label="Resize list and post view" aria-orientation="vertical" tabIndex={0} onPointerDown={startDesktopResize}>
            <span />
          </div>
        )}

        <aside className="hidden min-w-0 xl:sticky xl:top-4 xl:flex xl:h-[calc(100vh-2rem)] xl:h-[calc(100dvh-2rem)] xl:flex-col xl:gap-3">
          <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-slate-200 bg-white">
            <PreviewPane
              post={selectedPost}
              previewState={previewState}
              previewActive={previewActive}
              previewScrollRef={desktopPreviewScrollRef}
              accountName={session.account.name}
              hivesignerAvailable={session.preferences.hivesigner_available}
              theme={theme}
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
          </div>
        </aside>
      </main>

      <MobilePreviewDrawer
        open={mobilePreviewOpen}
        post={selectedPost}
        previewState={previewState}
        previewActive={previewActive}
        previewScrollRef={mobilePreviewScrollRef}
        accountName={session.account.name}
        hivesignerAvailable={session.preferences.hivesigner_available}
        theme={theme}
        onClose={closePreview}
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

      <TagsModal
        open={tagsOpen}
        onClose={() => setTagsOpen(false)}
        tagPanelProps={tagPanelProps}
      />

    </>
  )
})

export default CurationInbox

function TagsModal({open, onClose, tagPanelProps}) {
  useModalDismiss(open, onClose)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/30 p-3 pt-8 sm:p-4 sm:pt-10" role="dialog" aria-modal="true" aria-label="Tags" onClick={closeOnBackdropClick(onClose)}>
      <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col rounded-md border border-slate-200 bg-white shadow-xl sm:max-h-[calc(100vh-3.5rem)]">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <div className="text-sm font-semibold text-slate-900">Tags</div>
          <button className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" type="button" onClick={onClose} aria-label="Close tags">
            <X size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
          <TagPanels {...tagPanelProps} />
        </div>
      </div>
    </div>
  )
}

function SelectionBar({
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

function MobilePreviewDrawer({
  open,
  post,
  previewState,
  previewActive,
  previewScrollRef,
  accountName,
  hivesignerAvailable,
  theme,
  onClose,
  onPrevious,
  onNext,
  onMarkReadNext,
  onSelectTag,
  onSelectAuthor,
  onChainStatsRefresh,
  readBusy,
  hasPrevious,
  hasNext
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/30 xl:hidden" role="dialog" aria-modal="true" aria-label="Post preview" onClick={closeOnBackdropClick(onClose)}>
      <div className="safe-area-shell safe-area-top mobile-preview-sheet flex flex-col bg-white">
        <div className="min-h-0 flex-1 overflow-hidden">
          <PreviewPane
            post={post}
            previewState={previewState}
            previewActive={previewActive}
            previewScrollRef={previewScrollRef}
            accountName={accountName}
            hivesignerAvailable={hivesignerAvailable}
            theme={theme}
            onClose={onClose}
            onPrevious={onPrevious}
            onNext={onNext}
            onMarkReadNext={onMarkReadNext}
            onSelectTag={onSelectTag}
            onSelectAuthor={onSelectAuthor}
            onChainStatsRefresh={onChainStatsRefresh}
            readBusy={readBusy}
            hasPrevious={hasPrevious}
            hasNext={hasNext}
          />
        </div>
      </div>
    </div>
  )
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined

    const media = window.matchMedia(query)
    const handleChange = () => setMatches(media.matches)
    handleChange()

    if (media.addEventListener) {
      media.addEventListener('change', handleChange)
      return () => media.removeEventListener('change', handleChange)
    }

    media.addListener(handleChange)
    return () => media.removeListener(handleChange)
  }, [query])

  return matches
}

function previewScrollTarget(container) {
  return container
}

function readDesktopPreviewPercent() {
  if (typeof window === 'undefined') return DEFAULT_DESKTOP_PREVIEW_PERCENT

  const stored = Number(window.localStorage?.getItem(DESKTOP_PREVIEW_STORAGE_KEY))
  return Number.isFinite(stored) && stored >= MIN_DESKTOP_PREVIEW_PERCENT && stored <= MAX_DESKTOP_PREVIEW_PERCENT ? stored : DEFAULT_DESKTOP_PREVIEW_PERCENT
}

function writeDesktopPreviewPercent(value) {
  try {
    window.localStorage?.setItem(DESKTOP_PREVIEW_STORAGE_KEY, String(value))
  } catch (_error) {
    // Ignore storage failures; resizing should still work for the current page.
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function queryInputValue(query = {}) {
  return [query.tag_pattern, query.author ? `@${query.author}` : ''].filter(Boolean).join(' ')
}

function parseQueryInput(value) {
  const tokens = value.trim().split(/\s+/).filter(Boolean)
  let author = ''
  const tagTokens = []

  tokens.forEach((token) => {
    if (token.startsWith('@') && token.length > 1) {
      author = token.slice(1)
    } else {
      tagTokens.push(token)
    }
  })

  return {
    tag: tagTokens.join(' '),
    author
  }
}

function keywordSuggestionFromFilterQuery(query = {}) {
  return [query.tag, ...(query.other_tags || [])].filter(Boolean).join(' ').trim()
}

function emptyContextSuggestions(query, counts) {
  const activeMode = activeModeKey(query)

  return modeOptions
    .filter((mode) => mode.key !== activeMode)
    .map((mode) => ({...mode, count: modeCount(mode, counts)}))
    .filter((mode) => mode.count > 0)
}

function adjustReadCounts(payload, query, readDelta) {
  if (!readDelta || query.only_read) return payload

  const counts = payload.counts ? {
    ...payload.counts,
    read_posts: Math.max((payload.counts.read_posts || 0) + readDelta, 0)
  } : payload.counts

  if (query.only_keyword || query.only_ignored || query.only_deleted || query.only_blacklisted) {
    return {...payload, counts}
  }

  const totalCount = Math.max((payload.pagination?.total_count || 0) - readDelta, 0)
  const limit = Math.max(payload.pagination?.limit || 1, 1)

  return {
    ...payload,
    counts,
    mode_counts: {
      ...payload.mode_counts,
      unread: Math.max((payload.mode_counts?.unread || 0) - readDelta, 0),
      read: Math.max((payload.mode_counts?.read || 0) + readDelta, 0)
    },
    pagination: payload.pagination ? {
      ...payload.pagination,
      total_count: totalCount,
      total_pages: Math.max(Math.ceil(totalCount / limit), 1)
    } : payload.pagination
  }
}

function postsResultCountLabel(query, totalPosts, loadedPostsCount, hasMorePosts) {
  const noun = query.only_read ? 'read posts' : query.only_keyword ? 'keyword matches' : query.only_ignored ? 'ignored posts' : query.only_deleted ? 'deleted posts' : query.only_blacklisted ? 'blacklisted posts' : 'unread posts'
  const loadedSuffix = hasMorePosts ? ` · ${loadedPostsCount} loaded` : ''

  return `${totalPosts} ${noun}${loadedSuffix}`
}

function PostListSkeleton() {
  return (
    <div className="divide-y divide-slate-100" aria-label="Loading posts" aria-busy="true">
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className="grid grid-cols-[40px_minmax(0,1fr)_96px] items-center gap-3 px-3 py-3 md:grid-cols-[40px_56px_minmax(220px,1fr)_minmax(120px,180px)_minmax(120px,160px)_90px]">
          <div className="h-5 w-5 rounded bg-slate-200" />
          <div className="hidden h-12 w-12 rounded-md bg-slate-200 md:block" />
          <div className="space-y-2">
            <div className="h-4 w-3/4 rounded bg-slate-200" />
            <div className="h-3 w-1/3 rounded bg-slate-100" />
          </div>
          <div className="hidden h-4 rounded bg-slate-100 md:block" />
          <div className="hidden h-4 rounded bg-slate-100 md:block" />
          <div className="h-4 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  )
}
