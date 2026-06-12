import { describe, expect, test, vi } from 'vitest'
import {
  DEFAULT_DESKTOP_PREVIEW_PERCENT,
  adjustReadCounts,
  emptyContextSuggestions,
  keywordSuggestionFromFilterQuery,
  parseQueryInput,
  postsResultCountLabel,
  queryInputValue,
  readDesktopPreviewPercent,
  selectionAfterPostRemoval,
  selectionAfterPostsRemoval,
  writeDesktopPreviewPercent
} from './curationInboxState'

describe('curation inbox state helpers', () => {
  test('converts query state to and from the filter input value', () => {
    expect(queryInputValue({tag_pattern: 'hive+curation', author: 'alice'})).toBe('hive+curation @alice')
    expect(parseQueryInput('hive curation @alice -spam')).toEqual({
      tag: 'hive curation -spam',
      author: 'alice'
    })
  })

  test('builds keyword suggestions from active tag filters', () => {
    expect(keywordSuggestionFromFilterQuery({tag: 'hive', other_tags: ['curation', '']})).toBe('hive curation')
  })

  test('offers alternate modes that have matching posts', () => {
    const suggestions = emptyContextSuggestions(
      {only_read: false, only_keyword: false, only_ignored: false, only_deleted: false, only_blacklisted: false},
      {unread: 0, keyword: 7, read: 3, ignored: 0, deleted: 2, blacklisted: 1}
    )

    expect(suggestions.map((suggestion) => [suggestion.key, suggestion.count])).toEqual([
      ['only_read', 3],
      ['only_deleted', 2],
      ['only_blacklisted', 1]
    ])
  })

  test('adjusts unread payload counts after marking posts read', () => {
    const payload = {
      counts: {read_posts: 4},
      mode_counts: {unread: 6, read: 4},
      pagination: {total_count: 6, total_pages: 2, limit: 3}
    }

    expect(adjustReadCounts(payload, {}, 2)).toEqual({
      counts: {read_posts: 6},
      mode_counts: {unread: 4, read: 6},
      pagination: {total_count: 4, total_pages: 2, limit: 3}
    })
  })

  test('leaves active read mode payload pagination unchanged when marking read', () => {
    const payload = {
      counts: {read_posts: 4},
      mode_counts: {unread: 6, read: 4},
      pagination: {total_count: 4, total_pages: 1, limit: 30}
    }

    expect(adjustReadCounts(payload, {only_read: true}, 2)).toBe(payload)
  })

  test('labels result counts by active mode', () => {
    expect(postsResultCountLabel({}, 12, 12, false)).toBe('12 unread posts')
    expect(postsResultCountLabel({only_keyword: true}, 20, 10, true)).toBe('20 keyword matches · 10 loaded')
    expect(postsResultCountLabel({only_blacklisted: true}, 1, 1, false)).toBe('1 blacklisted posts')
  })

  test('chooses the next selected post after removing one post', () => {
    const posts = [{id: 1}, {id: 2}, {id: 3}]

    expect(selectionAfterPostRemoval(2, 1, posts)).toEqual({
      posts: [{id: 1}, {id: 3}],
      selectedId: 3,
      cleared: false
    })
    expect(selectionAfterPostRemoval(2, -1, posts)).toEqual({
      posts: [{id: 1}, {id: 3}],
      selectedId: 1,
      cleared: false
    })
    expect(selectionAfterPostRemoval(1, 1, [{id: 1}])).toEqual({
      posts: [],
      selectedId: null,
      cleared: true
    })
  })

  test('keeps or advances selection after removing several posts', () => {
    const posts = [{id: 1}, {id: 2}, {id: 3}, {id: 4}]

    expect(selectionAfterPostsRemoval([1, 4], 2, posts)).toEqual({
      posts: [{id: 2}, {id: 3}],
      selectedId: 2,
      cleared: false
    })
    expect(selectionAfterPostsRemoval([2, 3], 3, posts)).toEqual({
      posts: [{id: 1}, {id: 4}],
      selectedId: 4,
      cleared: false
    })
    expect(selectionAfterPostsRemoval([1, 2], 1, [{id: 1}, {id: 2}])).toEqual({
      posts: [],
      selectedId: null,
      cleared: true
    })
  })

  test('persists valid desktop preview widths and ignores invalid stored values', () => {
    const store = new Map()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key) => store.get(key)),
        setItem: vi.fn((key, value) => store.set(key, value))
      }
    })

    store.set('hyperion.desktopPreviewPercent', '44')
    expect(readDesktopPreviewPercent()).toBe(44)

    store.set('hyperion.desktopPreviewPercent', '12')
    expect(readDesktopPreviewPercent()).toBe(DEFAULT_DESKTOP_PREVIEW_PERCENT)

    writeDesktopPreviewPercent(52)
    expect(store.get('hyperion.desktopPreviewPercent')).toBe('52')
  })
})
