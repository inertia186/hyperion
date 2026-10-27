import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
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
    const signals = []
    const desktopPreviewScrollRef = {current: {scrollTop: 42}}
    const mobilePreviewScrollRef = {current: {scrollTop: 99}}
    const postApi = (postId, {signal}) => {
      calls.push(postId)
      signals.push(signal)
      return postId === 1 ? first.promise : second.promise
    }

    const {result, rerender, unmount} = renderHook(({selectedId}) => (
      usePostPreview(selectedId, {desktopPreviewScrollRef, mobilePreviewScrollRef, postApi})
    ), {initialProps: {selectedId: 1}})

    expect(result.current).toEqual({postId: 1, status: 'loading', html: '', detail: null, error: null})

    rerender({selectedId: 2})
    expect(calls).toEqual([1, 2])
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
    expect(result.current).toEqual({postId: 2, status: 'loading', html: '', detail: null, error: null})
    expect(desktopPreviewScrollRef.current.scrollTop).toBe(42)
    expect(mobilePreviewScrollRef.current.scrollTop).toBe(99)

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
    expect(signals[1].aborted).toBe(true)
  })

  test('clears preview state when there is no selected post', async () => {
    const request = deferred()
    let signal
    const postApi = (_postId, options) => { signal = options.signal; return request.promise }
    const {result, rerender, unmount} = renderHook(({selectedId}) => (
      usePostPreview(selectedId, {postApi})
    ), {initialProps: {selectedId: 1}})

    rerender({selectedId: null})

    expect(result.current).toEqual(emptyPreviewState)
    expect(signal.aborted).toBe(true)

    await act(async () => {
      request.resolve({})
      await request.promise
    })
    expect(result.current).toEqual(emptyPreviewState)
    unmount()
  })

  test('unmount prevents a late non-cancellable response from resetting scroll', async () => {
    const request = deferred()
    const postApi = () => request.promise
    const desktopPreviewScrollRef = {current: {scrollTop: 42}}
    const mobilePreviewScrollRef = {current: {scrollTop: 99}}
    const {unmount} = renderHook(() => usePostPreview(1, {
      postApi, desktopPreviewScrollRef, mobilePreviewScrollRef
    }))

    unmount()
    await act(async () => {
      request.resolve({id: 1, body_html: '<p>Late body</p>'})
      await request.promise
    })

    expect(desktopPreviewScrollRef.current.scrollTop).toBe(42)
    expect(mobilePreviewScrollRef.current.scrollTop).toBe(99)
  })

  test('Strict Mode cleanup cancels its first request and keeps the replacement active', async () => {
    const requests = []
    const postApi = (_id, {signal}) => {
      const request = {...deferred(), signal}
      requests.push(request)
      return request.promise
    }
    const {result, unmount} = renderHook(() => usePostPreview(1, {postApi}), {wrapper: StrictMode})

    expect(requests).toHaveLength(2)
    expect(requests[0].signal.aborted).toBe(true)
    expect(requests[1].signal.aborted).toBe(false)
    await act(async () => { requests[0].resolve({body_html: 'Old body'}); await requests[0].promise })
    expect(result.current.status).toBe('loading')
    await act(async () => { requests[1].resolve({body_html: 'Current body'}); await requests[1].promise })
    expect(result.current).toMatchObject({postId: 1, status: 'ready', html: 'Current body'})
    unmount()
    expect(requests[1].signal.aborted).toBe(true)
  })
})
