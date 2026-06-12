import { useEffect, useRef } from 'react'

export function useInfiniteLoadMore({hasMorePosts, loading, loadingMore, onLoadMore}) {
  const loadMoreRef = useRef(null)

  useEffect(() => {
    if (!hasMorePosts || loading || loadingMore || typeof IntersectionObserver === 'undefined') return undefined

    const target = loadMoreRef.current
    if (!target) return undefined

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onLoadMore()
    }, {rootMargin: '600px 0px'})

    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMorePosts, loading, loadingMore, onLoadMore])

  return loadMoreRef
}
