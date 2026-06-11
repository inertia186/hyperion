import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckSquare, Loader2, Square } from 'lucide-react'
import { api } from '../api'
import { imageProxy, relativeAge, tagLabel } from '../format'
import CategoryTagsControl from './CategoryTagsControl'
import CommunityLabel from './CommunityLabel'

export default function PostList({posts, selectedId, selectedPostIds, allMatchingSelected, ignoredTags, onSelect, onToggleSelected, onSelectTag, onSelectAuthor, onPayoutRefresh}) {
  const [expandedTagRows, setExpandedTagRows] = useState(() => new Set())

  useEffect(() => {
    setExpandedTagRows((current) => {
      const visibleIds = new Set(posts.map((post) => post.id))
      const next = new Set([...current].filter((id) => visibleIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [posts])

  const toggleTagRow = (postId) => {
    setExpandedTagRows((current) => {
      const next = new Set(current)
      if (next.has(postId)) {
        next.delete(postId)
      } else {
        next.add(postId)
      }
      return next
    })
  }

  return (
    <div className="divide-y divide-slate-100">
      {posts.map((post) => {
        const checked = allMatchingSelected || selectedPostIds.has(post.id)
        const tagsExpanded = expandedTagRows.has(post.id)

        return (
          <div key={post.id} data-post-list-row={post.id} data-selected={selectedId === post.id ? 'true' : undefined} className={`post-list-row grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-3 text-left text-sm hover:bg-slate-50 sm:gap-3 sm:px-3 md:grid-cols-[40px_82px_56px_minmax(180px,1fr)_minmax(112px,160px)_minmax(130px,190px)_82px] md:py-2 xl:grid-cols-[40px_92px_56px_minmax(220px,1fr)_170px_200px_90px] ${selectedId === post.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''}`}>
            <button className="flex h-10 w-10 items-center justify-center rounded text-blue-700 hover:bg-blue-100 md:h-auto md:w-auto md:p-1" type="button" onClick={() => onToggleSelected(post.id)} aria-label={`${checked ? 'Deselect' : 'Select'} ${post.title}`} aria-pressed={checked}>
              {checked ? <CheckSquare size={18} /> : <Square size={18} />}
            </button>
            <PostPayout post={post} onPayoutRefresh={onPayoutRefresh} />
            <PostThumbnail post={post} />
            <div className="min-w-0">
              <button className="block w-full overflow-hidden text-left font-medium leading-snug text-slate-900 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] md:truncate md:[display:block]" type="button" onClick={() => onSelect(post.id)}>
                {post.title}
              </button>
              <span className="post-row-mobile-meta mt-1 flex flex-wrap items-center gap-1 md:hidden">
                <button className={`rounded border px-1.5 py-0.5 text-[11px] hover:bg-slate-50 md:hidden ${post.muted_author ? 'border-slate-300 text-slate-400 line-through' : 'border-slate-200 text-slate-600'}`} type="button" onClick={() => onSelectAuthor(post.author)} aria-label={`Focus author @${post.author}`}>
                  @{post.author}
                </button>
                {post.tags.slice(0, 3).map(({tag, name, image_url}) => (
                  <button key={tag} className={`rounded border px-1.5 py-0.5 text-[11px] hover:bg-slate-50 ${ignoredTags.includes(tag) ? 'border-slate-300 text-slate-400 line-through' : 'border-slate-200 text-slate-600'}`} type="button" onClick={() => onSelectTag(tag)} aria-label={`Focus tag ${tag}`}>
                    <CommunityLabel name={tagLabel(tag, post, name)} imageUrl={image_url} />
                  </button>
                ))}
              </span>
            </div>
            <button className={`post-row-author hidden truncate text-left md:block ${post.muted_author ? 'text-slate-400 line-through' : 'text-slate-700'}`} type="button" onClick={() => onSelectAuthor(post.author)} aria-label={`Focus author @${post.author}`}>@{post.author}</button>
            <CategoryTagsControl
              post={post}
              ignoredTags={ignoredTags}
              expanded={tagsExpanded}
              onToggle={() => toggleTagRow(post.id)}
              onSelectTag={onSelectTag}
              className="post-row-tags hidden min-w-0 md:block"
              testId={`post-tags-${post.id}`}
            />
            <button className="whitespace-nowrap text-right text-xs text-slate-500" type="button" onClick={() => onSelect(post.id)}>{relativeAge(post.created_at)}</button>
          </div>
        )
      })}
    </div>
  )
}

function PostPayout({post, onPayoutRefresh}) {
  const payoutRef = useRef(null)
  const visible = useVisibleOnce(payoutRef)
  const [payout, setPayout] = useState(displayPayout(post))
  const payoutFresh = freshPayout(post.payout_fetched_at)
  const payoutUnavailable = Boolean(post.payout_unavailable_at)
  const payoutEstimated = post.payout_source === 'estimated'

  useEffect(() => {
    setPayout(displayPayout(post))
  }, [post.payout, post.payout_source])

  useEffect(() => {
    if (!visible) return undefined
    if (payoutUnavailable) {
      setPayout(displayPayout(post))
      return undefined
    }
    if (post.payout && payoutFresh && !payoutEstimated) {
      setPayout(displayPayout(post))
      return undefined
    }

    const abortController = new AbortController()
    if (!post.payout) setPayout({text: '...', estimated: false})

    api.postPayout(post.id, {}, {signal: abortController.signal})
      .then((payload) => {
        setPayout(displayPayout({...post, ...payload}))
        onPayoutRefresh?.(post.id, payload)
      })
      .catch(() => {
        if (!abortController.signal.aborted) setPayout(displayPayout(post))
      })

    return () => {
      abortController.abort()
    }
  }, [onPayoutRefresh, payoutEstimated, payoutFresh, payoutUnavailable, post.id, post.author, post.permlink, post.payout, post.payout_source, visible])

  return (
    <span ref={payoutRef} data-testid={`post-payout-${post.id}`} className="post-row-payout hidden h-7 min-w-0 items-center justify-center rounded bg-slate-100 px-2 text-center text-[11px] font-medium text-slate-600 md:inline-flex">
      {payout.estimated && <Loader2 className="mr-1 shrink-0 animate-spin text-slate-400" size={11} aria-label="Estimated payout" role="img" />}
      <span className="truncate">{payout.text}</span>
    </span>
  )
}

function displayPayout(post) {
  if (!post.payout) return {text: '...', estimated: false}

  return {text: post.payout, estimated: post.payout_source === 'estimated'}
}

function freshPayout(fetchedAt) {
  if (!fetchedAt) return false

  const fetchedTime = new Date(fetchedAt).getTime()
  if (!Number.isFinite(fetchedTime)) return false

  return Date.now() - fetchedTime < 60 * 60 * 1000
}

function PostThumbnail({post}) {
  const thumbnailRef = useRef(null)
  const visible = useVisibleOnce(thumbnailRef)
  const sources = useMemo(() => {
    const candidates = [
      {url: post.thumbnail_url},
      {url: post.author_avatar_url, size: '0x96'},
      {url: post.placeholder_image_url}
    ].filter(({url}) => url)
    const seenUrls = new Set()
    return candidates.filter(({url}) => {
      if (seenUrls.has(url)) return false

      seenUrls.add(url)
      return true
    })
  }, [post.author_avatar_url, post.placeholder_image_url, post.thumbnail_url])
  const [sourceIndex, setSourceIndex] = useState(0)

  useEffect(() => {
    setSourceIndex(0)
  }, [post.id, sources])

  const source = sources[sourceIndex] || {url: post.placeholder_image_url}

  return (
    <img
      ref={thumbnailRef}
      data-testid={`post-thumbnail-${post.id}`}
      className="post-row-thumbnail hidden h-12 w-12 rounded-md object-cover md:block"
      src={visible ? imageProxy(source.url, source.size) : undefined}
      alt=""
      onError={visible ? () => setSourceIndex((current) => Math.min(current + 1, sources.length - 1)) : undefined}
    />
  )
}

function useVisibleOnce(ref) {
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (visible) return undefined
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return undefined
    }

    const target = ref.current
    if (!target) return undefined

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return

      setVisible(true)
      observer.disconnect()
    }, {root: null, rootMargin: '0px'})

    observer.observe(target)
    return () => observer.disconnect()
  }, [ref, visible])

  return visible
}
