import { ChevronDown, ChevronUp } from 'lucide-react'
import { tagLabel } from '../format'
import CommunityLabel from './CommunityLabel'

export default function CategoryTagsControl({
  post,
  ignoredTags = [],
  expanded,
  onToggle,
  onSelectTag,
  className = '',
  buttonClassName = '',
  menuClassName = '',
  testId,
  label
}) {
  const tags = post.tags || []
  const categoryTag = tags.find(({tag, category}) => category || tag === post.category)
  const displayCategory = {
    tag: post.category,
    name: post.category_name,
    image_url: post.category_image_url
  }
  const allTags = [displayCategory, ...tags.filter(({tag}) => tag !== post.category)]
  const visibleExtraTags = allTags.filter(({tag}) => tag !== displayCategory.tag)
  const controlLabel = label || post.title
  const controlClassName = buttonClassName || 'flex w-full min-w-0 items-center gap-1 rounded border border-slate-200 px-1.5 py-1 text-left text-xs text-slate-700 hover:bg-slate-50'

  return (
    <div className={className} data-testid={testId}>
      <div className={controlClassName}>
        <button className="min-w-0 flex-1 truncate text-left hover:text-blue-700 hover:underline" type="button" onClick={() => onSelectTag(displayCategory.tag)} aria-label={`Focus tag ${displayCategory.tag}`}>
          <CommunityLabel name={tagLabel(displayCategory.tag, post, categoryTag?.name || displayCategory.name)} imageUrl={categoryTag?.image_url || displayCategory.image_url} />
        </button>
        {visibleExtraTags.length > 0 && <span className="text-[10px] text-slate-500">+{visibleExtraTags.length}</span>}
        <button className="-mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-slate-100" type="button" onClick={onToggle} aria-expanded={expanded} aria-label={`${expanded ? 'Collapse' : 'Expand'} tags for ${controlLabel}`}>
          {expanded ? <ChevronUp className="shrink-0" size={13} /> : <ChevronDown className="shrink-0" size={13} />}
        </button>
      </div>
      {expanded && visibleExtraTags.length > 0 && (
        <div className={menuClassName || 'mt-1 flex flex-wrap gap-1'}>
          {visibleExtraTags.map(({tag, name, image_url}) => (
            <button key={tag} className={`rounded border px-1.5 py-0.5 text-[11px] hover:bg-slate-50 ${ignoredTags.includes(tag) ? 'border-slate-300 text-slate-400 line-through' : 'border-slate-200 text-slate-600'}`} type="button" onClick={() => onSelectTag(tag)} aria-label={`Focus tag ${tag}`}>
              <CommunityLabel name={tagLabel(tag, post, name)} imageUrl={image_url} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
