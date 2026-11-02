import Link from "next/link";
import { redirect } from "next/navigation";

import { SHOW_OPS_GHOST_BTN, ShowOpsPageHeader } from "@/components/show-ops/show-ops-page-header";
import { getShowOpsRenderContext } from "@/lib/show-ops/access";
import { inboxViewerFromContext } from "@/lib/show-ops/inbox/server";
import { loadSentLog, type SentFilter, type SentRow, type SentTone } from "@/lib/show-ops/sent-log";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FILTERS: Array<{ key: SentFilter; label: string }> = [
  { key: "all", label: "Everything" },
  { key: "email", label: "Emails" },
  { key: "phone", label: "WhatsApp & texts" },
  { key: "problems", label: "Problems" },
];

const TONE: Record<SentTone, string> = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  info: "bg-slate-50 text-slate-700 ring-slate-200",
  warn: "bg-amber-50 text-amber-800 ring-amber-200",
  bad: "bg-rose-50 text-rose-700 ring-rose-200",
};

const CHANNEL: Record<SentRow["channel"], string> = { email: "Email", whatsapp: "WhatsApp", sms: "Text" };

function when(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Atlantic/Canary",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function filterFrom(raw: string | undefined): SentFilter {
  return FILTERS.some((f) => f.key === raw) ? (raw as SentFilter) : "all";
}

/**
 * Sent: every email, WhatsApp and text the Hub sent for this workspace, who it
 * went to, and whether it arrived. Owner, admins and whole-inbox staff only.
 */
export default async function ShowOpsSentPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; q?: string }>;
}) {
  const ctx = await getShowOpsRenderContext();
  if (!ctx.business.show_ops_enabled) redirect("/dashboard/show-ops/setup");
  const viewer = await inboxViewerFromContext(ctx);
  if (!viewer?.seesAll) redirect("/dashboard/show-ops/inbox");
  const sp = await searchParams;
  const filter = filterFrom(sp.f);
  const q = String(sp.q ?? "").slice(0, 100);
  const { rows, emailLogReady } = await loadSentLog(ctx.business.id, { filter, q });

  const href = (f: SentFilter) => {
    const p = new URLSearchParams();
    if (f !== "all") p.set("f", f);
    if (q) p.set("q", q);
    const s = p.toString();
    return `/dashboard/show-ops/inbox/sent${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <ShowOpsPageHeader
        eyebrow="Team"
        title="Sent"
        subtitle="Every email, WhatsApp and text the Hub sent: who it went to, what it was, and whether it arrived. Times are Canary time."
        actions={
          <Link href="/dashboard/show-ops/inbox" className={SHOW_OPS_GHOST_BTN}>
            ← Customer inbox
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={href(f.key)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium ring-1",
              f.key === filter ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
            )}
          >
            {f.label}
          </Link>
        ))}
        <form className="ml-auto flex gap-2" action="/dashboard/show-ops/inbox/sent">
          {filter !== "all" ? <input type="hidden" name="f" value={filter} /> : null}
          <input
            name="q"
            defaultValue={q}
            placeholder="Name, email, phone or booking ref"
            className="w-64 max-w-full rounded-xl border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-400"
          />
          <button type="submit" className={SHOW_OPS_GHOST_BTN}>
            Search
          </button>
        </form>
      </div>

      {!emailLogReady ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Emails will show here once the Sent emails table is added to the database. WhatsApp and texts are shown below.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">How</th>
              <th className="px-4 py-3">To</th>
              <th className="px-4 py-3">What</th>
              <th className="px-4 py-3">Booking</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  {q ? "Nothing sent matches that search." : "Nothing sent yet."}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{when(r.at)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{CHANNEL[r.channel]}</td>
                  <td className="px-4 py-3">
                    {r.toName ? <div className="font-medium text-slate-900">{r.toName}</div> : null}
                    <div className="break-all text-slate-600">{r.to}</div>
                  </td>
                  <td className="max-w-md px-4 py-3">
                    <div className="font-medium text-slate-900">{r.what}</div>
                    <div className="line-clamp-2 text-slate-600">{r.detail}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {r.bookingId && r.bookingRef ? (
                      <Link
                        href={`/dashboard/show-ops/bookings/${r.bookingId}`}
                        className="font-mono text-xs text-slate-900 underline underline-offset-2"
                      >
                        {r.bookingRef}
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1", TONE[r.tone])}>
                      {r.status}
                    </span>
                    {r.error ? <div className="mt-1 max-w-xs text-xs text-rose-700">{r.error}</div> : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Showing the latest 200. Email delivery comes from Resend. WhatsApp shows Delivered and Read once Meta&apos;s
        webhook is switched on.
      </p>
    </div>
  );
}
