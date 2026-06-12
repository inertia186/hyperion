import { act, renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { hivesignerVoteUrl, usePreviewVoteActions } from './usePreviewVoteActions'

const displayPost = {author: 'visible-author', permlink: 'first-post'}

describe('preview vote actions', () => {
  test('builds encoded hivesigner vote URLs', () => {
    expect(hivesignerVoteUrl({
      accountName: 'fixture curator',
      author: 'visible.author',
      permlink: 'first/post',
      weight: -1700
    })).toBe('https://hivesigner.com/sign/vote?authority=post&voter=fixture%20curator&author=visible.author&permlink=first%2Fpost&weight=-1700')
  })

  test('opens hivesigner votes in a modal and optionally refreshes on close', () => {
    const refreshStatsAfterVote = vi.fn()
    const {result} = renderHook(() => (
      usePreviewVoteActions({
        displayPost,
        accountName: 'fixture-curator',
        hivesignerAvailable: true,
        refreshStatsAfterVote
      })
    ))

    act(() => {
      result.current.setVoteWeight(17)
    })
    act(() => {
      result.current.castVote(-1)
    })

    expect(result.current.hivesignerModal.url).toBe('https://hivesigner.com/sign/vote?authority=post&voter=fixture-curator&author=visible-author&permlink=first-post&weight=-1700')
    expect(result.current.voteBusy).toBe(true)

    act(() => {
      result.current.closeHivesignerModal({refresh: false})
    })
    expect(result.current.hivesignerModal).toBeNull()
    expect(result.current.voteBusy).toBe(false)
    expect(refreshStatsAfterVote).not.toHaveBeenCalled()

    act(() => {
      result.current.castVote(1)
    })
    act(() => {
      result.current.closeHivesignerModal()
    })
    expect(refreshStatsAfterVote).toHaveBeenCalledWith()
  })

  test('casts keychain votes and refreshes after successful callbacks', () => {
    const refreshStatsAfterVote = vi.fn()
    const requestVote = vi.fn((_account, _permlink, _author, _weight, callback) => callback({success: true}))
    const {result} = renderHook(() => (
      usePreviewVoteActions({
        displayPost,
        accountName: 'fixture-curator',
        hivesignerAvailable: false,
        refreshStatsAfterVote,
        requestVote
      })
    ))

    act(() => {
      result.current.setVoteWeight(42)
    })
    act(() => {
      result.current.castVote(1)
    })

    expect(requestVote).toHaveBeenCalledWith('fixture-curator', 'first-post', 'visible-author', 4200, expect.any(Function))
    expect(result.current.voteBusy).toBe(false)
    expect(refreshStatsAfterVote).toHaveBeenCalledWith({expectedVote: 4200})
  })

  test('alerts and clears busy state when no signing transport is available', () => {
    const alertUser = vi.fn()
    const {result} = renderHook(() => (
      usePreviewVoteActions({
        displayPost,
        accountName: 'fixture-curator',
        hivesignerAvailable: false,
        refreshStatsAfterVote: vi.fn(),
        requestVote: undefined,
        alertUser
      })
    ))

    act(() => {
      result.current.castVote(1)
    })

    expect(alertUser).toHaveBeenCalledWith('Hive Keychain is not available.')
    expect(result.current.voteBusy).toBe(false)
  })
})
