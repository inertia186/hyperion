import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, CheckSquare, ChevronDown, ChevronUp, MessageSquare, MoreVertical, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { api } from '../api'
import { imageProxy } from '../format'
import { blacklistReasonText, previewExternalLinks, replyCommentsUrl } from '../previewPaneLinks'
import { renderPostBody } from '../renderPostBody'
import { usePreviewChainStats } from '../usePreviewChainStats'
import { useModalDismiss } from '../useModalDismiss'
import { usePreviewImageSources } from '../usePreviewImageSources'
import { usePreviewVoteActions } from '../usePreviewVoteActions'
import CategoryTagsControl from './CategoryTagsControl'
import HivesignerVoteModal from './HivesignerVoteModal'
import PostActionsDrawer from './PostActionsDrawer'
import PreviewSkeleton from './PreviewSkeleton'
import RevisionDiffModal from './RevisionDiffModal'

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
  const [diffModal, setDiffModal] = useState(null)
  const [postActionsOpen, setPostActionsOpen] = useState(false)
  const [previewTagsExpanded, setPreviewTagsExpanded] = useState(false)
  const {stats, refreshStatsAfterVote} = usePreviewChainStats({post, displayPost, previewReady, onChainStatsRefresh})
  const {
    votePanel,
    setVotePanel,
    voteWeight,
    setVoteWeight,
    voteBusy,
    hivesignerModal,
    closeHivesignerModal,
    castVote
  } = usePreviewVoteActions({displayPost, accountName, hivesignerAvailable, refreshStatsAfterVote})

  useEffect(() => {
    setPreviewTagsExpanded(false)
    setPostActionsOpen(false)
  }, [post?.id])

  usePreviewImageSources({previewReady, previewScrollRef, previewHtml, theme})

  useModalDismiss(!!hivesignerModal, () => closeHivesignerModal())
  useModalDismiss(postActionsOpen, () => setPostActionsOpen(false))

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
        <HivesignerVoteModal url={hivesignerModal.url} onClose={() => closeHivesignerModal()} />
      )}
      {diffModal && (
        <RevisionDiffModal
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
