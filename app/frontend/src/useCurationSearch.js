import { useCallback, useEffect, useRef, useState } from 'react'
import { initialQuery } from './constants'
import { filterInputQuery, keywordOnlyQuery, queryWithUpdates, resetFilterQuery } from './curationQuery'
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
  const [searchMode, setSearchMode] = useState('filters')
  const resetKeyRef = useRef(resetKey)

  const updateQuery = useCallback((updates) => {
    setQuery((current) => queryWithUpdates(current, updates))
  }, [])

  const applyLoadedQuery = useCallback((loadedQuery) => {
    setDraftTag(queryInputValue(loadedQuery))
    setDraftQuery(loadedQuery.query || '')
  }, [])

  const submitQuery = useCallback((event) => {
    event.preventDefault()
    if (searchMode === 'keyword') {
      updateQuery(keywordOnlyQuery(draftQuery))
      return
    }

    updateQuery(filterInputQuery(draftTag))
  }, [draftQuery, draftTag, searchMode, updateQuery])

  const resetQueryInput = useCallback(() => {
    setDraftTag('')
    setDraftQuery('')
    setSearchMode('filters')
    updateQuery(resetFilterQuery())
  }, [updateQuery])

  useEffect(() => {
    if (resetKeyRef.current === resetKey) return

    resetKeyRef.current = resetKey
    resetQueryInput()
  }, [resetKey, resetQueryInput])

  const searchKeywordsFromFilters = useCallback((keywordSearchSuggestion) => {
    if (!keywordSearchSuggestion) return

    setSearchMode('keyword')
    setDraftQuery(keywordSearchSuggestion)
    updateQuery(keywordOnlyQuery(keywordSearchSuggestion))
  }, [updateQuery])

  const searchKeywordSuggestion = useCallback((keywordDidYouMean) => {
    if (!keywordDidYouMean) return

    setSearchMode('keyword')
    setDraftQuery(keywordDidYouMean)
    updateQuery(keywordOnlyQuery(keywordDidYouMean))
  }, [updateQuery])

  const switchToFilters = useCallback(() => {
    setSearchMode('filters')
    setDraftQuery('')
  }, [])

  const focusTag = useCallback((tag) => {
    switchToFilters()
    updateQuery({tag, query: '', only_keyword: false})
    if (closePreviewOnFocus) onClosePreview?.()
    onCloseTags()
  }, [closePreviewOnFocus, onClosePreview, onCloseTags, switchToFilters, updateQuery])

  const focusAuthor = useCallback((author) => {
    switchToFilters()
    updateQuery({author, query: '', only_keyword: false})
    if (closePreviewOnFocus) onClosePreview?.()
    onCloseTags()
  }, [closePreviewOnFocus, onClosePreview, onCloseTags, switchToFilters, updateQuery])

  return {
    query,
    setQuery,
    draftTag,
    setDraftTag,
    draftQuery,
    setDraftQuery,
    searchMode,
    setSearchMode,
    applyLoadedQuery,
    updateQuery,
    submitQuery,
    resetQueryInput,
    searchKeywordsFromFilters,
    searchKeywordSuggestion,
    focusTag,
    focusAuthor
  }
}
