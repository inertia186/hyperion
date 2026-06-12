import { useCallback } from 'react'
import { api } from './api'

export function applyTagPreferencePayload(current, payload) {
  if (!current) return current

  return {
    ...current,
    ignored_tags: payload.ignored_tags,
    poisoned_pill_tags: payload.poisoned_pill_tags,
    favorite_tags: payload.favorite_tags,
    past_tags: payload.past_tags
  }
}

export function useCurationPreferences({
  postsPayload,
  activeTag,
  activeTagIgnored,
  favoriteTags,
  poisonedPillTags,
  setPostsPayload,
  setQuery,
  setBusy,
  handleError,
  apiClient = api,
  confirm = (message) => window.confirm(message)
}) {
  const runWithBusy = useCallback(async (operation) => {
    setBusy(true)
    try {
      await operation()
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }, [handleError, setBusy])

  const toggleMute = useCallback(async () => {
    if (!postsPayload) return

    const enabled = !postsPayload.query.muted_authors_enabled
    await runWithBusy(async () => {
      const payload = await apiClient.setMute(enabled)
      setPostsPayload((current) => current ? {...current, query: {...current.query, muted_authors_enabled: payload.muted_authors_enabled}} : current)
      setQuery((current) => ({...current}))
    })
  }, [apiClient, postsPayload, runWithBusy, setPostsPayload, setQuery])

  const toggleOnlyFavorites = useCallback(async () => {
    if (!postsPayload) return

    const enabled = !postsPayload.query.only_favorite_tags
    await runWithBusy(async () => {
      const payload = await apiClient.setOnlyFavoriteTags(enabled)
      setPostsPayload((current) => current ? {...current, query: {...current.query, only_favorite_tags: payload.only_favorite_tags}} : current)
      setQuery((current) => ({...current}))
    })
  }, [apiClient, postsPayload, runWithBusy, setPostsPayload, setQuery])

  const toggleIgnoredTag = useCallback(async () => {
    if (!activeTag) return

    await runWithBusy(async () => {
      const payload = activeTagIgnored ? await apiClient.unignoreTag(activeTag) : await apiClient.ignoreTag(activeTag)
      setPostsPayload((current) => applyTagPreferencePayload(current, payload))
    })
  }, [activeTag, activeTagIgnored, apiClient, runWithBusy, setPostsPayload])

  const toggleFavorite = useCallback(async (tag) => {
    await runWithBusy(async () => {
      const payload = favoriteTags.includes(tag) ? await apiClient.unfavoriteTag(tag) : await apiClient.favoriteTag(tag)
      setPostsPayload((current) => applyTagPreferencePayload(current, payload))
    })
  }, [apiClient, favoriteTags, runWithBusy, setPostsPayload])

  const togglePoisonedPill = useCallback(async (tag) => {
    await runWithBusy(async () => {
      const payload = poisonedPillTags.includes(tag) ? await apiClient.unpoisonTag(tag) : await apiClient.poisonTag(tag)
      setPostsPayload((current) => applyTagPreferencePayload(current, payload))
    })
  }, [apiClient, poisonedPillTags, runWithBusy, setPostsPayload])

  const removePastTag = useCallback(async (tag) => {
    await runWithBusy(async () => {
      const payload = await apiClient.removePastTag(tag)
      setPostsPayload((current) => applyTagPreferencePayload(current, payload))
    })
  }, [apiClient, runWithBusy, setPostsPayload])

  const clearPastTags = useCallback(async (onlyIgnored = false) => {
    if (!confirm('Clear these past tags?')) return

    await runWithBusy(async () => {
      const payload = onlyIgnored ? await apiClient.clearIgnoredPastTags() : await apiClient.clearPastTags()
      setPostsPayload((current) => applyTagPreferencePayload(current, payload))
    })
  }, [apiClient, confirm, runWithBusy, setPostsPayload])

  const clearIgnoredTags = useCallback(async () => {
    if (!confirm('Clear all ignored tags?')) return

    await runWithBusy(async () => {
      const payload = await apiClient.clearIgnoredTags()
      setPostsPayload((current) => applyTagPreferencePayload(current, payload))
    })
  }, [apiClient, confirm, runWithBusy, setPostsPayload])

  return {
    toggleMute,
    toggleOnlyFavorites,
    toggleIgnoredTag,
    toggleFavorite,
    togglePoisonedPill,
    removePastTag,
    clearPastTags,
    clearIgnoredTags
  }
}
