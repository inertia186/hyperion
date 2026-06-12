export function postsPayloadWithChainStats(payload, postId, statsPayload, fetchedAt = () => new Date().toISOString()) {
  if (!payload || !statsPayload || statsPayload.status !== 'ready') return payload

  const payoutFetchedAt = statsPayload.payout_fetched_at ?? (statsPayload.payout ? fetchedAt() : null)

  return {
    ...payload,
    posts: payload.posts.map((post) => post.id === postId ? {
      ...post,
      payout: statsPayload.payout ?? post.payout,
      payout_amount: statsPayload.payout_amount ?? post.payout_amount,
      payout_currency: statsPayload.payout_currency ?? post.payout_currency,
      payout_fetched_at: payoutFetchedAt ?? post.payout_fetched_at,
      payout_source: statsPayload.payout_source ?? post.payout_source,
      current_vote: statsPayload.current_vote ?? post.current_vote
    } : post)
  }
}

export function postsPayloadWithPayout(payload, postId, payoutPayload) {
  if (!payload || !payoutPayload || payoutPayload.status !== 'ready') return payload

  return {
    ...payload,
    posts: payload.posts.map((post) => post.id === postId ? {
      ...post,
      payout: payoutPayload.payout ?? post.payout,
      payout_amount: payoutPayload.payout_amount ?? post.payout_amount,
      payout_currency: payoutPayload.payout_currency ?? post.payout_currency,
      payout_fetched_at: payoutPayload.payout_fetched_at ?? post.payout_fetched_at,
      payout_source: payoutPayload.payout_source ?? post.payout_source
    } : post)
  }
}

