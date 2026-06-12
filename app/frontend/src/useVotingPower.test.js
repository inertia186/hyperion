import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { normalizeVotingPower, useVotingPower } from './useVotingPower'

afterEach(() => {
  vi.useRealTimers()
})

describe('useVotingPower', () => {
  test('normalizes voting power payloads', () => {
    expect(normalizeVotingPower({status: 'ready', percent: 92.5})).toEqual({status: 'ready', percent: 92.5})
    expect(normalizeVotingPower({status: 'missing'})).toEqual({status: 'unavailable', percent: null})
  })

  test('does not request voting power before authentication', async () => {
    const votingPowerApi = vi.fn()
    const {result} = renderHook(() => useVotingPower({authenticated: false, votingPowerApi}))

    await act(async () => {
      await result.current.refreshVotingPower()
    })

    expect(votingPowerApi).not.toHaveBeenCalled()
    expect(result.current.votingPower).toEqual({status: 'loading', percent: null})
  })

  test('loads and refreshes voting power for authenticated sessions', async () => {
    const votingPowerApi = vi.fn()
      .mockResolvedValueOnce({status: 'ready', percent: 81})
      .mockResolvedValueOnce({status: 'ready', percent: 79})

    const {result} = renderHook(() => useVotingPower({authenticated: true, votingPowerApi}))

    await waitFor(() => expect(result.current.votingPower).toEqual({status: 'ready', percent: 81}))

    await act(async () => {
      await result.current.refreshVotingPower()
    })

    expect(result.current.votingPower).toEqual({status: 'ready', percent: 79})
  })

  test('polls voting power and marks failures unavailable', async () => {
    vi.useFakeTimers()
    const votingPowerApi = vi.fn()
      .mockResolvedValueOnce({status: 'ready', percent: 50})
      .mockRejectedValueOnce(new Error('offline'))

    const {result} = renderHook(() => useVotingPower({authenticated: true, votingPowerApi, pollInterval: 1000}))

    await act(async () => {})
    expect(result.current.votingPower).toEqual({status: 'ready', percent: 50})

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(result.current.votingPower).toEqual({status: 'unavailable', percent: null})
  })
})
