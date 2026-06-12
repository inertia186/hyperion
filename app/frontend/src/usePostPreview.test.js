import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { emptyPreviewState, usePostPreview } from './usePostPreview'

function deferred() {
  let resolve
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve
  })

  return {promise, resolve}
}

describe('usePostPreview', () => {
  test('ignores stale responses and resets preview scroll for the current post', async () => {
    const first = deferred()
    const second = deferred()
    const calls = []
    const desktopPreviewScrollRef = {current: {scrollTop: 42}}
    const mobilePreviewScrollRef = {current: {scrollTop: 99}}
    const postApi = (postId) => {
      calls.push(postId)
      return postId === 1 ? first.promise : second.promise
    }

    const {result, rerender, unmount} = renderHook(({selectedId}) => (
      usePostPreview(selectedId, {desktopPreviewScrollRef, mobilePreviewScrollRef, postApi})
    ), {initialProps: {selectedId: 1}})

    expect(result.current).toEqual({postId: 1, status: 'loading', html: '', detail: null, error: null})

    rerender({selectedId: 2})
    expect(calls).toEqual([1, 2])
    expect(result.current).toEqual({postId: 2, status: 'loading', html: '', detail: null, error: null})

    await act(async () => {
      first.resolve({id: 1, body_html: '<p>old</p>'})
      await first.promise
    })

    expect(result.current).toEqual({postId: 2, status: 'loading', html: '', detail: null, error: null})

    await act(async () => {
      second.resolve({id: 2, body_html: '<p>new</p>'})
      await second.promise
    })

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current).toEqual({
      postId: 2,
      status: 'ready',
      html: '<p>new</p>',
      detail: {id: 2, body_html: '<p>new</p>'},
      error: null
    })
    expect(desktopPreviewScrollRef.current.scrollTop).toBe(0)
    expect(mobilePreviewScrollRef.current.scrollTop).toBe(0)
    unmount()
  })

  test('clears preview state when there is no selected post', async () => {
    const request = deferred()
    const postApi = () => request.promise
    const {result, rerender, unmount} = renderHook(({selectedId}) => (
      usePostPreview(selectedId, {postApi})
    ), {initialProps: {selectedId: 1}})

    rerender({selectedId: null})

    expect(result.current).toEqual(emptyPreviewState)

    await act(async () => {
      request.resolve({})
      await request.promise
    })
    expect(result.current).toEqual(emptyPreviewState)
    unmount()
  })
})
