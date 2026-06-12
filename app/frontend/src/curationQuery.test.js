import { describe, expect, test } from 'vitest'
import { filterInputQuery, keywordOnlyQuery, queryWithUpdates, resetFilterQuery } from './curationQuery'

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
      query: '',
      only_keyword: false
    })
  })

  test('builds reset filter query updates', () => {
    expect(resetFilterQuery()).toEqual({tag: '', query: '', author: '', only_keyword: false})
  })
})
