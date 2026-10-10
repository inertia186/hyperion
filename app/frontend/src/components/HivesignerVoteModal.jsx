import { useEffect, useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { closeOnBackdropClick } from '../useModalDismiss'

export default function HivesignerVoteModal({url, onClose}) {
  const [opened, setOpened] = useState(false)

  useEffect(() => {
    if (!opened) return undefined

    window.addEventListener('focus', onClose, {once: true})
    return () => window.removeEventListener('focus', onClose)
  }, [opened, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true" aria-label="Hivesigner vote" onClick={closeOnBackdropClick(onClose)}>
      <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex min-h-12 items-center gap-3 border-b border-slate-200 px-3">
          <div className="min-w-0 flex-1 text-sm font-semibold text-slate-900">Hivesigner vote</div>
          <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" type="button" onClick={onClose} aria-label="Close Hivesigner vote">
            <X size={15} />
          </button>
        </div>
        <div className="space-y-4 p-4">
          <p className="text-sm text-slate-700">Approve the vote in a new tab, then return here to check the latest vote state.</p>
          <div className="flex flex-wrap gap-2">
            <a className="inline-flex min-h-10 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700" href={url} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)}>
              <ExternalLink size={15} /> Open HiveSigner
            </a>
            <button className="inline-flex min-h-10 items-center rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={onClose}>Check vote</button>
          </div>
        </div>
      </div>
    </div>
  )
}
