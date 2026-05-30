import { useMemo, useState } from 'react'
import { Eye, Skull, Star, StarOff, Tag, Trash2, X } from 'lucide-react'
import CommunityLabel from './CommunityLabel'

export default function TagPanels({relatedTags, pastTags, favoriteTags, ignoredTags, poisonedPillTags = [], activeTag = '', updateQuery, toggleFavorite, togglePoisonedPill, removePastTag, clearPastTags, clearIgnoredTags, compact = false}) {
  const hasIgnoredPastTags = pastTags.some(({tag}) => ignoredTags.includes(tag))
  const [relatedMode, setRelatedMode] = useState('list')
  const displayedRelatedTags = relatedTags.slice(0, 80)
  const activeTags = activeTag.split(/[ +]/).filter((tag) => tag && !tag.startsWith('-') && !tag.startsWith('@') && !tag.startsWith('app:'))
  const tagDetailsByTag = useMemo(() => {
    const details = new Map()

    const knownTags = [...relatedTags, ...pastTags]
    knownTags.forEach(({tag, name, image_url}) => {
      if (!tag || details.has(tag)) return
      details.set(tag, {name: name || tag, imageUrl: image_url})
    })

    return details
  }, [pastTags, relatedTags])
  const cloudAverage = useMemo(() => {
    if (displayedRelatedTags.length === 0) return 1
    const total = displayedRelatedTags.reduce((sum, item) => sum + Math.max(Number(item.count) || 1, 1), 0)
    return total / displayedRelatedTags.length
  }, [displayedRelatedTags])

  return (
    <div className={compact ? 'grid gap-4' : 'mt-4 grid gap-4 md:grid-cols-2'}>
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Tag size={16} /> Related Tags</h2>
          <div className="ml-auto inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-xs">
            <button className={`h-7 rounded px-2 ${relatedMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`} type="button" onClick={() => setRelatedMode('list')} aria-pressed={relatedMode === 'list'}>
              List
            </button>
            <button className={`h-7 rounded px-2 ${relatedMode === 'cloud' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`} type="button" onClick={() => setRelatedMode('cloud')} aria-pressed={relatedMode === 'cloud'}>
              Cloud
            </button>
          </div>
        </div>
        {relatedMode === 'cloud' ? (
          <div className="max-h-56 overflow-auto rounded-md border border-slate-100 bg-white px-3 py-2 leading-loose">
            {displayedRelatedTags.map(({name, tag, count, image_url}) => (
              <button key={tag} className={`mx-1 align-middle hover:text-blue-700 hover:underline ${ignoredTags.includes(tag) ? 'text-slate-400 line-through' : 'text-slate-700'}`} style={{fontSize: cloudFontSize(count, cloudAverage)}} type="button" onClick={() => updateQuery({tag: relatedTagQuery(activeTag, tag)})} title={`${count || 0} posts`}>
                <CommunityLabel name={name} imageUrl={image_url} />
              </button>
            ))}
          </div>
        ) : (
          <div className="flex max-h-44 flex-wrap gap-2 overflow-auto">
            {displayedRelatedTags.map(({name, tag, image_url}) => (
              <button key={tag} className={`min-h-9 rounded-md border bg-white px-2 py-1 text-xs hover:bg-slate-50 sm:min-h-0 ${ignoredTags.includes(tag) ? 'text-slate-400 line-through' : 'text-slate-700'}`} type="button" onClick={() => updateQuery({tag: relatedTagQuery(activeTag, tag)})}>
                <CommunityLabel name={name} imageUrl={image_url} />
              </button>
            ))}
          </div>
        )}
      </section>
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Star size={16} /> Past</h2>
          <div className="ml-auto flex gap-2">
            {hasIgnoredPastTags && (
              <button className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs hover:bg-slate-50 sm:h-7" type="button" onClick={() => clearPastTags(true)}>
                <Trash2 size={13} /> Ignored past
              </button>
            )}
            <button className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs hover:bg-slate-50 disabled:opacity-50 sm:h-7" type="button" onClick={() => clearPastTags(false)} disabled={pastTags.length === 0}>
              <Trash2 size={13} /> All past
            </button>
            <button className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs hover:bg-slate-50 disabled:opacity-50 sm:h-7" type="button" onClick={clearIgnoredTags} disabled={ignoredTags.length === 0} aria-label="Clear ignored tags">
              <X size={13} /> Ignored
            </button>
          </div>
        </div>
        <div className="flex max-h-44 flex-wrap gap-2 overflow-auto">
          {pastTags.map(({name, tag, image_url}) => (
            <span key={tag} className={`inline-flex items-center rounded-md border bg-white text-xs ${ignoredTags.includes(tag) ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
              <button className="min-h-9 px-2 py-1 sm:min-h-0" type="button" onClick={() => updateQuery({tag})}>
                <CommunityLabel name={name} imageUrl={image_url} />
              </button>
              <button className="min-h-9 border-l px-2 py-1 sm:min-h-0 sm:px-1" type="button" onClick={() => toggleFavorite(tag)} title={favoriteTags.includes(tag) ? 'Remove favorite' : 'Favorite tag'}>
                {favoriteTags.includes(tag) ? <Star size={13} fill="currentColor" /> : <StarOff size={13} />}
              </button>
              <button className="min-h-9 border-l px-2 py-1 sm:min-h-0 sm:px-1" type="button" onClick={() => removePastTag(tag)} title="Remove past tag"><X size={13} /></button>
            </span>
          ))}
        </div>
      </section>
      <section className={compact ? '' : 'md:col-span-2'}>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Skull size={16} /> Poisoned Pill</h2>
          {activeTags.some((tag) => !poisonedPillTags.includes(tag)) && (
            <div className="ml-auto flex flex-wrap justify-end gap-1">
              {activeTags.filter((tag) => !poisonedPillTags.includes(tag)).map((tag) => (
                <button key={tag} className="inline-flex h-9 items-center gap-1 rounded-md border border-red-200 bg-white px-2 text-xs text-red-700 hover:bg-red-50 sm:h-7" type="button" onClick={() => togglePoisonedPill(tag)}>
                  <Skull size={13} /> Set <CommunityLabel name={tagDetailsByTag.get(tag)?.name || tag} imageUrl={tagDetailsByTag.get(tag)?.imageUrl} /> as Poison
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="mb-2 text-xs text-slate-500">Tip: Setting a tag as poison will ignore all posts by authors that have used a poisoned tag (until they stop).</p>
        <div className="flex max-h-44 flex-wrap gap-2 overflow-auto">
          {poisonedPillTags.length === 0 ? (
            <div className="rounded-md border border-slate-100 bg-white px-3 py-2 text-xs text-slate-500">No poisoned-pill tags.</div>
          ) : poisonedPillTags.map((tag) => (
            <span key={tag} className="inline-flex items-center rounded-md border bg-white text-xs text-red-700">
              <button className="min-h-9 px-2 py-1 sm:min-h-0" type="button" onClick={() => updateQuery({tag})}>
                <CommunityLabel name={tagDetailsByTag.get(tag)?.name || tag} imageUrl={tagDetailsByTag.get(tag)?.imageUrl} />
              </button>
              <button className="min-h-9 border-l px-2 py-1 sm:min-h-0 sm:px-1" type="button" onClick={() => togglePoisonedPill(tag)} title="Remove poisoned pill" aria-label={`Remove poisoned pill ${tag}`}>
                <Eye size={13} />
              </button>
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}

function cloudFontSize(count, average) {
  const ratio = Math.max(Number(count) || 1, 1) / Math.max(average, 1)
  const size = Math.min(Math.max(0.75 + ratio * 0.35, 0.75), 1.8)

  return `${size.toFixed(2)}rem`
}

function relatedTagQuery(activeTag, relatedTag) {
  if (!activeTag || activeTag === relatedTag) return relatedTag

  return `${activeTag}+${relatedTag}`
}
