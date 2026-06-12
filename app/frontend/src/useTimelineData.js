import { useEffect, useState } from 'react'
import { api } from './api'

export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function useTimelineData({visible, onResetSignposts, postTimelineApi = api.postTimeline, timeZoneProvider = browserTimeZone}) {
  const [state, setState] = useState({status: 'idle', payload: null, error: null})

  useEffect(() => {
    if (!visible) {
      onResetSignposts?.()
      return undefined
    }

    let active = true
    const timeZone = timeZoneProvider()
    setState((current) => ({status: current.payload ? 'ready' : 'loading', payload: current.payload, error: null}))

    postTimelineApi({time_zone: timeZone})
      .then((payload) => {
        if (!active) return

        onResetSignposts?.()
        setState({status: 'ready', payload, error: null})
      })
      .catch((error) => {
        if (active) setState({status: 'error', payload: null, error: error.message || 'Timeline failed to load.'})
      })

    return () => {
      active = false
    }
  }, [onResetSignposts, postTimelineApi, timeZoneProvider, visible])

  return state
}
