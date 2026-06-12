import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { queryParams } from './format'
import { appendCurationPage, curationHasMorePosts } from './curationPagination'

function redirectToLogin(error) {
  if (error.status === 401 && error.payload?.login_url) {
    window.location.assign(error.payload.login_url)
    return true
  }

  return false
}

export function useCurationPosts({query, refreshKey, onPostsLoaded, postsApi = api.posts}) {
  const [postsPayload, setPostsPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [loadMoreError, setLoadMoreError] = useState(null)

  const hasMorePosts = curationHasMorePosts(postsPayload?.pagination)

  const handleLoadError = useCallback((err) => {
    if (redirectToLogin(err)) return

    setError(err.message || 'Request failed')
    setLoading(false)
  }, [])

  const loadPosts = useCallback((nextQuery) => {
    setLoading(true)
    setError(null)
    setLoadMoreError(null)

    postsApi(queryParams(nextQuery))
      .then((payload) => {
        setPostsPayload(payload)
        onPostsLoaded?.(payload)
      })
      .catch(handleLoadError)
      .finally(() => setLoading(false))
  }, [handleLoadError, onPostsLoaded, postsApi])

  useEffect(() => {
    loadPosts(query)
  }, [loadPosts, query, refreshKey])

  const loadMorePosts = useCallback(() => {
    if (!postsPayload || loading || loadingMore || !hasMorePosts) return

    const nextPage = String(postsPayload.pagination.page + 1)
    const nextQuery = {...query, page: nextPage}
    setLoadingMore(true)
    setLoadMoreError(null)

    postsApi(queryParams(nextQuery))
      .then((payload) => {
        setPostsPayload((current) => appendCurationPage(current, payload))
      })
      .catch((err) => {
        if (redirectToLogin(err)) return

        setLoadMoreError(err.message || 'Request failed')
      })
      .finally(() => setLoadingMore(false))
  }, [hasMorePosts, loading, loadingMore, postsApi, postsPayload, query])

  return {
    postsPayload,
    setPostsPayload,
    loading,
    loadingMore,
    error,
    loadMoreError,
    hasMorePosts,
    loadMorePosts,
    handleLoadError
  }
}

