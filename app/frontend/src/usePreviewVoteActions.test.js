import { act, renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { hivesignerVoteUrl, usePreviewVoteActions } from './usePreviewVoteActions'

const displayPost = {author: 'visible-author', permlink: 'first-post'}
const defaults = {displayPost, accountName: 'fixture-curator', walletProvider: 'keychain'}

describe('preview vote actions', () => {
  test('builds encoded hivesigner vote URLs', () => {
    expect(hivesignerVoteUrl({accountName: 'fixture curator', author: 'visible.author', permlink: 'first/post', weight: -1700}))
      .toBe('https://hivesigner.com/sign/vote?authority=post&voter=fixture%20curator&author=visible.author&permlink=first%2Fpost&weight=-1700')
  })

  test('opens per-vote HiveSigner approval and never treats dismissal as a successful vote', async () => {
    const refreshStatsAfterVote = vi.fn()
    const vote = vi.fn(async (args) => ({status: 'approval_required', url: hivesignerVoteUrl(args)}))
    const {result} = renderHook(() => usePreviewVoteActions({...defaults, walletProvider: 'hivesigner', vote, refreshStatsAfterVote}))
    act(() => result.current.setVoteWeight(17))
    await act(async () => result.current.castVote(-1))
    expect(result.current.hivesignerModal.url).toContain('weight=-1700')
    expect(refreshStatsAfterVote).not.toHaveBeenCalled()
    act(() => result.current.closeHivesignerModal({refresh: false}))
    expect(result.current.hivesignerModal).toBeNull()
    expect(refreshStatsAfterVote).not.toHaveBeenCalled()
    await act(async () => result.current.castVote(1))
    act(() => result.current.closeHivesignerModal())
    expect(refreshStatsAfterVote).toHaveBeenCalledWith()
  })

  test.each(['keychain', 'hiveauth', 'peakvault'])('refreshes only after an approved %s vote', async (walletProvider) => {
    const refreshStatsAfterVote = vi.fn()
    const vote = vi.fn().mockResolvedValue({status: 'submitted'})
    const {result} = renderHook(() => usePreviewVoteActions({...defaults, walletProvider, vote, refreshStatsAfterVote}))
    act(() => result.current.setVoteWeight(42))
    await act(async () => result.current.castVote(1))
    expect(vote).toHaveBeenCalledWith({accountName: 'fixture-curator', provider: walletProvider, author: 'visible-author', permlink: 'first-post', weight: 4200})
    expect(result.current.voteBusy).toBe(false)
    expect(refreshStatsAfterVote).toHaveBeenCalledWith({expectedVote: 4200})
  })

  test('clears busy state and displays rejected or timed-out requests', async () => {
    const alertUser = vi.fn()
    const refreshStatsAfterVote = vi.fn()
    const vote = vi.fn().mockRejectedValue(new Error('Wallet request timed out.'))
    const {result} = renderHook(() => usePreviewVoteActions({...defaults, vote, alertUser, refreshStatsAfterVote}))
    await act(async () => result.current.castVote(1))
    expect(alertUser).toHaveBeenCalledWith('Wallet request timed out.')
    expect(result.current.voteBusy).toBe(false)
    expect(refreshStatsAfterVote).not.toHaveBeenCalled()
  })

  test('blocks duplicate clicks and ignores completions after switching accounts or posts', async () => {
    let resolveVote
    const refreshStatsAfterVote = vi.fn()
    const vote = vi.fn(() => new Promise((resolve) => { resolveVote = resolve }))
    const {result, rerender} = renderHook((props) => usePreviewVoteActions({...props, vote, refreshStatsAfterVote}), {initialProps: defaults})
    act(() => { result.current.castVote(1); result.current.castVote(1) })
    expect(vote).toHaveBeenCalledOnce()
    rerender({...defaults, accountName: 'different-curator', displayPost: {...displayPost, permlink: 'different-post'}})
    await act(async () => resolveVote({status: 'submitted'}))
    expect(refreshStatsAfterVote).not.toHaveBeenCalled()
    expect(result.current.voteBusy).toBe(false)
  })
})
