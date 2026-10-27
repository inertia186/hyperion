import { useEffect, useState } from 'react'
import { api } from './api'

export const emptyPreviewState = {postId: null, status: 'idle', html: '', detail: null, error: null}

export function usePostPreview(selectedId, {desktopPreviewScrollRef, mobilePreviewScrollRef, postApi = api.post} = {}) {
  const [previewState, setPreviewState] = useState(emptyPreviewState)

  useEffect(() => {
    if (!selectedId) {
      setPreviewState(emptyPreviewState)
      return
    }

    const controller = new AbortController()
    setPreviewState({postId: selectedId, status: 'loading', html: '', detail: null, error: null})

    postApi(selectedId, {signal: controller.signal})
      .then((payload) => {
        if (controller.signal.aborted) return

        setPreviewState({postId: selectedId, status: 'ready', html: payload.body_html || '', detail: payload, error: null})
        if (desktopPreviewScrollRef?.current) desktopPreviewScrollRef.current.scrollTop = 0
        if (mobilePreviewScrollRef?.current) mobilePreviewScrollRef.current.scrollTop = 0
      })
      .catch((err) => {
        if (controller.signal.aborted) return

        setPreviewState({postId: selectedId, status: 'error', html: '', detail: null, error: err.message || 'Request failed'})
      })

    return () => controller.abort()
  }, [postApi, selectedId])

  return previewState
}
