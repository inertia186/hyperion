import { useCallback, useState } from 'react'

export function hivesignerVoteUrl({accountName, author, permlink, weight}) {
  return `https://hivesigner.com/sign/vote?authority=post&voter=${encodeURIComponent(accountName)}&author=${encodeURIComponent(author)}&permlink=${encodeURIComponent(permlink)}&weight=${weight}`
}

export function usePreviewVoteActions({
  displayPost,
  accountName,
  hivesignerAvailable,
  refreshStatsAfterVote,
  requestVote,
  alertUser = (message) => window.alert(message)
}) {
  const [votePanel, setVotePanel] = useState(null)
  const [voteWeight, setVoteWeight] = useState(100)
  const [voteBusy, setVoteBusy] = useState(false)
  const [hivesignerModal, setHivesignerModal] = useState(null)

  const closeHivesignerModal = useCallback(({refresh = true} = {}) => {
    setHivesignerModal(null)
    setVoteBusy(false)
    if (refresh) refreshStatsAfterVote()
  }, [refreshStatsAfterVote])

  const castVote = useCallback((direction) => {
    if (!displayPost || !accountName) return

    const weight = voteWeight * 100 * direction
    const keychainRequestVote = requestVote || (window.hive_keychain?.requestVote ? (...args) => window.hive_keychain.requestVote(...args) : null)
    setVoteBusy(true)

    if (hivesignerAvailable) {
      setHivesignerModal({
        url: hivesignerVoteUrl({accountName, author: displayPost.author, permlink: displayPost.permlink, weight})
      })
      setVotePanel(null)
      return
    }

    if (keychainRequestVote) {
      keychainRequestVote(accountName, displayPost.permlink, displayPost.author, weight, (response) => {
        setVotePanel(null)
        setVoteBusy(false)
        if (response?.success !== false) refreshStatsAfterVote({expectedVote: weight})
      })
      return
    }

    setVoteBusy(false)
    alertUser('Hive Keychain is not available.')
  }, [accountName, alertUser, displayPost, hivesignerAvailable, refreshStatsAfterVote, requestVote, voteWeight])

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
