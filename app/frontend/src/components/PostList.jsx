import { useEffect, useMemo, useState } from 'react'
import { CheckSquare, Square } from 'lucide-react'
import { imageProxy, relativeAge, tagLabel } from '../format'
import CommunityLabel from './CommunityLabel'

export default function PostList({posts, selectedId, selectedPostIds, allMatchingSelected, ignoredTags, onSelect, onToggleSelected, onSelectTag, onSelectAuthor}) {
  return (
    <div className="divide-y divide-slate-100">
      {posts.map((post) => {
        const checked = allMatchingSelected || selectedPostIds.has(post.id)

        return (
          <div key={post.id} data-post-list-row={post.id} data-selected={selectedId === post.id ? 'true' : undefined} className={`grid w-full grid-cols-[40px_minmax(0,1fr)_72px] items-center gap-3 px-3 py-3 text-left text-sm hover:bg-slate-50 md:grid-cols-[40px_56px_minmax(220px,1fr)_minmax(120px,180px)_minmax(120px,160px)_90px] md:py-2 lg:grid-cols-[40px_56px_minmax(220px,1fr)_180px_160px_110px] ${selectedId === post.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''}`}>
            <button className="flex h-10 w-10 items-center justify-center rounded text-blue-700 hover:bg-blue-100 md:h-auto md:w-auto md:p-1" type="button" onClick={() => onToggleSelected(post.id)} aria-label={`${checked ? 'Deselect' : 'Select'} ${post.title}`} aria-pressed={checked}>
              {checked ? <CheckSquare size={18} /> : <Square size={18} />}
            </button>
            <PostThumbnail post={post} />
            <div className="min-w-0">
              <button className="block w-full truncate text-left font-medium text-slate-900" type="button" onClick={() => onSelect(post.id)}>
                {post.title}
              </button>
              <span className="mt-1 flex flex-wrap items-center gap-1">
                <button className={`rounded border px-1.5 py-0.5 text-[11px] hover:bg-slate-50 md:hidden ${post.muted_author ? 'border-slate-300 text-slate-400 line-through' : 'border-slate-200 text-slate-600'}`} type="button" onClick={() => onSelectAuthor(post.author)} aria-label={`Focus author @${post.author}`}>
                  @{post.author}
                </button>
                {post.tags.slice(0, 4).map(({tag, name, image_url}) => (
                  <button key={tag} className={`rounded border px-1.5 py-0.5 text-[11px] hover:bg-slate-50 ${ignoredTags.includes(tag) ? 'border-slate-300 text-slate-400 line-through' : 'border-slate-200 text-slate-600'}`} type="button" onClick={() => onSelectTag(tag)} aria-label={`Focus tag ${tag}`}>
                    <CommunityLabel name={tagLabel(tag, post, name)} imageUrl={image_url} />
                  </button>
                ))}
              </span>
            </div>
            <button className={`hidden truncate text-left md:block ${post.muted_author ? 'text-slate-400 line-through' : 'text-slate-700'}`} type="button" onClick={() => onSelectAuthor(post.author)} aria-label={`Focus author @${post.author}`}>@{post.author}</button>
            <button className="hidden min-w-0 text-left text-slate-600 md:block" type="button" onClick={() => onSelect(post.id)}>
              <CommunityLabel name={post.category_name} imageUrl={post.category_image_url} />
            </button>
            <button className="text-right text-xs text-slate-500" type="button" onClick={() => onSelect(post.id)}>{relativeAge(post.created_at)}</button>
          </div>
        )
      })}
    </div>
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
      className="hidden h-12 w-12 rounded-md object-cover md:block"
      src={imageProxy(source, '0x96')}
      alt=""
      onError={() => setSourceIndex((current) => Math.min(current + 1, sources.length - 1))}
    />
  )
}
