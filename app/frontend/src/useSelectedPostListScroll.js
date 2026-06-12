import { useEffect, useRef } from 'react'

export function useSelectedPostListScroll(selectedId) {
  const listScrollRef = useRef(null)

  useEffect(() => {
    if (!selectedId) return

    const row = listScrollRef.current?.querySelector('[data-selected="true"]')
    row?.scrollIntoView?.({block: 'center'})
  }, [selectedId])

  return listScrollRef
}
