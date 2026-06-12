import { useCallback, useEffect, useState } from 'react'

export function useCurationPreviewState({isMobilePreviewLayout, setSelectedId}) {
  const [previewActive, setPreviewActive] = useState(false)
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false)

  const openPreview = useCallback(() => {
    setPreviewActive(true)
    if (isMobilePreviewLayout) setMobilePreviewOpen(true)
  }, [isMobilePreviewLayout])

  const closePreview = useCallback(() => {
    setPreviewActive(false)
    if (isMobilePreviewLayout) setMobilePreviewOpen(false)
  }, [isMobilePreviewLayout])

  const togglePreview = useCallback(() => {
    if (previewActive) {
      closePreview()
    } else {
      openPreview()
    }
  }, [closePreview, openPreview, previewActive])

  const selectPost = useCallback((postId) => {
    setSelectedId(postId)
    if (isMobilePreviewLayout) openPreview()
  }, [isMobilePreviewLayout, openPreview, setSelectedId])

  useEffect(() => {
    if (!isMobilePreviewLayout) {
      setMobilePreviewOpen(false)
    }
  }, [isMobilePreviewLayout])

  useEffect(() => {
    document.body.classList.toggle('mobile-preview-open', mobilePreviewOpen && isMobilePreviewLayout)

    return () => document.body.classList.remove('mobile-preview-open')
  }, [isMobilePreviewLayout, mobilePreviewOpen])

  return {
    previewActive,
    setPreviewActive,
    mobilePreviewOpen,
    setMobilePreviewOpen,
    openPreview,
    closePreview,
    togglePreview,
    selectPost
  }
}
