import { act, renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { useCurationSearch } from './useCurationSearch'

describe('useCurationSearch', () => {
  test('submits filter and keyword queries from draft input state', () => {
    const preventDefault = vi.fn()
    const {result} = renderHook(() => useCurationSearch())

    act(() => result.current.setDraftTag('hive curation @alice'))
    act(() => result.current.submitQuery({preventDefault}))
    expect(preventDefault).toHaveBeenCalled()
    expect(result.current.query).toMatchObject({tag: 'hive curation', author: 'alice', only_keyword: false})

    act(() => result.current.setSearchMode('keyword'))
    act(() => result.current.setDraftQuery('reward curve'))
    act(() => result.current.submitQuery({preventDefault}))
    expect(result.current.query).toMatchObject({query: 'reward curve', only_keyword: true})
  })

  test('synchronizes loaded query drafts and resets when the reset key changes', () => {
    const {result, rerender} = renderHook(({resetKey}) => useCurationSearch({resetKey}), {initialProps: {resetKey: 0}})

    act(() => result.current.applyLoadedQuery({tag_pattern: 'hive', author: 'alice', query: 'ignored'}))
    expect(result.current.draftTag).toBe('hive @alice')
    expect(result.current.draftQuery).toBe('ignored')

    rerender({resetKey: 1})
    expect(result.current.draftTag).toBe('')
    expect(result.current.draftQuery).toBe('')
    expect(result.current.searchMode).toBe('filters')
    expect(result.current.query).toMatchObject({tag: '', author: '', query: '', only_keyword: false})
  })

  test('applies keyword suggestions', () => {
    const {result} = renderHook(() => useCurationSearch())

    act(() => result.current.searchKeywordsFromFilters('hive curation'))
    expect(result.current.searchMode).toBe('keyword')
    expect(result.current.draftQuery).toBe('hive curation')
    expect(result.current.query).toMatchObject({query: 'hive curation', only_keyword: true})

    act(() => result.current.searchKeywordSuggestion('hive curator'))
    expect(result.current.draftQuery).toBe('hive curator')
    expect(result.current.query).toMatchObject({query: 'hive curator', only_keyword: true})
  })

  test('focuses tag and author filters while closing related UI', () => {
    const onClosePreview = vi.fn()
    const onCloseTags = vi.fn()
    const {result} = renderHook(() => useCurationSearch({closePreviewOnFocus: true, onClosePreview, onCloseTags}))

    act(() => result.current.setSearchMode('keyword'))
    act(() => result.current.setDraftQuery('old keyword'))
    act(() => result.current.focusTag('hive'))
    expect(result.current.searchMode).toBe('filters')
    expect(result.current.draftQuery).toBe('')
    expect(result.current.query).toMatchObject({tag: 'hive', query: '', only_keyword: false})
    expect(onClosePreview).toHaveBeenCalledTimes(1)
    expect(onCloseTags).toHaveBeenCalledTimes(1)

    act(() => result.current.focusAuthor('alice'))
    expect(result.current.query).toMatchObject({author: 'alice', query: '', only_keyword: false})
    expect(onClosePreview).toHaveBeenCalledTimes(2)
    expect(onCloseTags).toHaveBeenCalledTimes(2)
  })
})
