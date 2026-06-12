import { describe, expect, test } from 'vitest'
import { curationViewState } from './curationViewState'

const session = {
  ignored_tags: ['fallback-ignore'],
  poisoned_pill_tags: ['fallback-poison'],
  favorite_tags: ['fallback-favorite'],
  past_tags: ['fallback-past']
}

describe('curation view state', () => {
  test('derives selected post, counts, suggestions, and selection affordances', () => {
    const postsPayload = {
      posts: [{id: 1}, {id: 2}],
      ignored_tags: ['active'],
      poisoned_pill_tags: ['poison'],
      favorite_tags: ['favorite'],
      past_tags: ['past'],
      query: {tag: 'active', tag_pattern: 'active', other_tags: ['curation']},
      keyword_suggestion: '',
      mode_counts: {unread: 0, keyword: 4, read: 2, ignored: 0, deleted: 1, blacklisted: 0},
      pagination: {total_count: 5}
    }

    const state = curationViewState({
      postsPayload,
      session,
      selectedId: 2,
      selectedPostIds: new Set([1, 2]),
      allMatchingSelected: false,
      hasMorePosts: true,
      isMobilePreviewLayout: false,
      desktopPreviewPercent: 65
    })

    expect(state.posts).toBe(postsPayload.posts)
    expect(state.selectedIndex).toBe(1)
    expect(state.selectedPost).toEqual({id: 2})
    expect(state.ignoredTags).toEqual(['active'])
    expect(state.activeTagIgnored).toBe(true)
    expect(state.totalPosts).toBe(5)
    expect(state.loadedPostsCount).toBe(2)
    expect(state.resultCountLabel).toBe('5 unread posts · 2 loaded')
    expect(state.keywordSearchSuggestion).toBe('active curation')
    expect(state.contextSuggestions.map((suggestion) => suggestion.key)).toEqual(['only_read', 'only_deleted'])
    expect(state.visibleSelectionCount).toBe(2)
    expect(state.allLoadedSelected).toBe(true)
    expect(state.canSelectAllMatching).toBe(true)
    expect(state.compactModeSelector).toBe(true)
  })

  test('falls back to session tags and uses all matching selection count', () => {
    const state = curationViewState({
      postsPayload: null,
      session,
      selectedId: null,
      selectedPostIds: new Set([1]),
      allMatchingSelected: true,
      hasMorePosts: false,
      isMobilePreviewLayout: true,
      desktopPreviewPercent: 28
    })

    expect(state.posts).toEqual([])
    expect(state.selectedIndex).toBe(-1)
    expect(state.selectedPost).toBeNull()
    expect(state.ignoredTags).toEqual(['fallback-ignore'])
    expect(state.poisonedPillTags).toEqual(['fallback-poison'])
    expect(state.favoriteTags).toEqual(['fallback-favorite'])
    expect(state.pastTags).toEqual(['fallback-past'])
    expect(state.visibleSelectionCount).toBe(0)
    expect(state.resultCountLabel).toBe('')
    expect(state.keywordSearchSuggestion).toBe('')
    expect(state.compactModeSelector).toBe(true)
  })

  test('uses keyword suggestion only while keyword mode is active', () => {
    const state = curationViewState({
      postsPayload: {
        posts: [],
        query: {only_keyword: true},
        keyword_suggestion: 'better keyword',
        mode_counts: {},
        pagination: {total_count: 0}
      },
      session,
      selectedId: null,
      selectedPostIds: new Set(),
      allMatchingSelected: false,
      hasMorePosts: false,
      isMobilePreviewLayout: false,
      desktopPreviewPercent: 30
    })

    expect(state.keywordSearchSuggestion).toBe('')
    expect(state.keywordDidYouMean).toBe('better keyword')
    expect(state.resultCountLabel).toBe('0 keyword matches')
  })
})
