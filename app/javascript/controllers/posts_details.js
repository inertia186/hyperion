export function refreshVoteCount({hiveApi, voteCount, author, permlink, currentAccountName, logger = console}) {
  hiveApi.getActiveVotes(author, permlink, function(err, response) {
    if (err) logger.log(voteCount, err)

    if (response) {
      let upvotes = 0

      response.forEach((vote) => {
        const voteCast = vote.voter === currentAccountName
        if (voteCast) voteCount.classList.remove('badge-secondary')

        if (vote.percent > 0) {
          upvotes += 1
          if (voteCast) voteCount.classList.add('badge-success')
        }

        if (vote.percent < 0 && voteCast) voteCount.classList.add('badge-danger')
      })

      voteCount.textContent = `Votes: ${upvotes}`
    }
  })
}

export function refreshReplyCount({hiveApi, replyCount, author, permlink, logger = console}) {
  replyCount.innerHTML = '<span class="spinner-grow spinner-grow-sm align-middle" style="height: 1px; width: 100%" /><span style="opacity: 0;">Replies: 0</span>'

  hiveApi.getContentReplies(author, permlink, function(err, response) {
    if (err) logger.log(replyCount, err)
    if (response) replyCount.textContent = `Replies: ${response.length}`
  })
}

export function refreshPendingPayout({hiveApi, pendingPayout, author, permlink, logger = console}) {
  hiveApi.getContent(author, permlink, function(err, response) {
    if (err) logger.log(pendingPayout, err)
    if (response) pendingPayout.textContent = pendingPayoutValue(response)
  })
}

function pendingPayoutValue(response) {
  if (response.cashout_time === '1969-12-31T23:59:59') return response.total_payout_value

  return response.pending_payout_value
}
