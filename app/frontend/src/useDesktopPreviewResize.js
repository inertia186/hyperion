import { useCallback, useMemo, useState } from 'react'
import {
  MAX_DESKTOP_PREVIEW_PERCENT,
  MIN_DESKTOP_PREVIEW_PERCENT,
  clamp,
  readDesktopPreviewPercent,
  writeDesktopPreviewPercent
} from './curationInboxState'

export function useDesktopPreviewResize(layoutRef) {
  const [desktopPreviewPercent, setDesktopPreviewPercent] = useState(readDesktopPreviewPercent)
  const desktopLayoutStyle = useMemo(() => ({
    '--desktop-preview-width': `${desktopPreviewPercent}%`
  }), [desktopPreviewPercent])

  const updateDesktopPreviewPercent = useCallback((clientX) => {
    if (!Number.isFinite(clientX)) return

    const rect = layoutRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return

    const nextPercent = clamp(((rect.right - clientX) / rect.width) * 100, MIN_DESKTOP_PREVIEW_PERCENT, MAX_DESKTOP_PREVIEW_PERCENT)
    const roundedPercent = Math.round(nextPercent)
    setDesktopPreviewPercent(roundedPercent)
    writeDesktopPreviewPercent(roundedPercent)
  }, [layoutRef])

  const startDesktopResize = useCallback((event) => {
    if (event.button != null && event.button !== 0) return

    event.preventDefault()
    updateDesktopPreviewPercent(event.clientX)

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (moveEvent) => updateDesktopPreviewPercent(moveEvent.clientX)
    const stopResize = () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResize)
      window.removeEventListener('pointercancel', stopResize)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
  }, [updateDesktopPreviewPercent])

  return {
    desktopLayoutStyle,
    desktopPreviewPercent,
    startDesktopResize
  }
}
