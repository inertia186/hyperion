export function curationHasMorePosts(pagination) {
  return !!pagination && pagination.page < pagination.total_pages
}

export function appendCurationPage(currentPayload, pagePayload) {
  if (!currentPayload) return pagePayload

  const seenIds = new Set(currentPayload.posts.map((post) => post.id))
  const nextPosts = pagePayload.posts.filter((post) => !seenIds.has(post.id))

  return {
    ...pagePayload,
    posts: [...currentPayload.posts, ...nextPosts]
  }
}

