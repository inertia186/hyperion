import { describe, expect, test } from 'vitest'
import { appendCurationPage, curationHasMorePosts } from './curationPagination'

describe('curationPagination', () => {
  test('detects additional pages from pagination metadata', () => {
    expect(curationHasMorePosts(null)).toBe(false)
    expect(curationHasMorePosts({page: 1, total_pages: 2})).toBe(true)
    expect(curationHasMorePosts({page: 2, total_pages: 2})).toBe(false)
  })

  test('appends new posts while dropping duplicates from later pages', () => {
    const currentPayload = {
      mode: 'unread',
      pagination: {page: 1, total_pages: 2},
      posts: [{id: 1, title: 'First'}, {id: 2, title: 'Second'}]
    }
    const pagePayload = {
      mode: 'unread',
      pagination: {page: 2, total_pages: 2},
      posts: [{id: 2, title: 'Duplicate'}, {id: 3, title: 'Third'}]
    }

    expect(appendCurationPage(currentPayload, pagePayload)).toEqual({
      mode: 'unread',
      pagination: {page: 2, total_pages: 2},
      posts: [{id: 1, title: 'First'}, {id: 2, title: 'Second'}, {id: 3, title: 'Third'}]
    })
  })

  test('uses the page payload when no current payload exists', () => {
    const pagePayload = {posts: [{id: 1}], pagination: {page: 1, total_pages: 1}}

    expect(appendCurationPage(null, pagePayload)).toBe(pagePayload)
  })
})
