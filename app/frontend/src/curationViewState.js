import {
  COMPACT_MODE_SELECTOR_PREVIEW_PERCENT,
  emptyContextSuggestions,
  keywordSuggestionFromFilterQuery,
  postsResultCountLabel
} from './curationInboxState'

export function curationViewState({
  postsPayload,
  session,
  selectedId,
  selectedPostIds,
  allMatchingSelected,
  hasMorePosts,
  isMobilePreviewLayout,
  desktopPreviewPercent
}) {
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

  return {
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
  }
}
