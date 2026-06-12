import { render } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { useInfiniteLoadMore } from './useInfiniteLoadMore'

function installIntersectionObserverMock() {
  const observers = []

  class MockIntersectionObserver {
    constructor(callback, options = {}) {
      this.callback = callback
      this.options = options
      this.targets = new Set()
      this.disconnect = vi.fn(() => this.targets.clear())
      observers.push(this)
    }

    observe(target) {
      this.targets.add(target)
    }
  }

  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: MockIntersectionObserver
  })
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: MockIntersectionObserver
  })

  return observers
}

function LoadMoreSentinel({hasMorePosts = true, loading = false, loadingMore = false, onLoadMore}) {
  const loadMoreRef = useInfiniteLoadMore({hasMorePosts, loading, loadingMore, onLoadMore})

  return <div data-testid="sentinel" ref={loadMoreRef} />
}

afterEach(() => {
  delete globalThis.IntersectionObserver
  delete window.IntersectionObserver
})

describe('useInfiniteLoadMore', () => {
  test('observes the sentinel and loads more when it intersects', () => {
    const observers = installIntersectionObserverMock()
    const onLoadMore = vi.fn()
    const {getByTestId} = render(<LoadMoreSentinel onLoadMore={onLoadMore} />)
    const sentinel = getByTestId('sentinel')

    expect(observers).toHaveLength(1)
    expect(observers[0].options).toEqual({rootMargin: '600px 0px'})
    expect(observers[0].targets.has(sentinel)).toBe(true)

    observers[0].callback([{target: sentinel, isIntersecting: false}])
    expect(onLoadMore).not.toHaveBeenCalled()

    observers[0].callback([{target: sentinel, isIntersecting: true}])
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  test('does not observe while loading or when there are no more posts', () => {
    const observers = installIntersectionObserverMock()
    const onLoadMore = vi.fn()
    const {rerender} = render(<LoadMoreSentinel loading onLoadMore={onLoadMore} />)

    expect(observers).toHaveLength(0)

    rerender(<LoadMoreSentinel hasMorePosts={false} onLoadMore={onLoadMore} />)
    expect(observers).toHaveLength(0)
  })

  test('disconnects the observer on cleanup', () => {
    const observers = installIntersectionObserverMock()
    const onLoadMore = vi.fn()
    const {unmount} = render(<LoadMoreSentinel onLoadMore={onLoadMore} />)

    unmount()

    expect(observers[0].disconnect).toHaveBeenCalled()
    expect(observers[0].targets.size).toBe(0)
  })
})
