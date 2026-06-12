import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { useCurationPosts } from './useCurationPosts'

const firstPage = {
  query: {tag_pattern: 'haf', query: ''},
  pagination: {page: 1, total_pages: 2, total_count: 3, limit: 2},
  posts: [{id: 1}, {id: 2}]
}

const secondPage = {
  query: {tag_pattern: 'haf', query: ''},
  pagination: {page: 2, total_pages: 2, total_count: 3, limit: 2},
  posts: [{id: 2}, {id: 3}]
}

describe('useCurationPosts', () => {
  test('loads posts and reports loaded payloads', async () => {
    const postsApi = vi.fn(() => Promise.resolve(firstPage))
    const onPostsLoaded = vi.fn()
    const query = {tag: 'haf'}
    const {result} = renderHook(() => useCurationPosts({query, refreshKey: 0, postsApi, onPostsLoaded}))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.postsPayload).toBe(firstPage)
    expect(result.current.hasMorePosts).toBe(true)
    expect(onPostsLoaded).toHaveBeenCalledWith(firstPage)
    expect(postsApi.mock.calls[0][0].toString()).toContain('tag=haf')
  })

  test('loads additional pages and de-duplicates appended posts', async () => {
    const postsApi = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage)
    const query = {tag: 'haf'}
    const {result} = renderHook(() => useCurationPosts({query, refreshKey: 0, postsApi}))

    await waitFor(() => expect(result.current.postsPayload).toBe(firstPage))

    await act(async () => {
      result.current.loadMorePosts()
    })
    await waitFor(() => expect(result.current.postsPayload.posts.map((post) => post.id)).toEqual([1, 2, 3]))
    expect(result.current.hasMorePosts).toBe(false)
    expect(postsApi.mock.calls[1][0].toString()).toContain('page=2')
  })

  test('does not load more while already loading or without more pages', async () => {
    const singlePage = {...firstPage, pagination: {page: 1, total_pages: 1, total_count: 2, limit: 2}}
    const postsApi = vi.fn(() => Promise.resolve(singlePage))
    const query = {}
    const {result} = renderHook(() => useCurationPosts({query, refreshKey: 0, postsApi}))

    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.loadMorePosts())
    expect(postsApi).toHaveBeenCalledTimes(1)
  })

  test('captures load errors and redirects login errors', async () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {...window.location, assign}
    })
    const postsApi = vi.fn()
      .mockRejectedValueOnce(new Error('No posts today'))
      .mockRejectedValueOnce({status: 401, payload: {login_url: '/sessions/new'}})
    const query = {}
    const {result, rerender} = renderHook(({refreshKey}) => useCurationPosts({query, refreshKey, postsApi}), {initialProps: {refreshKey: 0}})

    await waitFor(() => expect(result.current.error).toBe('No posts today'))

    rerender({refreshKey: 1})
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/sessions/new'))
  })
})
