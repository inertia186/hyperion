import { X } from 'lucide-react'
import { closeOnBackdropClick, useModalDismiss } from '../useModalDismiss'
import TagPanels from './TagPanels'

export default function TagsModal({open, onClose, tagPanelProps}) {
  useModalDismiss(open, onClose)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/30 p-3 pt-8 sm:p-4 sm:pt-10" role="dialog" aria-modal="true" aria-label="Tags" onClick={closeOnBackdropClick(onClose)}>
      <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col rounded-md border border-slate-200 bg-white shadow-xl sm:max-h-[calc(100vh-3.5rem)]">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <div className="text-sm font-semibold text-slate-900">Tags</div>
          <button className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" type="button" onClick={onClose} aria-label="Close tags">
            <X size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
          <TagPanels {...tagPanelProps} />
        </div>
      </div>
    </div>
  )
}
