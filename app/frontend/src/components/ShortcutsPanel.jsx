import { X } from 'lucide-react'

export default function ShortcutsPanel({visible, onClose}) {
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
    ['?', 'toggle shortcuts']
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-slate-950/20 p-4" role="dialog" aria-label="Keyboard shortcuts">
      <div className="w-full max-w-sm rounded-md border border-slate-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Keyboard shortcuts</h2>
          <button className="rounded p-1 text-slate-500 hover:bg-slate-100" type="button" onClick={onClose} aria-label="Close shortcuts">
            <X size={16} />
          </button>
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
