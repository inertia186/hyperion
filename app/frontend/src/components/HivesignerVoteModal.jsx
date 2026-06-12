import { ExternalLink, X } from 'lucide-react'
import { closeOnBackdropClick } from '../useModalDismiss'

export default function HivesignerVoteModal({url, onClose}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true" aria-label="Hivesigner vote" onClick={closeOnBackdropClick(onClose)}>
      <div className="flex h-[min(760px,calc(100vh-24px))] w-[min(520px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex min-h-12 items-center gap-3 border-b border-slate-200 px-3">
          <div className="min-w-0 flex-1 text-sm font-semibold text-slate-900">Hivesigner vote</div>
          <a className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs text-slate-700 hover:bg-slate-50" href={url} target="_blank" rel="noreferrer">
            <ExternalLink size={13} /> Open
          </a>
          <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" type="button" onClick={onClose} aria-label="Close Hivesigner vote">
            <X size={15} />
          </button>
        </div>
        <iframe className="min-h-0 flex-1 border-0" title="Hivesigner vote" src={url} />
      </div>
    </div>
  )
}
