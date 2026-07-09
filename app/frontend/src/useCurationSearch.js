import { useCallback, useEffect, useRef, useState } from 'react'
import { initialQuery } from './constants'
import { DEFAULT_SIGNAL, filterInputQuery, keywordOnlyQuery, queryWithUpdates, resetFilterQuery, signalDefaultSort, signalQuery } from './curationQuery'
import { queryInputValue } from './curationInboxState'

export function useCurationSearch({
  resetKey = 0,
  closePreviewOnFocus = false,
  onClosePreview,
  onCloseTags = () => {}
} = {}) {
  const [query, setQuery] = useState(initialQuery)
  const [draftTag, setDraftTag] = useState('')
  const [draftQuery, setDraftQuery] = useState('')
  const [searchMode, setSearchModeState] = useState('filters')
  const searchModeRef = useRef('filters')
  const draftTagRef = useRef('')
  const draftQueryRef = useRef('')
  const [modeQueries, setModeQueries] = useState({
    filters: initialQuery,
    keyword: keywordOnlyQuery(''),
    signals: signalQuery()
  })
  const resetKeyRef = useRef(resetKey)

  const setActiveSearchMode = useCallback((mode) => {
    searchModeRef.current = mode
    setSearchModeState(mode)
  }, [])

  const updateDraftTag = useCallback((value) => {
    draftTagRef.current = value
    setDraftTag(value)
  }, [])

  const updateDraftQuery = useCallback((value) => {
    draftQueryRef.current = value
    setDraftQuery(value)
  }, [])

  const updateQuery = useCallback((updates) => {
    setQuery((current) => {
      const nextQuery = queryWithUpdates(current, updates)
      setModeQueries((currentModeQueries) => ({...currentModeQueries, [searchMode]: nextQuery}))
      return nextQuery
    })
  }, [searchMode])

  const setSearchMode = useCallback((nextMode) => {
    if (nextMode === searchMode) return

    setModeQueries((currentModeQueries) => {
      const nextModeQueries = {...currentModeQueries, [searchMode]: query}
      if (nextMode !== 'keyword' || nextModeQueries.keyword.query) {
        setQuery(nextModeQueries[nextMode])
      }
      return nextModeQueries
    })
    setActiveSearchMode(nextMode)
  }, [query, searchMode, setActiveSearchMode])

  const applyLoadedQuery = useCallback((loadedQuery) => {
    updateDraftTag(queryInputValue(loadedQuery))
    updateDraftQuery(loadedQuery.query || '')
    setModeQueries((currentModeQueries) => ({...currentModeQueries, [searchModeRef.current]: loadedQuery}))
  }, [updateDraftQuery, updateDraftTag])

  const updateSignal = useCallback((signal) => {
    const selectedSignal = signal || DEFAULT_SIGNAL
    updateQuery({
      ...signalQuery(selectedSignal),
      sort: signalDefaultSort(selectedSignal)
    })
  }, [updateQuery])

  const submitQuery = useCallback((event) => {
    event.preventDefault()
    const activeMode = searchModeRef.current
    if (activeMode === 'keyword') {
      updateQuery(keywordOnlyQuery(draftQueryRef.current))
      return
    }

    if (activeMode === 'signals') {
      updateSignal(query.signal || DEFAULT_SIGNAL)
      return
    }

    updateQuery(filterInputQuery(draftTagRef.current))
  }, [query.signal, updateQuery, updateSignal])

  const resetQueryInput = useCallback(() => {
    if (searchMode === 'keyword') {
      updateDraftQuery('')
      updateQuery(keywordOnlyQuery(''))
      return
    }

    if (searchMode === 'signals') {
      updateSignal(DEFAULT_SIGNAL)
      return
    }

    updateDraftTag('')
    updateQuery(resetFilterQuery())
  }, [searchMode, updateDraftQuery, updateDraftTag, updateQuery, updateSignal])

  useEffect(() => {
    if (resetKeyRef.current === resetKey) return

    resetKeyRef.current = resetKey
    setActiveSearchMode('filters')
    setModeQueries({
      filters: initialQuery,
      keyword: keywordOnlyQuery(''),
      signals: signalQuery()
    })
    updateDraftTag('')
    updateDraftQuery('')
    setQuery(initialQuery)
  }, [resetKey, setActiveSearchMode, updateDraftQuery, updateDraftTag])

  const searchKeywordsFromFilters = useCallback((keywordSearchSuggestion) => {
    if (!keywordSearchSuggestion) return

    setActiveSearchMode('keyword')
    updateDraftQuery(keywordSearchSuggestion)
    const nextQuery = queryWithUpdates(modeQueries.keyword, keywordOnlyQuery(keywordSearchSuggestion))
    setModeQueries((currentModeQueries) => ({...currentModeQueries, [searchMode]: query, keyword: nextQuery}))
    setQuery(nextQuery)
  }, [modeQueries.keyword, query, searchMode, setActiveSearchMode, updateDraftQuery])

  const searchKeywordSuggestion = useCallback((keywordDidYouMean) => {
    if (!keywordDidYouMean) return

    setActiveSearchMode('keyword')
    updateDraftQuery(keywordDidYouMean)
    const nextQuery = queryWithUpdates(modeQueries.keyword, keywordOnlyQuery(keywordDidYouMean))
    setModeQueries((currentModeQueries) => ({...currentModeQueries, [searchMode]: query, keyword: nextQuery}))
    setQuery(nextQuery)
  }, [modeQueries.keyword, query, searchMode, setActiveSearchMode, updateDraftQuery])

  const focusTag = useCallback((tag) => {
    const nextQuery = queryWithUpdates(modeQueries.filters, {tag, signal: '', query: '', only_keyword: false})
    setModeQueries((currentModeQueries) => ({...currentModeQueries, [searchMode]: query, filters: nextQuery}))
    setActiveSearchMode('filters')
    updateDraftQuery('')
    setQuery(nextQuery)
    if (closePreviewOnFocus) onClosePreview?.()
    onCloseTags()
  }, [closePreviewOnFocus, modeQueries.filters, onClosePreview, onCloseTags, query, searchMode, setActiveSearchMode, updateDraftQuery])

  const focusAuthor = useCallback((author) => {
    const nextQuery = queryWithUpdates(modeQueries.filters, {author, signal: '', query: '', only_keyword: false})
    setModeQueries((currentModeQueries) => ({...currentModeQueries, [searchMode]: query, filters: nextQuery}))
    setActiveSearchMode('filters')
    updateDraftQuery('')
    setQuery(nextQuery)
    if (closePreviewOnFocus) onClosePreview?.()
    onCloseTags()
  }, [closePreviewOnFocus, modeQueries.filters, onClosePreview, onCloseTags, query, searchMode, setActiveSearchMode, updateDraftQuery])

  return {
    query,
    setQuery,
    draftTag,
    setDraftTag: updateDraftTag,
    draftQuery,
    setDraftQuery: updateDraftQuery,
    searchMode,
    setSearchMode,
    applyLoadedQuery,
    updateQuery,
    updateSignal,
    submitQuery,
    resetQueryInput,
    searchKeywordsFromFilters,
    searchKeywordSuggestion,
    focusTag,
    focusAuthor
  }
}
