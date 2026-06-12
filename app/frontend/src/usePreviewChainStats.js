import { useEffect, useRef, useState } from 'react'
import { api } from './api'

const emptyStats = {status: 'idle', votes: null, replies: null, payout: null, currentVote: null}
const loadingStats = {status: 'loading', votes: null, replies: null, payout: null, currentVote: null}
const voteRefreshDelays = [2500, 7000, 15000]

function statsFromPayload(payload, fallback = emptyStats) {
  return {
    status: payload.status || 'ready',
    votes: payload.votes ?? fallback.votes,
    replies: payload.replies ?? fallback.replies,
    payout: payload.payout ?? fallback.payout,
    currentVote: payload.current_vote ?? fallback.currentVote
  }
}

export function usePreviewChainStats({post, displayPost, previewReady, onChainStatsRefresh}) {
  const [stats, setStats] = useState(emptyStats)
  const voteRefreshRef = useRef({id: 0, timeoutId: null})

  useEffect(() => {
    setStats(post ? loadingStats : emptyStats)
    voteRefreshRef.current.id += 1
    window.clearTimeout(voteRefreshRef.current.timeoutId)

    return () => {
      voteRefreshRef.current.id += 1
      window.clearTimeout(voteRefreshRef.current.timeoutId)
    }
  }, [post?.id])

  useEffect(() => {
    if (!displayPost) return undefined
    if (!previewReady) return undefined

    let active = true

    api.postChainStats(displayPost.id, {author: displayPost.author, permlink: displayPost.permlink})
      .then((payload) => {
        if (!active) return
        setStats(statsFromPayload(payload))
        if (payload.status === 'ready') onChainStatsRefresh?.(post.id, payload)
      })
      .catch(() => {
        if (active) setStats({status: 'unavailable', votes: null, replies: null, payout: null, currentVote: null})
      })

    return () => {
      active = false
    }
  }, [displayPost?.id, displayPost?.author, displayPost?.permlink, onChainStatsRefresh, post?.id, previewReady])

  const refreshStatsAfterVote = ({expectedVote = null} = {}) => {
    if (!displayPost) return

    const targetPost = displayPost
    const refreshId = voteRefreshRef.current.id + 1
    voteRefreshRef.current.id = refreshId
    window.clearTimeout(voteRefreshRef.current.timeoutId)
    setStats((current) => ({...current, status: 'loading'}))

    const scheduleRefresh = (attempt) => {
      voteRefreshRef.current.timeoutId = window.setTimeout(() => {
        if (voteRefreshRef.current.id !== refreshId) return

        api.postChainStats(targetPost.id, {author: targetPost.author, permlink: targetPost.permlink, refresh: true})
          .then((payload) => {
            if (voteRefreshRef.current.id !== refreshId) return
            if (payload.status !== 'ready') return
            setStats((current) => statsFromPayload(payload, current))

            const observedVote = payload.current_vote == null ? null : Number(payload.current_vote)
            if (expectedVote != null && observedVote !== expectedVote && attempt + 1 < voteRefreshDelays.length) {
              scheduleRefresh(attempt + 1)
            } else {
              onChainStatsRefresh?.(post.id, payload, {refreshVotingPower: true})
            }
          })
          .catch(() => {
            if (voteRefreshRef.current.id === refreshId && attempt + 1 < voteRefreshDelays.length) {
              scheduleRefresh(attempt + 1)
            }
          })
      }, voteRefreshDelays[attempt])
    }

    scheduleRefresh(0)
  }

  return {stats, refreshStatsAfterVote}
}

