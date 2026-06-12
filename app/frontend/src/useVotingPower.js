import { useCallback, useEffect, useState } from 'react'
import { api } from './api'

const unavailableVotingPower = {status: 'unavailable', percent: null}

export function normalizeVotingPower(payload) {
  return payload.status === 'ready' ? {status: 'ready', percent: payload.percent} : unavailableVotingPower
}

export function useVotingPower({authenticated, votingPowerApi = api.votingPower, pollInterval = 60_000}) {
  const [votingPower, setVotingPower] = useState({status: 'loading', percent: null})

  const refreshVotingPower = useCallback(() => {
    if (!authenticated) return Promise.resolve()

    return votingPowerApi()
      .then((payload) => {
        setVotingPower(normalizeVotingPower(payload))
      })
      .catch(() => {
        setVotingPower(unavailableVotingPower)
      })
  }, [authenticated, votingPowerApi])

  useEffect(() => {
    if (!authenticated) return undefined

    let cancelled = false
    const guardedRefreshVotingPower = () => {
      votingPowerApi()
        .then((payload) => {
          if (cancelled) return
          setVotingPower(normalizeVotingPower(payload))
        })
        .catch(() => {
          if (cancelled) return
          setVotingPower(unavailableVotingPower)
        })
    }

    guardedRefreshVotingPower()
    const intervalId = window.setInterval(guardedRefreshVotingPower, pollInterval)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [authenticated, pollInterval, votingPowerApi])

  return {votingPower, refreshVotingPower}
}

