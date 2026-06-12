import { describe, expect, test } from 'vitest'
import {
  postReadTransition,
  selectedIdsAfterPostRead,
  selectedLoadedPostIds,
  selectedReadTransition
} from './curationReadState'

function payload(posts) {
  return {
    posts,
    counts: {read_posts: 2},
    mode_counts: {unread: posts.length, read: 2},
    pagination: {total_count: posts.length, total_pages: 1, limit: 30}
  }
}

describe('curation read state helpers', () => {
  test('removes a selected id after a post is marked read', () => {
    expect(selectedIdsAfterPostRead(new Set([1, 2, 3]), 2)).toEqual(new Set([1, 3]))
    expect(selectedLoadedPostIds([{id: 1}, {id: 2}, {id: 3}], new Set([2, 4]))).toEqual([2])
  })

  test('marks one unread post read and removes it from the normal unread list', () => {
    const current = payload([{id: 1, read: false}, {id: 2, read: false}, {id: 3, read: false}])
    const transition = postReadTransition(current, {
      post: current.posts[1],
      result: {read: true},
      query: {},
      direction: 1
    })

    expect(transition.payload.posts).toEqual([{id: 1, read: false}, {id: 3, read: false}])
    expect(transition.payload.counts.read_posts).toBe(3)
    expect(transition.payload.pagination.total_count).toBe(2)
    expect(transition.selectedId).toBe(3)
    expect(transition.clearPreview).toBe(false)
  })

  test('keeps marked posts in read and keyword modes', () => {
    const current = payload([{id: 1, read: false}, {id: 2, read: false}])
    const transition = postReadTransition(current, {
      post: current.posts[0],
      result: {read: true},
      query: {only_keyword: true},
      direction: 1
    })

    expect(transition.payload.posts).toEqual([{id: 1, read: true}, {id: 2, read: false}])
    expect(transition.selectedId).toBe(2)
    expect(transition.clearPreview).toBe(false)
  })

  test('clears preview when the last unread post is removed', () => {
    const current = payload([{id: 1, read: false}])
    const transition = postReadTransition(current, {
      post: current.posts[0],
      result: {read: true},
      query: {},
      direction: 1
    })

    expect(transition.payload.posts).toEqual([])
    expect(transition.selectedId).toBeNull()
    expect(transition.clearPreview).toBe(true)
  })

  test('marks selected posts read and removes them from the normal unread list', () => {
    const current = payload([{id: 1, read: false}, {id: 2, read: false}, {id: 3, read: false}])
    const transition = selectedReadTransition(current, {
      postIds: [1, 2],
      allMatchingSelected: false,
      result: {marked_count: 2},
      query: {},
      selectedId: 2
    })

    expect(transition.payload.posts).toEqual([{id: 3, read: false}])
    expect(transition.payload.counts.read_posts).toBe(4)
    expect(transition.selectedId).toBe(3)
    expect(transition.clearPreview).toBe(false)
  })

  test('uses marked count for all matching read actions', () => {
    const current = payload([{id: 1, read: false}, {id: 2, read: false}])
    const transition = selectedReadTransition(current, {
      postIds: [1, 2],
      allMatchingSelected: true,
      result: {marked_count: 5},
      query: {},
      selectedId: 1
    })

    expect(transition.payload.posts).toEqual([])
    expect(transition.payload.counts.read_posts).toBe(7)
    expect(transition.payload.pagination.total_count).toBe(0)
    expect(transition.selectedId).toBeNull()
    expect(transition.clearPreview).toBe(true)
  })
})
