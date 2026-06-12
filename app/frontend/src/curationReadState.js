import { adjustReadCounts, selectionAfterPostRemoval, selectionAfterPostsRemoval } from './curationInboxState'

export function selectedIdsAfterPostRead(currentSelectedIds, postId) {
  const next = new Set(currentSelectedIds)
  next.delete(postId)
  return next
}

export function selectedLoadedPostIds(posts, selectedPostIds) {
  return posts.map((post) => post.id).filter((postId) => selectedPostIds.has(postId))
}

export function postReadTransition(payload, {post, result, query, direction}) {
  const markedPosts = payload.posts.map((item) => item.id === post.id ? {...item, read: result.read} : item)
  const nextPayload = adjustReadCounts(payload, query, post.read ? 0 : 1)

  if (query.only_read || query.only_keyword) {
    const currentIndex = payload.posts.findIndex((item) => item.id === post.id)
    const nextIndex = direction > 0 ? Math.min(currentIndex + 1, payload.posts.length - 1) : Math.max(currentIndex - 1, 0)

    return {
      payload: {...nextPayload, posts: markedPosts},
      selectedId: payload.posts[nextIndex]?.id || null,
      clearPreview: false
    }
  }

  const selection = selectionAfterPostRemoval(post.id, direction, markedPosts)
  return {
    payload: {...nextPayload, posts: selection.posts},
    selectedId: selection.selectedId,
    clearPreview: selection.cleared
  }
}

export function selectedReadTransition(payload, {postIds, allMatchingSelected, result, query, selectedId}) {
  const markedPostIds = allMatchingSelected ? payload.posts.map((post) => post.id) : postIds
  const markedPostIdSet = new Set(markedPostIds)
  const markedPosts = payload.posts.map((post) => markedPostIdSet.has(post.id) ? {...post, read: true} : post)
  const readDelta = allMatchingSelected ? result.marked_count ?? markedPostIds.length : markedPostIds.length
  const nextPayload = adjustReadCounts(payload, query, readDelta)

  if (query.only_read || query.only_keyword) {
    return {
      payload: {...nextPayload, posts: markedPosts},
      selectedId,
      clearPreview: false
    }
  }

  const selection = selectionAfterPostsRemoval(markedPostIds, selectedId, markedPosts)
  return {
    payload: {...nextPayload, posts: selection.posts},
    selectedId: selection.selectedId,
    clearPreview: selection.cleared
  }
}
