import { useEffect } from 'react'

export function usePreviewImageSources({previewReady, previewScrollRef, previewHtml, theme}) {
  useEffect(() => {
    if (!previewReady) return undefined
    const previewNode = previewScrollRef?.current
    if (!previewNode) return undefined

    const cleanupCallbacks = []

    previewNode.querySelectorAll('.post-body img.bbs-image-source').forEach((image) => {
      const originalSrc = image.dataset.bbsOriginalSrc || image.getAttribute('src') || ''
      const pixelSrc = image.dataset.bbsPixelSrc || originalSrc

      if (!image.dataset.bbsOriginalSrc) image.dataset.bbsOriginalSrc = originalSrc
      if (!image.dataset.bbsOriginalSrcset && image.getAttribute('srcset')) {
        image.dataset.bbsOriginalSrcset = image.getAttribute('srcset')
      }

      if (theme === 'bbs' && pixelSrc) {
        const applyPixelSource = () => {
          const renderedWidth = Math.ceil(image.getBoundingClientRect().width)
          const fallbackWidth = Math.min(
            image.naturalWidth || 0,
            image.parentElement?.clientWidth || image.naturalWidth || 0
          )
          const targetWidth = renderedWidth || fallbackWidth

          if (targetWidth > 0) image.style.width = `${targetWidth}px`
          image.style.height = 'auto'
          image.setAttribute('src', pixelSrc)
          image.removeAttribute('srcset')
          image.dataset.bbsImage = 'pixel'
        }

        if (image.complete && image.naturalWidth > 0) {
          applyPixelSource()
        } else {
          image.setAttribute('src', originalSrc)
          const handleLoad = () => applyPixelSource()
          image.addEventListener('load', handleLoad, {once: true})
          cleanupCallbacks.push(() => image.removeEventListener('load', handleLoad))
        }
      } else {
        image.setAttribute('src', originalSrc)
        if (image.dataset.bbsOriginalSrcset) {
          image.setAttribute('srcset', image.dataset.bbsOriginalSrcset)
        }
        image.style.width = ''
        image.style.height = ''
        image.dataset.bbsImage = 'source'
      }
    })

    return () => {
      cleanupCallbacks.forEach((callback) => callback())
    }
  }, [previewHtml, previewReady, previewScrollRef, theme])
}
