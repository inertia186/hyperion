import { describe, expect, test, vi } from 'vitest'
import { refreshPendingPayout, refreshReplyCount, refreshVoteCount } from '../../javascript/controllers/posts_details'

describe('legacy posts detail helpers', () => {
  test('renders vote counts and highlights the current account vote', () => {
    const voteCount = document.createElement('button')
    voteCount.className = 'badge-secondary'
    const hiveApi = {
      getActiveVotes: vi.fn((_author, _permlink, callback) => callback(null, [
        {voter: 'curator', percent: 10000},
        {voter: 'other', percent: 5000},
        {voter: 'downvoter', percent: -10000}
      ]))
    }

    refreshVoteCount({hiveApi, voteCount, author: 'alice', permlink: 'post', currentAccountName: 'curator'})

    expect(hiveApi.getActiveVotes).toHaveBeenCalledWith('alice', 'post', expect.any(Function))
    expect(voteCount.textContent).toBe('Votes: 2')
    expect(voteCount.classList.contains('badge-secondary')).toBe(false)
    expect(voteCount.classList.contains('badge-success')).toBe(true)
  })

  test('marks the current account downvote', () => {
    const voteCount = document.createElement('button')
    voteCount.className = 'badge-secondary'
    const hiveApi = {
      getActiveVotes: vi.fn((_author, _permlink, callback) => callback(null, [
        {voter: 'curator', percent: -5000}
      ]))
    }

    refreshVoteCount({hiveApi, voteCount, author: 'alice', permlink: 'post', currentAccountName: 'curator'})

    expect(voteCount.textContent).toBe('Votes: 0')
    expect(voteCount.classList.contains('badge-secondary')).toBe(false)
    expect(voteCount.classList.contains('badge-danger')).toBe(true)
  })

  test('renders reply counts after showing a loading placeholder', () => {
    const replyCount = document.createElement('button')
    const hiveApi = {
      getContentReplies: vi.fn((_author, _permlink, callback) => {
        expect(replyCount.textContent).toContain('Replies: 0')
        callback(null, [{id: 1}, {id: 2}])
      })
    }

    refreshReplyCount({hiveApi, replyCount, author: 'alice', permlink: 'post'})

    expect(replyCount.textContent).toBe('Replies: 2')
  })

  test('renders pending or paid payout values', () => {
    const pendingPayout = document.createElement('span')
    const hiveApi = {
      getContent: vi.fn((_author, _permlink, callback) => callback(null, {
        cashout_time: '2026-06-12T00:00:00',
        pending_payout_value: '1.234 HBD',
        total_payout_value: '5.678 HBD'
      }))
    }

    refreshPendingPayout({hiveApi, pendingPayout, author: 'alice', permlink: 'post'})
    expect(pendingPayout.textContent).toBe('1.234 HBD')

    hiveApi.getContent.mockImplementation((_author, _permlink, callback) => callback(null, {
      cashout_time: '1969-12-31T23:59:59',
      pending_payout_value: '1.234 HBD',
      total_payout_value: '5.678 HBD'
    }))
    refreshPendingPayout({hiveApi, pendingPayout, author: 'alice', permlink: 'post'})

    expect(pendingPayout.textContent).toBe('5.678 HBD')
  })
})
