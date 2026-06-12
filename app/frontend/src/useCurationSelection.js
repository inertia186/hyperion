import { useCallback, useState } from 'react'
import {
  selectionAfterAllMatching,
  selectionAfterLoadedToggle,
  selectionAfterPostToggle
} from './curationInboxState'

export function useCurationSelection() {
  const [selectedId, setSelectedId] = useState(null)
  const [selectedPostIds, setSelectedPostIds] = useState(() => new Set())
  const [allMatchingSelected, setAllMatchingSelected] = useState(false)

  const applyLoadedSelection = useCallback((payload) => {
    setSelectedPostIds(new Set())
    setAllMatchingSelected(false)
    setSelectedId((current) => current && payload.posts.some((post) => post.id === current) ? current : payload.posts[0]?.id || null)
  }, [])

  const applyReadTransition = useCallback((transition) => {
    if (transition.clearPreview) {
      setSelectedId(null)
      return true
    }

    if (transition.selectedId !== null && transition.selectedId !== selectedId) setSelectedId(transition.selectedId)
    return false
  }, [selectedId])

  const removeSelectedPostId = useCallback((postId) => {
    setSelectedPostIds((current) => {
      const next = new Set(current)
      next.delete(postId)
      return next
    })
  }, [])

  const clearAllMatchingSelection = useCallback(() => {
    setAllMatchingSelected(false)
  }, [])

  const togglePostSelection = useCallback((postId, posts) => {
    const selection = selectionAfterPostToggle(postId, posts, selectedPostIds, allMatchingSelected)
    setAllMatchingSelected(selection.allMatchingSelected)
    setSelectedPostIds(selection.selectedPostIds)
  }, [allMatchingSelected, selectedPostIds])

  const toggleLoadedSelection = useCallback((posts, allLoadedSelected) => {
    const selection = selectionAfterLoadedToggle(posts, allLoadedSelected, allMatchingSelected)
    setAllMatchingSelected(selection.allMatchingSelected)
    setSelectedPostIds(selection.selectedPostIds)
  }, [allMatchingSelected])

  const selectAllMatching = useCallback((posts) => {
    const selection = selectionAfterAllMatching(posts)
    setSelectedPostIds(selection.selectedPostIds)
    setAllMatchingSelected(selection.allMatchingSelected)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedPostIds(new Set())
    setAllMatchingSelected(false)
  }, [])

  return {
    selectedId,
    setSelectedId,
    selectedPostIds,
    allMatchingSelected,
    applyLoadedSelection,
    applyReadTransition,
    removeSelectedPostId,
    clearAllMatchingSelection,
    togglePostSelection,
    toggleLoadedSelection,
    selectAllMatching,
    clearSelection
  }
}
