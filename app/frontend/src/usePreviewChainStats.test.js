import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { api } from './api'
import { usePreviewChainStats } from './usePreviewChainStats'

vi.mock('./api', () => ({
  api: {
    postChainStats: vi.fn()
  }
}))

const post = {id: 1, author: 'alice', permlink: 'post'}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('usePreviewChainStats', () => {
  test('loads preview stats and reports ready payloads', async () => {
    const onChainStatsRefresh = vi.fn()
    api.postChainStats.mockResolvedValueOnce({status: 'ready', votes: 2, replies: 3, payout: '1.000 HBD', current_vote: 10000})

    const {result} = renderHook(() => (
      usePreviewChainStats({post, displayPost: post, previewReady: true, onChainStatsRefresh})
    ))

    expect(result.current.stats.status).toBe('loading')
    await waitFor(() => expect(result.current.stats).toMatchObject({
      status: 'ready',
      votes: 2,
      replies: 3,
      payout: '1.000 HBD',
      currentVote: 10000
    }))
    expect(api.postChainStats).toHaveBeenCalledWith(1, {author: 'alice', permlink: 'post'})
    expect(onChainStatsRefresh).toHaveBeenCalledWith(1, {status: 'ready', votes: 2, replies: 3, payout: '1.000 HBD', current_vote: 10000})
  })

  test('retries vote refresh until the expected vote appears', async () => {
    vi.useFakeTimers()
    const onChainStatsRefresh = vi.fn()
    api.postChainStats
      .mockResolvedValueOnce({status: 'ready', votes: 2, replies: 3, payout: '1.000 HBD', current_vote: 0})
      .mockResolvedValueOnce({status: 'ready', votes: 2, replies: 3, payout: '1.000 HBD', current_vote: 0})
      .mockResolvedValueOnce({status: 'ready', votes: 4, replies: 3, payout: '2.000 HBD', current_vote: 4200})

    const {result} = renderHook(() => (
      usePreviewChainStats({post, displayPost: post, previewReady: true, onChainStatsRefresh})
    ))

    await act(async () => {})
    expect(result.current.stats.currentVote).toBe(0)

    act(() => result.current.refreshStatsAfterVote({expectedVote: 4200}))
    expect(result.current.stats.status).toBe('loading')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })
    expect(api.postChainStats).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000)
    })
    expect(result.current.stats).toMatchObject({status: 'ready', votes: 4, currentVote: 4200})
    expect(onChainStatsRefresh).toHaveBeenLastCalledWith(1, {status: 'ready', votes: 4, replies: 3, payout: '2.000 HBD', current_vote: 4200}, {refreshVotingPower: true})
  })
})
