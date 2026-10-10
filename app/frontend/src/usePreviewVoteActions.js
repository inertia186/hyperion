import { useCallback, useEffect, useRef, useState } from 'react'
import { wallet } from '../../javascript/wallet'
export { hivesignerVoteUrl } from '../../javascript/wallet'

export function usePreviewVoteActions({
  displayPost,
  accountName,
  walletProvider,
  refreshStatsAfterVote,
  vote = wallet.vote,
  alertUser = (message) => window.alert(message)
}) {
  const [votePanel, setVotePanel] = useState(null)
  const [voteWeight, setVoteWeight] = useState(100)
  const [voteBusy, setVoteBusy] = useState(false)
  const [hivesignerModal, setHivesignerModal] = useState(null)
  const activeRequest = useRef(0)
  const busy = useRef(false)

  useEffect(() => {
    activeRequest.current += 1
    busy.current = false
    setVoteBusy(false)
    setHivesignerModal(null)
    return () => { activeRequest.current += 1 }
  }, [accountName, walletProvider, displayPost?.author, displayPost?.permlink])

  const closeHivesignerModal = useCallback(({refresh = true} = {}) => {
    setHivesignerModal(null)
    setVoteBusy(false)
    if (refresh) refreshStatsAfterVote()
  }, [refreshStatsAfterVote])

  const castVote = useCallback(async (direction) => {
    if (!displayPost || !accountName || busy.current || hivesignerModal) return

    const weight = voteWeight * 100 * direction
    const requestId = ++activeRequest.current
    busy.current = true
    setVoteBusy(true)
    try {
      const result = await vote({accountName, provider: walletProvider, author: displayPost.author, permlink: displayPost.permlink, weight})
      if (activeRequest.current !== requestId) return
      setVotePanel(null)
      if (result.status === 'approval_required') setHivesignerModal({url: result.url})
      else if (result.status === 'submitted') refreshStatsAfterVote({expectedVote: weight})
    } catch (error) {
      if (activeRequest.current === requestId) alertUser(error.message || 'The wallet did not approve the vote.')
    } finally {
      if (activeRequest.current === requestId) {
        busy.current = false
        setVoteBusy(false)
      }
    }
  }, [accountName, alertUser, displayPost, walletProvider, refreshStatsAfterVote, vote, voteWeight, hivesignerModal])

  return {
    votePanel,
    setVotePanel,
    voteWeight,
    setVoteWeight,
    voteBusy,
    hivesignerModal,
    closeHivesignerModal,
    castVote
  }
}
