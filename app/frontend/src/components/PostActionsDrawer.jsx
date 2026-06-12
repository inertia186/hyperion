import { ExternalLink, FileDiff, X } from 'lucide-react'
import { closeOnBackdropClick } from '../useModalDismiss'

export default function PostActionsDrawer({links, onClose, onOpenDiff}) {
  const openDiff = () => {
    onClose()
    onOpenDiff()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Post actions" onClick={closeOnBackdropClick(onClose)}>
      <div className="safe-area-bottom w-full max-w-sm overflow-hidden rounded-t-lg border border-slate-200 bg-white shadow-xl sm:rounded-lg">
        <div className="flex min-h-12 items-center gap-3 border-b border-slate-200 px-3">
          <div className="min-w-0 flex-1 text-sm font-semibold text-slate-900">Post actions</div>
          <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" type="button" onClick={onClose} aria-label="Close post actions">
            <X size={15} />
          </button>
        </div>
        <div className="grid gap-1 p-2">
          {links.length > 0 && <div className="px-3 pb-1 pt-1 text-xs font-semibold uppercase text-slate-400">Open in</div>}
          {links.map((link) => (
            <a
              key={link.key}
              className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-700"
              href={link.href}
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
            >
              <ExternalLink className="shrink-0" size={16} />
              <span className="min-w-0 flex-1 truncate">{link.label}</span>
            </a>
          ))}
          <div className="mt-1 border-t border-slate-100 pt-1">
            <button
              className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-700"
              type="button"
              onClick={openDiff}
            >
              <FileDiff className="shrink-0" size={16} />
              <span className="min-w-0 flex-1 truncate">Diff</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
