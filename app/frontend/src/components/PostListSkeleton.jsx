export default function PostListSkeleton() {
  return (
    <div className="divide-y divide-slate-100" aria-label="Loading posts" aria-busy="true">
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className="grid grid-cols-[40px_minmax(0,1fr)_96px] items-center gap-3 px-3 py-3 md:grid-cols-[40px_56px_minmax(220px,1fr)_minmax(120px,180px)_minmax(120px,160px)_90px]">
          <div className="h-5 w-5 rounded bg-slate-200" />
          <div className="hidden h-12 w-12 rounded-md bg-slate-200 md:block" />
          <div className="space-y-2">
            <div className="h-4 w-3/4 rounded bg-slate-200" />
            <div className="h-3 w-1/3 rounded bg-slate-100" />
          </div>
          <div className="hidden h-4 rounded bg-slate-100 md:block" />
          <div className="hidden h-4 rounded bg-slate-100 md:block" />
          <div className="h-4 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  )
}
