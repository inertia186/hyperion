export default function PreviewSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading preview">
      <div className="h-4 w-4/5 rounded bg-slate-200" />
      <div className="h-4 w-full rounded bg-slate-100" />
      <div className="h-4 w-11/12 rounded bg-slate-100" />
      <div className="h-4 w-2/3 rounded bg-slate-100" />
      <div className="mt-6 h-40 rounded bg-slate-100" />
    </div>
  )
}
