/**
 * Instant placeholder for every Show Ops page without its own skeleton, so a click
 * in the sidebar answers straight away while the page's data loads.
 */
export default function ShowOpsLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-slate-200" />
        <div className="h-7 w-48 rounded bg-slate-200" />
        <div className="h-3 w-72 rounded bg-slate-100" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-white ring-1 ring-slate-200/80" />
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-3">
            <div className="h-3 w-20 rounded bg-slate-200" />
            <div className="h-3 w-32 rounded bg-slate-200" />
            <div className="h-3 w-24 rounded bg-slate-100" />
            <div className="ml-auto h-3 w-16 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
