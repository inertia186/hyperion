import MobilePreviewDrawer from './MobilePreviewDrawer'
import PreviewPane from './PreviewPane'

export default function CurationPreviewPanels({
  mobilePreviewOpen,
  selectedPost,
  previewState,
  previewActive,
  desktopPreviewScrollRef,
  mobilePreviewScrollRef,
  accountName,
  hivesignerAvailable,
  theme,
  onClosePreview,
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
  return (
    <>
      <aside className="hidden min-w-0 xl:sticky xl:top-4 xl:flex xl:h-[calc(100vh-2rem)] xl:h-[calc(100dvh-2rem)] xl:flex-col xl:gap-3">
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-slate-200 bg-white">
          <PreviewPane
            post={selectedPost}
            previewState={previewState}
            previewActive={previewActive}
            previewScrollRef={desktopPreviewScrollRef}
            accountName={accountName}
            hivesignerAvailable={hivesignerAvailable}
            theme={theme}
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
      </aside>

      <MobilePreviewDrawer
        open={mobilePreviewOpen}
        post={selectedPost}
        previewState={previewState}
        previewActive={previewActive}
        previewScrollRef={mobilePreviewScrollRef}
        accountName={accountName}
        hivesignerAvailable={hivesignerAvailable}
        theme={theme}
        onClose={onClosePreview}
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
    </>
  )
}
