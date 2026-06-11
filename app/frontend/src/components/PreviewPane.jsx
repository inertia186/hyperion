import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, CheckSquare, ChevronDown, ChevronUp, ExternalLink, FileDiff, MessageSquare, MoreVertical, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { api } from '../api'
import { imageProxy } from '../format'
import { renderPostBody } from '../renderPostBody'
import { closeOnBackdropClick, useModalDismiss } from '../useModalDismiss'
import CategoryTagsControl from './CategoryTagsControl'

const emptyStats = {status: 'idle', votes: null, replies: null, payout: null, currentVote: null}
const loadingStats = {status: 'loading', votes: null, replies: null, payout: null, currentVote: null}
const voteRefreshDelays = [2500, 7000, 15000]

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
  onSelectTag,
  onSelectAuthor,
  onChainStatsRefresh,
  theme = 'light',
  readBusy,
  hasPrevious,
  hasNext
}) {
  const detail = previewState.postId === post?.id ? previewState.detail : null
  const urls = detail?.urls || {}
  const previewReady = !!post && previewState.status === 'ready' && previewState.postId === post.id
  const blacklistReasons = detail?.blacklist_reasons || post?.blacklist_reasons || []
  const displayPost = useMemo(() => {
    if (!post || !detail?.display_post) return post

    return {...post, ...detail.display_post, id: post.id, tags: post.tags}
  }, [detail?.display_post, post])
  const externalLinks = useMemo(() => previewExternalLinks(urls, displayPost).filter((link) => link.href), [displayPost, urls])
  const commentsUrl = useMemo(() => replyCommentsUrl(urls, displayPost), [displayPost, urls])
  const previewHtml = useMemo(() => {
    if (!detail?.body_markdown) return previewState.html

    try {
      return renderPostBody(detail.body_markdown, displayPost)
    } catch (_error) {
      return previewState.html
    }
  }, [detail?.body_markdown, displayPost, previewState.html])
  const previewHtmlMarkup = useMemo(() => ({__html: previewHtml}), [previewHtml])
  const [stats, setStats] = useState(emptyStats)
  const [votePanel, setVotePanel] = useState(null)
  const [voteWeight, setVoteWeight] = useState(100)
  const [voteBusy, setVoteBusy] = useState(false)
  const [hivesignerModal, setHivesignerModal] = useState(null)
  const [diffModal, setDiffModal] = useState(null)
  const [postActionsOpen, setPostActionsOpen] = useState(false)
  const [previewTagsExpanded, setPreviewTagsExpanded] = useState(false)
  const voteRefreshRef = useRef({id: 0, timeoutId: null})

  useEffect(() => {
    setPreviewTagsExpanded(false)
    setPostActionsOpen(false)
  }, [post?.id])

  useEffect(() => {
    setStats(post ? loadingStats : emptyStats)
    voteRefreshRef.current.id += 1
    window.clearTimeout(voteRefreshRef.current.timeoutId)

    return () => {
      voteRefreshRef.current.id += 1
      window.clearTimeout(voteRefreshRef.current.timeoutId)
    }
  }, [post?.id])

  useEffect(() => {
    if (!displayPost) return undefined
    if (!previewReady) return undefined

    let active = true

    api.postChainStats(displayPost.id, {author: displayPost.author, permlink: displayPost.permlink})
      .then((payload) => {
        if (!active) return
        setStats({
          status: payload.status || 'ready',
          votes: payload.votes ?? null,
          replies: payload.replies ?? null,
          payout: payload.payout ?? null,
          currentVote: payload.current_vote ?? null
        })
        if (payload.status === 'ready') onChainStatsRefresh?.(post.id, payload)
      })
      .catch(() => {
        if (active) setStats({status: 'unavailable', votes: null, replies: null, payout: null, currentVote: null})
      })

    return () => {
      active = false
    }
  }, [accountName, displayPost?.id, displayPost?.author, displayPost?.permlink, onChainStatsRefresh, post?.id, previewReady])

  const refreshStatsAfterVote = ({expectedVote = null} = {}) => {
    if (!displayPost) return

    const targetPost = displayPost
    const refreshId = voteRefreshRef.current.id + 1
    voteRefreshRef.current.id = refreshId
    window.clearTimeout(voteRefreshRef.current.timeoutId)
    setStats((current) => ({...current, status: 'loading'}))

    const scheduleRefresh = (attempt) => {
      voteRefreshRef.current.timeoutId = window.setTimeout(() => {
        if (voteRefreshRef.current.id !== refreshId) return

        api.postChainStats(targetPost.id, {author: targetPost.author, permlink: targetPost.permlink, refresh: true})
          .then((payload) => {
            if (voteRefreshRef.current.id !== refreshId) return
            if (payload.status !== 'ready') return
            setStats((current) => ({
              ...current,
              status: 'ready',
              votes: payload.votes ?? current.votes,
              replies: payload.replies ?? current.replies,
              payout: payload.payout ?? current.payout,
              currentVote: payload.current_vote ?? current.currentVote
            }))

            const observedVote = payload.current_vote == null ? null : Number(payload.current_vote)
            if (expectedVote != null && observedVote !== expectedVote && attempt + 1 < voteRefreshDelays.length) {
              scheduleRefresh(attempt + 1)
            } else {
              onChainStatsRefresh?.(post.id, payload, {refreshVotingPower: true})
            }
          })
          .catch(() => {
            if (voteRefreshRef.current.id === refreshId && attempt + 1 < voteRefreshDelays.length) {
              scheduleRefresh(attempt + 1)
            }
          })
      }, voteRefreshDelays[attempt])
    }

    scheduleRefresh(0)
  }

  const closeHivesignerModal = ({refresh = true} = {}) => {
    setHivesignerModal(null)
    setVoteBusy(false)
    if (refresh) refreshStatsAfterVote()
  }

  useModalDismiss(!!hivesignerModal, () => closeHivesignerModal())
  useModalDismiss(postActionsOpen, () => setPostActionsOpen(false))

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
      window.hive_keychain.requestVote(accountName, displayPost.permlink, displayPost.author, weight, (response) => {
        setVotePanel(null)
        setVoteBusy(false)
        if (response?.success !== false) refreshStatsAfterVote({expectedVote: weight})
      })
      return
    }

    setVoteBusy(false)
    window.alert('Hive Keychain is not available.')
  }

  const openDiffModal = () => {
    if (!post) return

    setDiffModal({status: 'loading', payload: null, error: null, selectedIndex: null})
    api.postRevisions(post.id)
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
  }

  if (!post) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center px-4 text-center text-sm text-slate-500">
        Select a post.
      </div>
    )
  }

  return (
    <div className={`flex h-full min-h-[420px] flex-col ${previewActive ? 'ring-2 ring-blue-500 ring-inset' : ''}`} data-testid="preview-pane">
      <div className="border-b border-slate-200 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-xs disabled:opacity-50" type="button" onClick={onPrevious} disabled={!hasPrevious} aria-label="Previous"><ArrowUp size={14} /></button>
          <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-xs disabled:opacity-50" type="button" onClick={onNext} disabled={!hasNext} aria-label="Next"><ArrowDown size={14} /></button>
          <button className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs disabled:opacity-50" type="button" onClick={onMarkReadNext} disabled={readBusy}>
            <CheckSquare size={14} /> Mark read + next
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
              type="button"
              onClick={() => setPostActionsOpen(true)}
              aria-label="Open post actions"
              aria-haspopup="dialog"
            >
              <MoreVertical size={14} />
            </button>
            {onClose && (
              <button className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" type="button" onClick={onClose} aria-label="Close preview">
                <X size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-start gap-3">
          <img className="h-10 w-10 rounded-full" src={imageProxy(`https://images.hive.blog/u/${displayPost.author}/avatar`, '0x80')} alt="" />
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold leading-snug text-slate-900">{displayPost.title}</h1>
            <div className="mt-1 flex flex-wrap items-start gap-1 text-xs text-slate-500">
              <button className="font-medium text-slate-700 hover:text-blue-700 hover:underline" type="button" onClick={() => onSelectAuthor(displayPost.author)} aria-label={`Focus author @${displayPost.author}`}>@{displayPost.author}</button>
              <span className="pt-1">in</span>
              <CategoryTagsControl
                post={displayPost}
                expanded={previewTagsExpanded}
                onToggle={() => setPreviewTagsExpanded((expanded) => !expanded)}
                onSelectTag={onSelectTag}
                className="inline-flex min-w-[9rem] max-w-full flex-col align-middle"
                buttonClassName="inline-flex max-w-full items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                menuClassName="mt-1 flex max-w-full flex-wrap gap-1"
                testId={`preview-tags-${displayPost.id}`}
                label={`preview ${displayPost.title}`}
              />
              <span className="pt-1">using {displayPost.app}</span>
            </div>
          </div>
        </div>
        {post.blacklisted && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 shrink-0" size={14} />
            <span>{blacklistReasonText(blacklistReasons)}</span>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <button className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 disabled:opacity-50 ${stats.currentVote > 0 ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300'}`} type="button" onClick={() => setVotePanel(votePanel === 'up' ? null : 'up')} disabled={voteBusy}>
            <ThumbsUp size={14} /> Votes: {stats.votes ?? '...'} {votePanel === 'up' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <button className={`inline-flex h-8 w-12 items-center justify-center gap-1 rounded-md border disabled:opacity-50 ${stats.currentVote < 0 ? 'border-red-300 bg-red-50 text-red-800' : 'border-slate-300'}`} type="button" onClick={() => setVotePanel(votePanel === 'down' ? null : 'down')} disabled={voteBusy} aria-label="Downvote">
            <ThumbsDown size={14} /> {votePanel === 'down' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <a className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2 text-slate-700 hover:bg-slate-50 hover:text-blue-700" href={commentsUrl} target="_blank" rel="noopener noreferrer">
            <MessageSquare size={14} /> Replies: {stats.replies ?? '...'}
          </a>
          <span className="inline-flex h-8 items-center rounded-md border border-slate-300 px-2">{stats.payout || '...'}</span>
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
      </div>
      <div ref={previewScrollRef} className="safe-area-bottom touch-scroll min-h-0 flex-1 overflow-auto p-4" tabIndex={-1}>
        {previewReady ? (
          <article className="post-body text-sm" dangerouslySetInnerHTML={previewHtmlMarkup} />
        ) : previewState.status === 'error' && previewState.postId === post.id ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Preview failed to load.</div>
        ) : (
          <PreviewSkeleton />
        )}
      </div>
      {hivesignerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true" aria-label="Hivesigner vote" onClick={closeOnBackdropClick(() => closeHivesignerModal())}>
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
      {diffModal && (
        <DiffModal
          modal={diffModal}
          onClose={() => setDiffModal(null)}
          onSelectPair={(selectedIndex) => setDiffModal((current) => ({...current, selectedIndex}))}
        />
      )}
      {postActionsOpen && (
        <PostActionsDrawer
          links={externalLinks}
          onClose={() => setPostActionsOpen(false)}
          onOpenDiff={openDiffModal}
        />
      )}
    </div>
  )
}

function blacklistReasonText(reasons) {
  const accounts = [...new Set((reasons || []).map((reason) => reason?.name || reason?.account).filter(Boolean))]
  if (accounts.length === 0) return 'Blacklisted: author appears on a Hive blacklist.'

  return `Blacklisted: author appears on ${accounts.join(', ')}.`
}

function previewExternalLinks(urls, displayPost) {
  const builtInLinks = [
    {key: 'hive_blog', href: urls.hive_blog, label: 'hive.blog'},
    {key: 'peakd', href: urls.peakd, label: 'peakd'},
    {key: 'hiveblocks', href: urls.hiveblocks, label: 'hiveblocks'},
    {key: 'hive_db', href: urls.hive_db, label: 'hivehub.dev'}
  ]
  const builtInHosts = new Set(builtInLinks.map((link) => normalizedHost(link.href)).filter(Boolean))
  const canonicalHref = urls.canonical || displayPost?.canonical_url
  const canonicalHost = normalizedHost(canonicalHref)
  const canonicalLink = canonicalHref && canonicalHost && !builtInHosts.has(canonicalHost) ? [{key: 'canonical', href: canonicalHref, label: canonicalHost}] : []

  return [...canonicalLink, ...builtInLinks]
}

function replyCommentsUrl(urls, displayPost) {
  const baseUrl = urls.hive_blog || (displayPost ? `https://hive.blog/${displayPost.category}/@${displayPost.author}/${displayPost.permlink}` : '')
  if (!baseUrl) return '#comments'

  return `${baseUrl.split('#')[0]}#comments`
}

function normalizedHost(href) {
  try {
    return new URL(href).host.toLowerCase().replace(/^www\./, '')
  } catch (_error) {
    return null
  }
}

function PostActionsDrawer({links, onClose, onOpenDiff}) {
  const openDiff = () => {
    onClose()
    onOpenDiff()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Post actions" onClick={closeOnBackdropClick(onClose)}>
      <div className="safe-area-bottom w-full max-w-sm overflow-hidden rounded-t-lg border border-slate-200 bg-white shadow-xl sm:rounded-lg">
        <div className="flex min-h-12 items-center gap-3 border-b border-slate-200 px-3">
          <div className="min-w-0 flex-1 text-sm font-semibold text-slate-900">Post actions</div>
          <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" type="button" onClick={onClose} aria-label="Close post actions">
            <X size={15} />
          </button>
        </div>
        <div className="grid gap-1 p-2">
          {links.length > 0 && <div className="px-3 pb-1 pt-1 text-xs font-semibold uppercase text-slate-400">Open in</div>}
          {links.map((link) => (
            <a
              key={link.key}
              className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-700"
              href={link.href}
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
            >
              <ExternalLink className="shrink-0" size={16} />
              <span className="min-w-0 flex-1 truncate">{link.label}</span>
            </a>
          ))}
          <div className="mt-1 border-t border-slate-100 pt-1">
            <button
              className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-700"
              type="button"
              onClick={openDiff}
            >
              <FileDiff className="shrink-0" size={16} />
              <span className="min-w-0 flex-1 truncate">Diff</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DiffModal({modal, onClose, onSelectPair}) {
  useModalDismiss(true, onClose)
  const revisions = modal.payload?.revisions || []
  const pairCount = Math.max(revisions.length - 1, 0)
  const selectedIndex = Math.min(modal.selectedIndex ?? Math.max(pairCount - 1, 0), Math.max(pairCount - 1, 0))
  const previousRevision = pairCount > 0 ? revisions[selectedIndex] : null
  const currentRevision = pairCount > 0 ? revisions[selectedIndex + 1] : revisions[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true" aria-label="Revision diff" onClick={closeOnBackdropClick(onClose)}>
      <div className="flex h-[min(860px,calc(100vh-24px))] w-[min(1120px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex min-h-12 items-center gap-3 border-b border-slate-200 px-3">
          <div className="min-w-0 flex-1 text-sm font-semibold text-slate-900">Revision diff</div>
          {pairCount > 1 && (
            <select
              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700"
              aria-label="Revision pair"
              value={selectedIndex}
              onChange={(event) => onSelectPair(Number(event.target.value))}
            >
              {Array.from({length: pairCount}, (_item, index) => (
                <option key={index} value={index}>{revisions[index].label} {'->'} {revisions[index + 1].label}</option>
              ))}
            </select>
          )}
          <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" type="button" onClick={onClose} aria-label="Close revision diff">
            <X size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-50 p-3">
          {modal.status === 'loading' ? (
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">Loading revisions...</div>
          ) : modal.status === 'error' ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{modal.error || 'Diff failed to load.'}</div>
          ) : revisions.length === 0 ? (
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">No revisions were found for this post.</div>
          ) : revisions.length === 1 ? (
            <CodeRevision revision={currentRevision} />
          ) : (
            <CodeDiff previousRevision={previousRevision} currentRevision={currentRevision} />
          )}
        </div>
      </div>
    </div>
  )
}

function CodeRevision({revision}) {
  if (!revision) return null

  return (
    <section className="flex min-h-[360px] flex-col overflow-hidden rounded-md border border-slate-800 bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-900 px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Only revision</div>
        <div className="mt-0.5 text-sm font-medium text-slate-100">{revision.label}</div>
        <div className="mt-0.5 text-xs text-slate-400">{revisionDetail(revision)}</div>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs leading-relaxed">{revision.body || ''}</pre>
    </section>
  )
}

function CodeDiff({previousRevision, currentRevision}) {
  const lines = lineDiff(previousRevision?.body || '', currentRevision?.body || '')

  return (
    <section className="flex min-h-[520px] flex-col overflow-hidden rounded-md border border-slate-800 bg-slate-950 text-slate-100">
      <div className="grid border-b border-slate-800 bg-slate-900 text-xs text-slate-300 sm:grid-cols-2">
        <div className="border-b border-slate-800 px-3 py-2 sm:border-b-0 sm:border-r">
          <div className="font-semibold">{previousRevision?.label || 'Before'}</div>
          <div className="mt-0.5 text-slate-400">{revisionDetail(previousRevision || {})}</div>
        </div>
        <div className="px-3 py-2">
          <div className="font-semibold">{currentRevision?.label || 'After'}</div>
          <div className="mt-0.5 text-slate-400">{revisionDetail(currentRevision || {})}</div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto font-mono text-xs leading-relaxed">
        {lines.map((line, index) => (
          <div key={`${index}-${line.type}`} className={`grid grid-cols-[3rem_1fr] px-2 ${lineClassName(line.type)}`}>
            <span className="select-none pr-3 text-right text-slate-500">{line.number || ''}</span>
            <code className="whitespace-pre-wrap break-words">{line.prefix}{line.text}</code>
          </div>
        ))}
      </div>
    </section>
  )
}

function lineClassName(type) {
  if (type === 'added') return 'bg-emerald-950/70 text-emerald-100'
  if (type === 'removed') return 'bg-red-950/70 text-red-100'

  return 'text-slate-200'
}

function lineDiff(before, after) {
  const beforeLines = before.split(/\r?\n/)
  const afterLines = after.split(/\r?\n/)
  const table = Array.from({length: beforeLines.length + 1}, () => Array(afterLines.length + 1).fill(0))

  for (let i = beforeLines.length - 1; i >= 0; i -= 1) {
    for (let j = afterLines.length - 1; j >= 0; j -= 1) {
      table[i][j] = beforeLines[i] === afterLines[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }

  const diff = []
  let i = 0
  let j = 0
  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      diff.push({type: 'same', prefix: ' ', text: beforeLines[i], number: j + 1})
      i += 1
      j += 1
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      diff.push({type: 'removed', prefix: '-', text: beforeLines[i], number: i + 1})
      i += 1
    } else {
      diff.push({type: 'added', prefix: '+', text: afterLines[j], number: j + 1})
      j += 1
    }
  }

  while (i < beforeLines.length) {
    diff.push({type: 'removed', prefix: '-', text: beforeLines[i], number: i + 1})
    i += 1
  }

  while (j < afterLines.length) {
    diff.push({type: 'added', prefix: '+', text: afterLines[j], number: j + 1})
    j += 1
  }

  return diff
}

function revisionDetail(revision) {
  const parts = [revision.published_at, revision.block_num ? `block ${revision.block_num}` : null].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'No chain metadata'
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
