import { useEffect, useRef, useState } from 'react'
import { api } from './api'

export const emptyPreviewState = {postId: null, status: 'idle', html: '', detail: null, error: null}

export function usePostPreview(selectedId, {desktopPreviewScrollRef, mobilePreviewScrollRef, postApi = api.post} = {}) {
  const [previewState, setPreviewState] = useState(emptyPreviewState)
  const previewRequestRef = useRef(0)

  useEffect(() => {
    if (!selectedId) {
      previewRequestRef.current += 1
      setPreviewState(emptyPreviewState)
      return
    }

    const requestId = previewRequestRef.current + 1
    previewRequestRef.current = requestId
    setPreviewState({postId: selectedId, status: 'loading', html: '', detail: null, error: null})

    postApi(selectedId)
      .then((payload) => {
        if (previewRequestRef.current !== requestId) return

        setPreviewState({postId: selectedId, status: 'ready', html: payload.body_html || '', detail: payload, error: null})
        if (desktopPreviewScrollRef?.current) desktopPreviewScrollRef.current.scrollTop = 0
        if (mobilePreviewScrollRef?.current) mobilePreviewScrollRef.current.scrollTop = 0
      })
      .catch((err) => {
        if (previewRequestRef.current !== requestId) return

        setPreviewState({postId: selectedId, status: 'error', html: '', detail: null, error: err.message || 'Request failed'})
      })
  }, [postApi, selectedId])

  return previewState
}
