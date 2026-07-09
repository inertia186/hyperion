import { describe, expect, test } from 'vitest'
import { filterInputQuery, keywordOnlyQuery, queryWithUpdates, resetFilterQuery, signalQuery } from './curationQuery'

describe('curation query helpers', () => {
  test('applies updates and resets pagination unless a page is provided', () => {
    expect(queryWithUpdates({tag: 'hive', page: '4', only_read: true}, {author: 'alice'})).toEqual({
      tag: 'hive',
      page: '1',
      only_read: true,
      author: 'alice'
    })

    expect(queryWithUpdates({tag: 'hive', page: '4'}, {page: '2'})).toEqual({
      tag: 'hive',
      page: '2'
    })
  })

  test('builds keyword-only queries', () => {
    expect(keywordOnlyQuery('  hive curation  ')).toEqual({
      tag: '',
      author: '',
      signal: '',
      query: 'hive curation',
      only_keyword: true,
      only_read: false,
      only_ignored: false,
      only_deleted: false,
      only_blacklisted: false
    })
  })

  test('builds filter queries from tag and author input', () => {
    expect(filterInputQuery('hive curation @alice')).toEqual({
      tag: 'hive curation',
      author: 'alice',
      signal: '',
      query: '',
      only_keyword: false
    })
  })

  test('builds reset filter query updates', () => {
    expect(resetFilterQuery()).toEqual({tag: '', query: '', author: '', signal: '', only_keyword: false})
  })

  test('builds signal queries with matching default sort', () => {
    expect(signalQuery('high_tag_utilization')).toEqual({
      tag: '',
      author: '',
      query: '',
      signal: 'high_tag_utilization',
      sort: 'most_tags',
      only_keyword: false,
      only_read: false,
      only_ignored: false,
      only_deleted: false,
      only_blacklisted: false
    })
  })
})
