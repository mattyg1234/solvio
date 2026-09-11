/** Instant skeleton while the bookings query runs, so a click never looks dead. */
export default function BookingsLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading bookings">
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-slate-200" />
        <div className="h-7 w-40 rounded bg-slate-200" />
        <div className="h-3 w-72 rounded bg-slate-100" />
      </div>
      <div className="h-16 rounded-2xl bg-white ring-1 ring-slate-200/80" />
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
        {Array.from({ length: 8 }).map((_, i) => (
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
