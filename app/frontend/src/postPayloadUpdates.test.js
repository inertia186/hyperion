import { describe, expect, test } from 'vitest'
import { postsPayloadWithChainStats, postsPayloadWithPayout } from './postPayloadUpdates'

const payload = {
  posts: [
    {
      id: 1,
      payout: '0.100 HBD',
      payout_amount: '0.100',
      payout_currency: 'HBD',
      payout_fetched_at: 'old-date',
      payout_source: 'cache',
      current_vote: 0
    },
    {
      id: 2,
      payout: '0.200 HBD',
      payout_amount: '0.200',
      payout_currency: 'HBD',
      payout_fetched_at: 'old-date-2',
      payout_source: 'cache',
      current_vote: 10000
    }
  ]
}

describe('postPayloadUpdates', () => {
  test('merges ready chain stats into the matching post', () => {
    const nextPayload = postsPayloadWithChainStats(payload, 1, {
      status: 'ready',
      payout: '2.500 HBD',
      payout_amount: '2.500',
      payout_currency: 'HBD',
      payout_source: 'chain',
      current_vote: 4200
    }, () => 'generated-date')

    expect(nextPayload.posts[0]).toMatchObject({
      payout: '2.500 HBD',
      payout_amount: '2.500',
      payout_currency: 'HBD',
      payout_fetched_at: 'generated-date',
      payout_source: 'chain',
      current_vote: 4200
    })
    expect(nextPayload.posts[1]).toBe(payload.posts[1])
  })

  test('ignores unavailable chain stat payloads', () => {
    expect(postsPayloadWithChainStats(payload, 1, {status: 'unavailable'})).toBe(payload)
    expect(postsPayloadWithChainStats(null, 1, {status: 'ready'})).toBe(null)
  })

  test('merges ready payout fields without changing current vote', () => {
    const nextPayload = postsPayloadWithPayout(payload, 2, {
      status: 'ready',
      payout: '9.000 HBD',
      payout_amount: '9.000',
      payout_currency: 'HBD',
      payout_fetched_at: 'fresh-date',
      payout_source: 'refreshed'
    })

    expect(nextPayload.posts[1]).toMatchObject({
      payout: '9.000 HBD',
      payout_amount: '9.000',
      payout_currency: 'HBD',
      payout_fetched_at: 'fresh-date',
      payout_source: 'refreshed',
      current_vote: 10000
    })
  })
})
