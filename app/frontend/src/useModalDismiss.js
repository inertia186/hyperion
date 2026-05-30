import { useEffect } from 'react'

export function useModalDismiss(open, onClose) {
  useEffect(() => {
    if (!open) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])
}

export function closeOnBackdropClick(onClose) {
  return (event) => {
    if (event.target === event.currentTarget) onClose()
  }
}
