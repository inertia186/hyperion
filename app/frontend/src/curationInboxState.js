import { activeModeKey, modeCount, modeOptions } from './components/ModeSelector'

export const DESKTOP_PREVIEW_STORAGE_KEY = 'hyperion.desktopPreviewPercent'
export const DEFAULT_DESKTOP_PREVIEW_PERCENT = 65
export const MIN_DESKTOP_PREVIEW_PERCENT = 28
export const MAX_DESKTOP_PREVIEW_PERCENT = 65
export const COMPACT_MODE_SELECTOR_PREVIEW_PERCENT = 50

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function readDesktopPreviewPercent() {
  if (typeof window === 'undefined') return DEFAULT_DESKTOP_PREVIEW_PERCENT

  const stored = Number(window.localStorage?.getItem(DESKTOP_PREVIEW_STORAGE_KEY))
  return Number.isFinite(stored) && stored >= MIN_DESKTOP_PREVIEW_PERCENT && stored <= MAX_DESKTOP_PREVIEW_PERCENT ? stored : DEFAULT_DESKTOP_PREVIEW_PERCENT
}

export function writeDesktopPreviewPercent(value) {
  try {
    window.localStorage?.setItem(DESKTOP_PREVIEW_STORAGE_KEY, String(value))
  } catch (_error) {
    // Ignore storage failures; resizing should still work for the current page.
  }
}

export function queryInputValue(query = {}) {
  return [query.tag_pattern, query.author ? `@${query.author}` : ''].filter(Boolean).join(' ')
}

export function parseQueryInput(value) {
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

export function keywordSuggestionFromFilterQuery(query = {}) {
  return [query.tag, ...(query.other_tags || [])].filter(Boolean).join(' ').trim()
}

export function emptyContextSuggestions(query, counts) {
  const activeMode = activeModeKey(query)

  return modeOptions
    .filter((mode) => mode.key !== activeMode)
    .map((mode) => ({...mode, count: modeCount(mode, counts)}))
    .filter((mode) => mode.count > 0)
}

export function adjustReadCounts(payload, query, readDelta) {
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

export function selectionAfterPostRemoval(removedId, direction, sourcePosts) {
  const nextPosts = sourcePosts.filter((post) => post.id !== removedId)

  if (nextPosts.length === 0) {
    return {posts: nextPosts, selectedId: null, cleared: true}
  }

  const removedIndex = sourcePosts.findIndex((post) => post.id === removedId)
  const nextIndex = direction > 0 ? Math.min(removedIndex, nextPosts.length - 1) : Math.max(removedIndex - 1, 0)

  return {posts: nextPosts, selectedId: nextPosts[nextIndex]?.id || null, cleared: false}
}

export function selectionAfterPostsRemoval(removedIds, selectedId, sourcePosts) {
  const removedSet = new Set(removedIds)
  const nextPosts = sourcePosts.filter((post) => !removedSet.has(post.id))

  if (nextPosts.length === 0) {
    return {posts: nextPosts, selectedId: null, cleared: true}
  }

  if (!removedSet.has(selectedId)) {
    return {posts: nextPosts, selectedId, cleared: false}
  }

  const removedIndex = sourcePosts.findIndex((post) => post.id === selectedId)
  const nextIndex = Math.min(Math.max(removedIndex, 0), nextPosts.length - 1)

  return {posts: nextPosts, selectedId: nextPosts[nextIndex]?.id || null, cleared: false}
}

export function selectionAfterPostToggle(postId, posts, selectedPostIds, allMatchingSelected) {
  if (allMatchingSelected) {
    return {
      selectedPostIds: new Set(posts.filter((post) => post.id !== postId).map((post) => post.id)),
      allMatchingSelected: false
    }
  }

  const next = new Set(selectedPostIds)

  if (next.has(postId)) {
    next.delete(postId)
  } else {
    next.add(postId)
  }

  return {selectedPostIds: next, allMatchingSelected: false}
}

export function selectionAfterLoadedToggle(posts, allLoadedSelected, allMatchingSelected) {
  if (allMatchingSelected || allLoadedSelected) {
    return {selectedPostIds: new Set(), allMatchingSelected: false}
  }

  return {
    selectedPostIds: new Set(posts.map((post) => post.id)),
    allMatchingSelected: false
  }
}

export function selectionAfterAllMatching(posts) {
  return {
    selectedPostIds: new Set(posts.map((post) => post.id)),
    allMatchingSelected: true
  }
}

export function postsResultCountLabel(query, totalPosts, loadedPostsCount, hasMorePosts) {
  const noun = query.only_read ? 'read posts' : query.only_keyword ? 'keyword matches' : query.only_ignored ? 'ignored posts' : query.only_deleted ? 'deleted posts' : query.only_blacklisted ? 'blacklisted posts' : 'unread posts'
  const loadedSuffix = hasMorePosts ? ` · ${loadedPostsCount} loaded` : ''

  return `${totalPosts} ${noun}${loadedSuffix}`
}
