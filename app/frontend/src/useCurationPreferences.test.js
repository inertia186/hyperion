import { act, renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { applyTagPreferencePayload, useCurationPreferences } from './useCurationPreferences'

describe('curation preference helpers', () => {
  test('applies tag preference payloads without replacing unrelated state', () => {
    const current = {posts: [{id: 1}], ignored_tags: [], poisoned_pill_tags: [], favorite_tags: [], past_tags: []}
    const payload = {
      ignored_tags: ['spam'],
      poisoned_pill_tags: ['trap'],
      favorite_tags: ['hive'],
      past_tags: ['old']
    }

    expect(applyTagPreferencePayload(current, payload)).toEqual({
      posts: [{id: 1}],
      ignored_tags: ['spam'],
      poisoned_pill_tags: ['trap'],
      favorite_tags: ['hive'],
      past_tags: ['old']
    })
    expect(applyTagPreferencePayload(null, payload)).toBeNull()
  })

  test('toggles mute preference and refreshes the active query', async () => {
    const apiClient = {setMute: vi.fn(() => Promise.resolve({muted_authors_enabled: true}))}
    const setBusy = vi.fn()
    const setQuery = vi.fn()
    let postsPayload = {query: {muted_authors_enabled: false}}
    const setPostsPayload = vi.fn((updater) => {
      postsPayload = updater(postsPayload)
    })

    const {result} = renderHook(() => useCurationPreferences({
      postsPayload,
      activeTag: '',
      activeTagIgnored: false,
      favoriteTags: [],
      poisonedPillTags: [],
      setPostsPayload,
      setQuery,
      setBusy,
      handleError: vi.fn(),
      apiClient
    }))

    await act(async () => {
      await result.current.toggleMute()
    })

    expect(apiClient.setMute).toHaveBeenCalledWith(true)
    expect(postsPayload.query.muted_authors_enabled).toBe(true)
    expect(setQuery).toHaveBeenCalled()
    expect(setBusy.mock.calls.map(([value]) => value)).toEqual([true, false])
  })

  test('confirms before clearing past tags', async () => {
    const apiClient = {clearPastTags: vi.fn(() => Promise.resolve(tagPayload()))}
    const confirm = vi.fn(() => false)
    const setPostsPayload = vi.fn()

    const {result} = renderHook(() => useCurationPreferences({
      postsPayload: {query: {}},
      activeTag: '',
      activeTagIgnored: false,
      favoriteTags: [],
      poisonedPillTags: [],
      setPostsPayload,
      setQuery: vi.fn(),
      setBusy: vi.fn(),
      handleError: vi.fn(),
      apiClient,
      confirm
    }))

    await act(async () => {
      await result.current.clearPastTags()
    })

    expect(confirm).toHaveBeenCalledWith('Clear these past tags?')
    expect(apiClient.clearPastTags).not.toHaveBeenCalled()
    expect(setPostsPayload).not.toHaveBeenCalled()
  })
})

function tagPayload() {
  return {
    ignored_tags: [],
    poisoned_pill_tags: [],
    favorite_tags: [],
    past_tags: []
  }
}
