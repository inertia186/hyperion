import { X } from 'lucide-react'
import { closeOnBackdropClick, useModalDismiss } from '../useModalDismiss'

export default function ShortcutsPanel({visible, onClose}) {
  useModalDismiss(visible, onClose)
  if (!visible) return null

  const shortcuts = [
    ['j / down', 'next post'],
    ['k / up', 'previous post'],
    ['enter', 'toggle preview focus'],
    ['esc', 'return to list or close this panel'],
    ['l / right', 'next post while preview is active'],
    ['h / left', 'previous post while preview is active'],
    ['>', 'mark read, next post'],
    ['<', 'mark read, previous post'],
    ['space', 'scroll preview down'],
    ['shift+space', 'scroll preview up'],
    ['?', 'help']
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-3" role="dialog" aria-label="Help" onClick={closeOnBackdropClick(onClose)}>
      <div className="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Help</h2>
          <button className="rounded p-1 text-slate-500 hover:bg-slate-100" type="button" onClick={onClose} aria-label="Close help">
            <X size={16} />
          </button>
        </div>
        <div className="border-b border-slate-100 px-4 py-4 text-sm text-slate-700">
          <p className="mb-3">
            Hyperion is a focused curation inbox for Hive. It helps you scan posts, filter by tags and authors, preview content, manage ignored or favorite tags, and move quickly through read decisions without losing context.
          </p>
          <dl className="grid gap-2 text-xs leading-relaxed text-slate-600">
            <div>
              <dt className="font-semibold text-slate-700">Unread</dt>
              <dd>Posts you have not marked read in this Hyperion account. It is your curation state, not a global Hive-wide read count.</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Keywords</dt>
              <dd>Switches the search field to title/body keyword search. Filters are for tag, author, app, and excluded-tag patterns.</dd>
            </div>
          </dl>
        </div>
        <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 px-4 py-3 text-sm">
          {shortcuts.map(([key, label]) => (
            <FragmentRow key={key} shortcut={key} label={label} />
          ))}
        </dl>
      </div>
    </div>
  )
}

function FragmentRow({shortcut, label}) {
  return (
    <>
      <dt className="text-right font-mono text-xs text-slate-500">{shortcut}</dt>
      <dd className="text-slate-700">{label}</dd>
    </>
  )
}
