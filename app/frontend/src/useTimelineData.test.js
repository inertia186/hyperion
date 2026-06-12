import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { browserTimeZone, useTimelineData } from './useTimelineData'

const utcTimeZone = () => 'UTC'
const pacificTimeZone = () => 'America/Los_Angeles'

function deferred() {
  let resolve
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve
  })

  return {promise, resolve}
}

describe('useTimelineData', () => {
  test('loads timeline data with browser-local timezone and resets signposts', async () => {
    const payload = {buckets: [{starts_at: '2026-06-12T00:00:00Z'}]}
    const postTimelineApi = vi.fn(() => Promise.resolve(payload))
    const onResetSignposts = vi.fn()

    const {result} = renderHook(() => (
      useTimelineData({
        visible: true,
        onResetSignposts,
        postTimelineApi,
        timeZoneProvider: pacificTimeZone
      })
    ))

    expect(result.current).toEqual({status: 'loading', payload: null, error: null})
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current).toEqual({status: 'ready', payload, error: null})
    expect(postTimelineApi).toHaveBeenCalledWith({time_zone: 'America/Los_Angeles'})
    expect(onResetSignposts).toHaveBeenCalledTimes(1)
  })

  test('keeps stale payload visible while reloading and ignores stale responses', async () => {
    const first = deferred()
    const second = deferred()
    const postTimelineApi = vi.fn()
      .mockReturnValueOnce(Promise.resolve({buckets: ['cached']}))
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    const {result, rerender} = renderHook(({visible}) => (
      useTimelineData({
        visible,
        postTimelineApi,
        timeZoneProvider: utcTimeZone
      })
    ), {initialProps: {visible: true}})

    await waitFor(() => expect(result.current.payload).toEqual({buckets: ['cached']}))

    rerender({visible: false})
    rerender({visible: true})
    expect(result.current).toEqual({status: 'ready', payload: {buckets: ['cached']}, error: null})

    rerender({visible: false})
    rerender({visible: true})

    await act(async () => {
      first.resolve({buckets: ['stale']})
      await first.promise
    })
    expect(result.current.payload).toEqual({buckets: ['cached']})

    await act(async () => {
      second.resolve({buckets: ['fresh']})
      await second.promise
    })
    await waitFor(() => expect(result.current.payload).toEqual({buckets: ['fresh']}))
  })

  test('captures timeline load errors', async () => {
    const postTimelineApi = vi.fn(() => Promise.reject(new Error('Timeline unavailable')))
    const {result} = renderHook(() => (
      useTimelineData({
        visible: true,
        postTimelineApi,
        timeZoneProvider: utcTimeZone
      })
    ))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current).toEqual({status: 'error', payload: null, error: 'Timeline unavailable'})
  })

  test('falls back to UTC when the browser has no timezone', () => {
    expect(browserTimeZone()).toBeTruthy()
  })
})
