import { useCallback, useRef } from 'react'
import { api } from './api'
import { postReadTransition, selectedLoadedPostIds, selectedReadTransition } from './curationReadState'

export function useCurationReadActions({
  posts,
  selectedPost,
  selectedPostIds,
  allMatchingSelected,
  query,
  selectedId,
  applyReadTransition,
  clearAllMatchingSelection,
  clearSelection,
  handleError,
  removeSelectedPostId,
  setBusy,
  setPostsPayload,
  apiClient = api
}) {
  const selectedPostRef = useRef(null)
  selectedPostRef.current = selectedPost

  const markPostReadAndMove = useCallback(async (post, direction = 1) => {
    if (!post) return

    setBusy(true)
    try {
      const result = await apiClient.markRead(post.id)
      clearAllMatchingSelection()
      removeSelectedPostId(post.id)
      setPostsPayload((payload) => {
        const transition = postReadTransition(payload, {post, result, query, direction})
        applyReadTransition(transition)
        return transition.payload
      })
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }, [apiClient, applyReadTransition, clearAllMatchingSelection, handleError, query, removeSelectedPostId, setBusy, setPostsPayload])

  const markSelectedRead = useCallback(async () => {
    const postIds = selectedLoadedPostIds(posts, selectedPostIds)
    if (!postIds.length && !allMatchingSelected) return

    setBusy(true)
    try {
      const result = await apiClient.markManyRead(allMatchingSelected ? {all_matching: true, query} : postIds)
      clearSelection()
      setPostsPayload((payload) => {
        const transition = selectedReadTransition(payload, {postIds, allMatchingSelected, result, query, selectedId})
        applyReadTransition(transition)
        return transition.payload
      })
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }, [allMatchingSelected, apiClient, applyReadTransition, clearSelection, handleError, posts, query, selectedId, selectedPostIds, setBusy, setPostsPayload])

  const markSelectedReadAndMove = useCallback((direction) => {
    markPostReadAndMove(selectedPostRef.current, direction)
  }, [markPostReadAndMove])

  const markSelectedReadAndMoveNext = useCallback(() => {
    markPostReadAndMove(selectedPostRef.current, 1)
  }, [markPostReadAndMove])

  return {
    markPostReadAndMove,
    markSelectedRead,
    markSelectedReadAndMove,
    markSelectedReadAndMoveNext
  }
}
