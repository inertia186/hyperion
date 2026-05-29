import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, CheckSquare, ChevronDown, ChevronUp, ExternalLink, MessageSquare, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { tagLabel } from '../format'
import CommunityLabel from './CommunityLabel'

export default function PreviewPane({
  post,
  previewState,
  previewActive,
  previewScrollRef,
  accountName,
  hivesignerAvailable,
  onClose,
  onPrevious,
  onNext,
  onMarkReadNext,
  onFocusPreview,
  onFocusList,
  onSelectTag,
  onSelectAuthor,
  readBusy,
  hasPrevious,
  hasNext
}) {
  const detail = previewState.postId === post?.id ? previewState.detail : null
  const urls = detail?.urls || {}
  const sandboxUrl = detail?.content_sandbox_url
  const previewReady = !!post && previewState.status === 'ready' && previewState.postId === post.id
  const blacklistReasons = detail?.blacklist_reasons || post?.blacklist_reasons || []
  const displayPost = useMemo(() => {
    if (!post || !detail?.display_post) return post

    return {...post, ...detail.display_post, id: post.id, tags: post.tags}
  }, [detail?.display_post, post])
  const [stats, setStats] = useState({status: 'idle', votes: null, replies: null, payout: null, currentVote: null})
  const [votePanel, setVotePanel] = useState(null)
  const [voteWeight, setVoteWeight] = useState(100)
  const [voteBusy, setVoteBusy] = useState(false)
  const [hivesignerModal, setHivesignerModal] = useState(null)

  useEffect(() => {
    if (!displayPost) return

    let cancelled = false
    setStats({status: 'loading', votes: null, replies: null, payout: null, currentVote: null})

    const hiveApi = window.hive?.api

    if (!hiveApi) {
      setStats({status: 'unavailable', votes: null, replies: null, payout: null, currentVote: null})
      return
    }

    const nextStats = {status: 'ready', votes: null, replies: null, payout: null, currentVote: null}
    const publish = () => {
      if (!cancelled) setStats({...nextStats})
    }

    hiveApi.getActiveVotes(displayPost.author, displayPost.permlink, (err, response) => {
      if (cancelled) return
      if (!err && response) {
        nextStats.votes = response.filter((vote) => vote.percent > 0).length
        nextStats.currentVote = response.find((vote) => vote.voter === accountName)?.percent || null
      }
      publish()
    })

    hiveApi.getContentReplies(displayPost.author, displayPost.permlink, (err, response) => {
      if (cancelled) return
      if (!err && response) nextStats.replies = response.length
      publish()
    })

    hiveApi.getContent(displayPost.author, displayPost.permlink, (err, response) => {
      if (cancelled) return
      if (!err && response) {
        nextStats.payout = response.cashout_time === '1969-12-31T23:59:59' ? response.total_payout_value : response.pending_payout_value
      }
      publish()
    })

    return () => {
      cancelled = true
    }
  }, [accountName, displayPost])

  const refreshStatsAfterVote = () => {
    setStats((current) => ({...current, status: 'loading'}))

    window.setTimeout(() => {
      if (!displayPost || !window.hive?.api) return

      window.hive.api.getActiveVotes(displayPost.author, displayPost.permlink, (err, response) => {
        if (err || !response) return
        setStats((current) => ({
          ...current,
          status: 'ready',
          votes: response.filter((vote) => vote.percent > 0).length,
          currentVote: response.find((vote) => vote.voter === accountName)?.percent || null
        }))
      })

      window.hive.api.getContent(displayPost.author, displayPost.permlink, (err, response) => {
        if (err || !response) return
        setStats((current) => ({
          ...current,
          status: 'ready',
          payout: response.cashout_time === '1969-12-31T23:59:59' ? response.total_payout_value : response.pending_payout_value
        }))
      })
    }, 3000)
  }

  const closeHivesignerModal = ({refresh = true} = {}) => {
    setHivesignerModal(null)
    setVoteBusy(false)
    if (refresh) refreshStatsAfterVote()
  }

  const castVote = (direction) => {
    if (!displayPost || !accountName) return

    const weight = voteWeight * 100 * direction
    setVoteBusy(true)

    if (hivesignerAvailable) {
      setHivesignerModal({
        url: `https://hivesigner.com/sign/vote?authority=post&voter=${encodeURIComponent(accountName)}&author=${encodeURIComponent(displayPost.author)}&permlink=${encodeURIComponent(displayPost.permlink)}&weight=${weight}`
      })
      setVotePanel(null)
      return
    }

    if (window.hive_keychain?.requestVote) {
      window.hive_keychain.requestVote(accountName, displayPost.permlink, displayPost.author, weight, () => {
        setVotePanel(null)
        setVoteBusy(false)
        refreshStatsAfterVote()
      })
      return
    }

    setVoteBusy(false)
    window.alert('Hive Keychain is not available.')
  }

  if (!post) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center px-4 text-center text-sm text-slate-500">
        Select a post.
      </div>
    )
  }

  return (
    <div className={`flex h-full min-h-[420px] flex-col ${previewActive ? 'ring-2 ring-blue-500 ring-inset' : ''}`}>
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-start gap-3">
          <img className="h-10 w-10 rounded-full" src={`https://images.hive.blog/u/${displayPost.author}/avatar`} alt="" />
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold leading-snug text-slate-900">{displayPost.title}</h1>
            <div className="mt-1 text-xs text-slate-500">
              <button className="font-medium text-slate-700 hover:text-blue-700 hover:underline" type="button" onClick={() => onSelectAuthor(displayPost.author)} aria-label={`Focus author @${displayPost.author}`}>@{displayPost.author}</button>
              {' '}in <CommunityLabel name={displayPost.category_name} imageUrl={displayPost.category_image_url} className="align-middle" /> using {displayPost.app}
            </div>
            {post.tags?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {post.tags.slice(0, 8).map(({tag, name, image_url}) => (
                  <button key={tag} className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50" type="button" onClick={() => onSelectTag(tag)} aria-label={`Focus tag ${tag}`}>
                    <CommunityLabel name={tagLabel(tag, displayPost, name)} imageUrl={image_url} />
                  </button>
                ))}
              </div>
            )}
          </div>
          {onClose && (
            <button className="ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" type="button" onClick={onClose} aria-label="Close preview">
              <X size={16} />
            </button>
          )}
        </div>
        {post.blacklisted && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 shrink-0" size={14} />
            <span>{blacklistReasonText(blacklistReasons)}</span>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs disabled:opacity-50" type="button" onClick={onPrevious} disabled={!hasPrevious}><ArrowUp size={14} /> Previous</button>
          <button className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs disabled:opacity-50" type="button" onClick={onNext} disabled={!hasNext}>Next <ArrowDown size={14} /></button>
          <button className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs disabled:opacity-50" type="button" onClick={onMarkReadNext} disabled={readBusy}>
            <CheckSquare size={14} /> Mark read + next
          </button>
          <button className="inline-flex h-8 items-center rounded-md border border-slate-300 px-2 text-xs" type="button" onClick={previewActive ? onFocusList : onFocusPreview}>
            {previewActive ? 'List focus' : 'Preview focus'}
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <ExternalLinkButton href={urls.canonical || displayPost.canonical_url} label="Canonical" />
            <ExternalLinkButton href={urls.hive_blog} label="hive.blog" />
            <ExternalLinkButton href={urls.peakd} label="peakd" />
            <ExternalLinkButton href={urls.hiveblocks} label="hiveblocks" />
            <ExternalLinkButton href={urls.hive_db} label="hive-db" />
            <ExternalLinkButton href={urls.scribe} label="scribe" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <button className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 disabled:opacity-50 ${stats.currentVote > 0 ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300'}`} type="button" onClick={() => setVotePanel(votePanel === 'up' ? null : 'up')} disabled={voteBusy}>
            <ThumbsUp size={14} /> Votes: {stats.votes ?? '...'} {votePanel === 'up' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <button className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 disabled:opacity-50 ${stats.currentVote < 0 ? 'border-red-300 bg-red-50 text-red-800' : 'border-slate-300'}`} type="button" onClick={() => setVotePanel(votePanel === 'down' ? null : 'down')} disabled={voteBusy}>
            <ThumbsDown size={14} /> Downvote {votePanel === 'down' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <span className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2"><MessageSquare size={14} /> Replies: {stats.replies ?? '...'}</span>
          <span className="inline-flex h-8 items-center rounded-md border border-slate-300 px-2">{stats.payout || '00.000 HBD'}</span>
        </div>
        {votePanel && (
          <div className="mt-3 flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
            <input className="min-w-0 flex-1" type="range" min="0" max="100" value={voteWeight} onChange={(event) => setVoteWeight(Number(event.target.value))} />
            <span className={votePanel === 'up' ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>{votePanel === 'up' ? voteWeight : -voteWeight} %</span>
            <button className={`inline-flex h-8 items-center rounded-md px-3 font-medium text-white disabled:opacity-50 ${votePanel === 'up' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`} type="button" onClick={() => castVote(votePanel === 'up' ? 1 : -1)} disabled={voteBusy}>
              Vote
            </button>
          </div>
        )}
        <div className="mt-2 text-[11px] text-slate-500">? shortcuts · j/k move · Enter preview · Esc list · &gt; mark read + next · Space scroll</div>
      </div>
      <div ref={previewScrollRef} className={`touch-scroll min-h-0 flex-1 overflow-auto ${previewReady && sandboxUrl ? 'p-0.5' : 'safe-area-bottom p-4'}`} tabIndex={-1}>
        {previewReady && sandboxUrl ? (
          <iframe
            key={`${post.id}-${sandboxUrl}`}
            className="block h-full min-h-[360px] w-full border-0 bg-white"
            data-preview-frame="true"
            loading="eager"
            sandbox="allow-same-origin allow-scripts allow-popups"
            src={sandboxUrl}
            title={`Rendered post: ${displayPost.title}`}
          />
        ) : previewReady ? (
          <article className="post-body text-sm" dangerouslySetInnerHTML={{__html: previewState.html}} />
        ) : previewState.status === 'error' && previewState.postId === post.id ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Preview failed to load.</div>
        ) : (
          <PreviewSkeleton />
        )}
      </div>
      {hivesignerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true" aria-label="Hivesigner vote">
          <div className="flex h-[min(760px,calc(100vh-24px))] w-[min(520px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex min-h-12 items-center gap-3 border-b border-slate-200 px-3">
              <div className="min-w-0 flex-1 text-sm font-semibold text-slate-900">Hivesigner vote</div>
              <a className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs text-slate-700 hover:bg-slate-50" href={hivesignerModal.url} target="_blank" rel="noreferrer">
                <ExternalLink size={13} /> Open
              </a>
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" type="button" onClick={() => closeHivesignerModal()} aria-label="Close Hivesigner vote">
                <X size={15} />
              </button>
            </div>
            <iframe className="min-h-0 flex-1 border-0" title="Hivesigner vote" src={hivesignerModal.url} />
          </div>
        </div>
      )}
    </div>
  )
}

function blacklistReasonText(reasons) {
  const communities = [...new Set((reasons || []).map((reason) => reason?.name || reason?.community).filter(Boolean))]
  if (communities.length === 0) return 'Blacklisted: author is muted by a trusted community.'

  return `Blacklisted: author is muted by ${communities.join(', ')}.`
}

function ExternalLinkButton({href, label}) {
  if (!href) return null

  return (
    <a className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline" href={href} target="_blank" rel="noreferrer">
      <ExternalLink size={12} /> {label}
    </a>
  )
}

function PreviewSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading preview">
      <div className="h-4 w-4/5 rounded bg-slate-200" />
      <div className="h-4 w-full rounded bg-slate-100" />
      <div className="h-4 w-11/12 rounded bg-slate-100" />
      <div className="h-4 w-2/3 rounded bg-slate-100" />
      <div className="mt-6 h-40 rounded bg-slate-100" />
    </div>
  )
}
