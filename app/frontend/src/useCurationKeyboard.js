import { useEffect } from 'react'

const isEditableTarget = (target) => {
  if (!target) return false
  if (target.isContentEditable) return true

  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
}

export function useCurationKeyboard({
  enabled,
  hasPosts,
  previewActive,
  setPreviewActive,
  togglePreview,
  closePreview,
  moveSelection,
  markSelectedReadAndMove,
  scrollPreview,
  shortcutsVisible,
  setShortcutsVisible
}) {
  useEffect(() => {
    if (!enabled) return undefined

    const handleKeyDown = (event) => {
      if (isEditableTarget(event.target)) return

      if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
        event.preventDefault()
        setShortcutsVisible((current) => !current)
        return
      }

      if (shortcutsVisible && event.key === 'Escape') {
        event.preventDefault()
        setShortcutsVisible(false)
        return
      }

      if (!hasPosts) return

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        moveSelection(1)
        return
      }

      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        moveSelection(-1)
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        if (togglePreview) {
          togglePreview()
        } else {
          setPreviewActive((current) => !current)
        }
        return
      }

      if (event.key === 'Escape' && previewActive) {
        event.preventDefault()
        if (closePreview) {
          closePreview()
        } else {
          setPreviewActive(false)
        }
        return
      }

      if (previewActive && (event.key === 'l' || event.key === 'ArrowRight')) {
        event.preventDefault()
        moveSelection(1)
        return
      }

      if (previewActive && (event.key === 'h' || event.key === 'ArrowLeft')) {
        event.preventDefault()
        moveSelection(-1)
        return
      }

      if (event.key === '>') {
        event.preventDefault()
        markSelectedReadAndMove(1)
        return
      }

      if (event.key === '<') {
        event.preventDefault()
        markSelectedReadAndMove(-1)
        return
      }

      if (previewActive && ((event.key === ' ' && event.shiftKey) || event.key === 'PageUp')) {
        event.preventDefault()
        scrollPreview(-1)
        return
      }

      if (previewActive && (event.key === ' ' || event.key === 'PageDown')) {
        event.preventDefault()
        scrollPreview(1)
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    enabled,
    hasPosts,
    previewActive,
    setPreviewActive,
    togglePreview,
    closePreview,
    moveSelection,
    markSelectedReadAndMove,
    scrollPreview,
    shortcutsVisible,
    setShortcutsVisible
  ])
}
