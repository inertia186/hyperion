import { useCallback, useState } from 'react'
import { api } from './api'

export function useRevisionDiffModal({postRevisionsApi = api.postRevisions} = {}) {
  const [diffModal, setDiffModal] = useState(null)

  const openDiffModal = useCallback((post) => {
    if (!post) return

    setDiffModal({status: 'loading', payload: null, error: null, selectedIndex: null})
    postRevisionsApi(post.id)
      .then((payload) => setDiffModal({
        status: 'ready',
        payload,
        error: null,
        selectedIndex: Math.max((payload.revisions || []).length - 2, 0)
      }))
      .catch((error) => setDiffModal({
        status: 'error',
        payload: null,
        error: error.message || 'Diff failed to load.',
        selectedIndex: null
      }))
  }, [postRevisionsApi])

  const closeDiffModal = useCallback(() => setDiffModal(null), [])
  const selectDiffPair = useCallback((selectedIndex) => setDiffModal((current) => ({...current, selectedIndex})), [])

  return {diffModal, openDiffModal, closeDiffModal, selectDiffPair}
}
