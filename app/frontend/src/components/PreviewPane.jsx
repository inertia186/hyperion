import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, CheckSquare, ChevronDown, ChevronUp, ExternalLink, FileDiff, MessageSquare, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { api } from '../api'
import { closeOnBackdropClick, useModalDismiss } from '../useModalDismiss'
import CategoryTagsControl from './CategoryTagsControl'

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
  theme = 'light',
  readBusy,
  hasPrevious,
  hasNext
}) {
  const detail = previewState.postId === post?.id ? previewState.detail : null
  const urls = detail?.urls || {}
  const sandboxUrl = detail?.content_sandbox_url
  const themedSandboxUrl = sandboxUrl ? sandboxUrlWithTheme(sandboxUrl, theme) : null
  const [sandboxLoaded, setSandboxLoaded] = useState(false)
  const previewReady = !!post && previewState.status === 'ready' && previewState.postId === post.id
  const blacklistReasons = detail?.blacklist_reasons || post?.blacklist_reasons || []
  const displayPost = useMemo(() => {
    if (!post || !detail?.display_post) return post

    return {...post, ...detail.display_post, id: post.id, tags: post.tags}
  }, [detail?.display_post, post])
  const externalLinks = useMemo(() => previewExternalLinks(urls, displayPost), [displayPost, urls])
  const [stats, setStats] = useState({status: 'idle', votes: null, replies: null, payout: null, currentVote: null})
  const [votePanel, setVotePanel] = useState(null)
  const [voteWeight, setVoteWeight] = useState(100)
  const [voteBusy, setVoteBusy] = useState(false)
  const [hivesignerModal, setHivesignerModal] = useState(null)
  const [diffModal, setDiffModal] = useState(null)
  const [previewTagsExpanded, setPreviewTagsExpanded] = useState(false)

  useEffect(() => {
    setPreviewTagsExpanded(false)
  }, [post?.id])

  useEffect(() => {
    setSandboxLoaded(false)
  }, [themedSandboxUrl])

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

  useModalDismiss(!!hivesignerModal, () => closeHivesignerModal())

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
    <div className={`flex h-full min-h-[420px] flex-col ${previewActive ? 'ring-2 ring-blue-500 ring-inset' : ''}`}>
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-start gap-3">
          <img className="h-10 w-10 rounded-full" src={`https://images.hive.blog/u/${displayPost.author}/avatar`} alt="" />
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
            {externalLinks.map((link) => (
              <ExternalLinkButton key={link.key} href={link.href} label={link.label} />
            ))}
            <button className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline" type="button" onClick={openDiffModal}>
              <FileDiff size={12} /> Diff
            </button>
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
      <div ref={previewScrollRef} className={`touch-scroll min-h-0 flex-1 overflow-auto ${previewReady && sandboxUrl ? 'bg-white p-0.5 dark:bg-slate-900' : 'safe-area-bottom p-4'}`} tabIndex={-1}>
        {previewReady && themedSandboxUrl ? (
          <div className="relative h-full min-h-[360px]">
            {!sandboxLoaded && <SandboxLoadingPlaceholder theme={theme} />}
            <iframe
              key={`${post.id}-${themedSandboxUrl}`}
              className={`block h-full min-h-[360px] w-full border-0 bg-white dark:bg-slate-900 ${sandboxLoaded ? 'opacity-100' : 'opacity-0'}`}
              style={{colorScheme: theme === 'dark' ? 'dark' : 'light'}}
              data-preview-frame="true"
              loading="eager"
              onLoad={() => setSandboxLoaded(true)}
              sandbox="allow-same-origin allow-scripts allow-popups"
              src={themedSandboxUrl}
              title={`Rendered post: ${displayPost.title}`}
            />
          </div>
        ) : previewReady ? (
          <article className="post-body text-sm" dangerouslySetInnerHTML={{__html: previewState.html}} />
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
    </div>
  )
}

function SandboxLoadingPlaceholder({theme}) {
  const dark = theme === 'dark'

  return (
    <div className={`absolute inset-0 flex min-h-[360px] items-center justify-center px-4 text-center text-sm ${dark ? 'bg-slate-900 text-slate-400' : 'bg-white text-slate-500'}`}>
      <div className="w-full max-w-xl space-y-3" aria-label="Loading rendered post">
        <div className={`mx-auto h-4 w-40 rounded ${dark ? 'bg-slate-700' : 'bg-slate-200'}`} />
        <div className={`h-3 w-full rounded ${dark ? 'bg-slate-800' : 'bg-slate-100'}`} />
        <div className={`h-3 w-11/12 rounded ${dark ? 'bg-slate-800' : 'bg-slate-100'}`} />
        <div className={`h-3 w-3/4 rounded ${dark ? 'bg-slate-800' : 'bg-slate-100'}`} />
        <div className="pt-2">Loading rendered post...</div>
      </div>
    </div>
  )
}

function sandboxUrlWithTheme(url, theme) {
  const [path, query = ''] = url.split('?')
  const params = new URLSearchParams(query)
  params.set('theme', theme === 'dark' ? 'dark' : 'light')
  return `${path}?${params.toString()}`
}

function blacklistReasonText(reasons) {
  const communities = [...new Set((reasons || []).map((reason) => reason?.name || reason?.community).filter(Boolean))]
  if (communities.length === 0) return 'Blacklisted: author is muted by a trusted community.'

  return `Blacklisted: author is muted by ${communities.join(', ')}.`
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

function normalizedHost(href) {
  try {
    return new URL(href).host.toLowerCase().replace(/^www\./, '')
  } catch (_error) {
    return null
  }
}

function ExternalLinkButton({href, label}) {
  if (!href) return null

  return (
    <a className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline" href={href} target="_blank" rel="noreferrer">
      <ExternalLink size={12} /> {label}
    </a>
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
