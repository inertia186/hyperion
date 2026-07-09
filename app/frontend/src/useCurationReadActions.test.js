import { act, renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { useCurationReadActions } from './useCurationReadActions'

function payload(posts) {
  return {
    posts,
    counts: {read_posts: 0},
    mode_counts: {unread: posts.length, read: 0},
    pagination: {total_count: posts.length, total_pages: 1, limit: 30}
  }
}

function setup(options = {}) {
  const state = {payload: payload(options.posts || [{id: 1, read: false}, {id: 2, read: false}])}
  const applyReadTransition = vi.fn()
  const setPostsPayload = vi.fn((updater) => {
    state.payload = updater(state.payload)
  })
  const apiClient = {
    markRead: vi.fn(async () => ({read: true})),
    markManyRead: vi.fn(async () => ({marked_count: options.markedCount || 1}))
  }
  const props = {
    posts: state.payload.posts,
    selectedPost: state.payload.posts[0],
    selectedPostIds: new Set(options.selectedPostIds || [1]),
    allMatchingSelected: options.allMatchingSelected || false,
    query: options.query || {},
    selectedId: options.selectedId || 1,
    applyReadTransition,
    clearAllMatchingSelection: vi.fn(),
    clearSelection: vi.fn(),
    handleError: vi.fn(),
    removeSelectedPostId: vi.fn(),
    setBusy: vi.fn(),
    setPostsPayload,
    apiClient
  }
  const hook = renderHook(() => useCurationReadActions(props))

  return {apiClient, applyReadTransition, hook, props, state}
}

describe('useCurationReadActions', () => {
  test('marks the selected post read and applies the read transition', async () => {
    const {apiClient, applyReadTransition, hook, props, state} = setup()

    await act(async () => {
      await hook.result.current.markSelectedReadAndMoveNext()
    })

    expect(apiClient.markRead).toHaveBeenCalledWith(1)
    expect(props.clearAllMatchingSelection).toHaveBeenCalled()
    expect(props.removeSelectedPostId).toHaveBeenCalledWith(1)
    expect(applyReadTransition).toHaveBeenCalledWith(expect.objectContaining({selectedId: 2}))
    expect(state.payload.posts).toEqual([{id: 2, read: false}])
    expect(props.setBusy).toHaveBeenNthCalledWith(1, true)
    expect(props.setBusy).toHaveBeenLastCalledWith(false)
  })

  test('marks all matching posts read with the active query', async () => {
    const query = {tag: 'ruby'}
    const {apiClient, applyReadTransition, hook, props, state} = setup({
      allMatchingSelected: true,
      markedCount: 3,
      query
    })

    await act(async () => {
      await hook.result.current.markSelectedRead()
    })

    expect(apiClient.markManyRead).toHaveBeenCalledWith({all_matching: true, query})
    expect(props.clearSelection).toHaveBeenCalled()
    expect(applyReadTransition).toHaveBeenCalledWith(expect.objectContaining({selectedId: null, clearPreview: true}))
    expect(state.payload.posts).toEqual([])
  })
})
