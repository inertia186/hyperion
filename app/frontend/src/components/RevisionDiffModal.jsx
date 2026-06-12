import { X } from 'lucide-react'
import { closeOnBackdropClick, useModalDismiss } from '../useModalDismiss'

export default function RevisionDiffModal({modal, onClose, onSelectPair}) {
  useModalDismiss(true, onClose)
  const revisions = modal.payload?.revisions || []
  const pairCount = Math.max(revisions.length - 1, 0)
  const selectedIndex = Math.min(modal.selectedIndex ?? Math.max(pairCount - 1, 0), Math.max(pairCount - 1, 0))
  const previousRevision = pairCount > 0 ? revisions[selectedIndex] : null
  const currentRevision = pairCount > 0 ? revisions[selectedIndex + 1] : revisions[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true" aria-label="Revision diff" onClick={closeOnBackdropClick(onClose)}>
      <div className="diff-modal flex h-[min(860px,calc(100vh-24px))] w-[min(1120px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
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
        <div className="diff-modal-body min-h-0 flex-1 overflow-auto bg-slate-50 p-3">
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
    <section className="code-revision flex min-h-[360px] flex-col overflow-hidden rounded-md border border-slate-800 bg-slate-950 text-slate-100">
      <div className="code-revision-header border-b border-slate-800 bg-slate-900 px-3 py-2">
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
    <section className="code-diff flex min-h-[520px] flex-col overflow-hidden rounded-md border border-slate-800 bg-slate-950 text-slate-100">
      <div className="code-diff-header grid border-b border-slate-800 bg-slate-900 text-xs text-slate-300 sm:grid-cols-2">
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

export function lineDiff(before, after) {
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
