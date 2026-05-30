import { useEffect, useMemo, useState } from 'react'
import { CheckSquare, Square } from 'lucide-react'
import { imageProxy, relativeAge, tagLabel } from '../format'
import CategoryTagsControl from './CategoryTagsControl'
import CommunityLabel from './CommunityLabel'

export default function PostList({posts, selectedId, selectedPostIds, allMatchingSelected, ignoredTags, onSelect, onToggleSelected, onSelectTag, onSelectAuthor}) {
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
          <div key={post.id} data-post-list-row={post.id} data-selected={selectedId === post.id ? 'true' : undefined} className={`post-list-row grid w-full grid-cols-[40px_minmax(0,1fr)_72px] items-center gap-3 px-3 py-3 text-left text-sm hover:bg-slate-50 md:grid-cols-[40px_82px_56px_minmax(180px,1fr)_minmax(112px,160px)_minmax(130px,190px)_82px] md:py-2 xl:grid-cols-[40px_92px_56px_minmax(220px,1fr)_170px_200px_90px] ${selectedId === post.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''}`}>
            <button className="flex h-10 w-10 items-center justify-center rounded text-blue-700 hover:bg-blue-100 md:h-auto md:w-auto md:p-1" type="button" onClick={() => onToggleSelected(post.id)} aria-label={`${checked ? 'Deselect' : 'Select'} ${post.title}`} aria-pressed={checked}>
              {checked ? <CheckSquare size={18} /> : <Square size={18} />}
            </button>
            <PostPayout post={post} />
            <PostThumbnail post={post} />
            <div className="min-w-0">
              <button className="block w-full truncate text-left font-medium text-slate-900" type="button" onClick={() => onSelect(post.id)}>
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
            <button className="text-right text-xs text-slate-500" type="button" onClick={() => onSelect(post.id)}>{relativeAge(post.created_at)}</button>
          </div>
        )
      })}
    </div>
  )
}

function PostPayout({post}) {
  const [payout, setPayout] = useState('00.000 HBD')

  useEffect(() => {
    let cancelled = false
    setPayout('...')

    const hiveApi = window.hive?.api
    if (!hiveApi) {
      setPayout('00.000 HBD')
      return undefined
    }

    hiveApi.getContent(post.author, post.permlink, (err, response) => {
      if (cancelled) return
      if (err || !response) {
        setPayout('00.000 HBD')
        return
      }

      setPayout(response.cashout_time === '1969-12-31T23:59:59' ? response.total_payout_value : response.pending_payout_value)
    })

    return () => {
      cancelled = true
    }
  }, [post.author, post.permlink])

  return (
    <span className="post-row-payout hidden h-7 min-w-0 items-center justify-center rounded bg-slate-100 px-2 text-center text-[11px] font-medium text-slate-600 md:inline-flex">
      <span className="truncate">{payout}</span>
    </span>
  )
}

function PostThumbnail({post}) {
  const sources = useMemo(() => {
    const values = [post.thumbnail_url, post.author_avatar_url, post.placeholder_image_url]
    return values.filter((value, index) => value && values.indexOf(value) === index)
  }, [post.author_avatar_url, post.placeholder_image_url, post.thumbnail_url])
  const [sourceIndex, setSourceIndex] = useState(0)

  useEffect(() => {
    setSourceIndex(0)
  }, [post.id, sources])

  const source = sources[sourceIndex] || post.placeholder_image_url

  return (
    <img
      data-testid={`post-thumbnail-${post.id}`}
      className="post-row-thumbnail hidden h-12 w-12 rounded-md object-cover md:block"
      src={imageProxy(source, '0x96')}
      alt=""
      onError={() => setSourceIndex((current) => Math.min(current + 1, sources.length - 1))}
    />
  )
}
