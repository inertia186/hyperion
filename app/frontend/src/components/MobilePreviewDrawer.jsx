import { closeOnBackdropClick } from '../useModalDismiss'
import PreviewPane from './PreviewPane'

export default function MobilePreviewDrawer({
  open,
  post,
  previewState,
  previewActive,
  previewScrollRef,
  accountName,
  hivesignerAvailable,
  theme,
  onClose,
  onPrevious,
  onNext,
  onMarkReadNext,
  onSelectTag,
  onSelectAuthor,
  onChainStatsRefresh,
  readBusy,
  hasPrevious,
  hasNext
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/30 xl:hidden" role="dialog" aria-modal="true" aria-label="Post preview" onClick={closeOnBackdropClick(onClose)}>
      <div className="safe-area-shell safe-area-top mobile-preview-sheet flex flex-col bg-white">
        <div className="min-h-0 flex-1 overflow-hidden">
          <PreviewPane
            post={post}
            previewState={previewState}
            previewActive={previewActive}
            previewScrollRef={previewScrollRef}
            accountName={accountName}
            hivesignerAvailable={hivesignerAvailable}
            theme={theme}
            onClose={onClose}
            onPrevious={onPrevious}
            onNext={onNext}
            onMarkReadNext={onMarkReadNext}
            onSelectTag={onSelectTag}
            onSelectAuthor={onSelectAuthor}
            onChainStatsRefresh={onChainStatsRefresh}
            readBusy={readBusy}
            hasPrevious={hasPrevious}
            hasNext={hasNext}
          />
        </div>
      </div>
    </div>
  )
}
