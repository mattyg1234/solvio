import Link from "next/link";

import { EmailDetail, KindPill, type DetailMatch } from "@/components/show-ops/email-bookings/email-detail";
import { EmailInboxCard } from "@/components/show-ops/email-bookings/inbox-card";
import { ShowOpsPageHeader } from "@/components/show-ops/show-ops-page-header";
import { requireShowOpsPage, roleAtLeast } from "@/lib/show-ops/access";
import { loadEmailConnection } from "@/lib/show-ops/email-bookings/connection";
import { loadBookingMatches, loadEmail, loadEmailQueue, type EmailTab } from "@/lib/show-ops/email-bookings/data";
import { gmailConfigured } from "@/lib/show-ops/email-bookings/gmail";
import { bookingDifferences } from "@/lib/show-ops/email-bookings/mapping";
import { isMatchOnlySeller } from "@/lib/show-ops/email-bookings/sellers";
import { secretsKeyConfigured } from "@/lib/show-ops/secrets";
import { cn } from "@/lib/utils";

// Server actions posted from this page (saving senders, linking) share its time limit.
export const maxDuration = 60;

const TABS: { key: EmailTab; label: string }[] = [
  { key: "review", label: "To check" },
  { key: "added", label: "Done" },
  { key: "ignored", label: "Skipped" },
  { key: "all", label: "All" },
];

/** Plain-words message for the ?error= code the sign-in routes send back. */
const SIGN_IN_ERRORS: Record<string, string> = {
  denied: "The Google sign-in was cancelled, so nothing was connected.",
  bad_state: "That sign-in link had expired or was opened in a different browser. Please try again.",
  expired: "The sign-in took longer than 10 minutes. Please try again.",
  not_allowed: "Only Reservation (ops) staff and above with the Bookings page can connect the bookings inbox.",
  config: "Gmail connection isn't switched on yet: the Google sign-in keys still need adding on the server.",
  secrets: "The server can't store the inbox sign-in yet (SHOW_OPS_SECRETS_KEY is missing).",
  no_email: "Couldn't read which email address you signed in with. Please try again.",
  exchange_failed: "Google didn't finish the sign-in. Please try again.",
  provider: "Google didn't finish the sign-in. Please try again.",
  server: "Something went wrong saving the connection. Please try again.",
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** "Tue 29 Sep, 19:15" in island time. */
function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Atlantic/Canary" });
}

export default async function EmailBookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireShowOpsPage("bookings");
  const sp = await searchParams;
  const tabParam = one(sp.tab);
  const tab: EmailTab = TABS.some((t) => t.key === tabParam) ? (tabParam as EmailTab) : "review";
  const canManage = roleAtLeast(ctx.role, "office");
  const gmailReady = gmailConfigured();

  const [conn, queue] = await Promise.all([loadEmailConnection(ctx.supabase, ctx.business.id), loadEmailQueue(ctx.supabase, ctx.business.id, tab)]);

  const wanted = one(sp.id);
  const selected = queue.emails.find((e) => e.id === wanted) ?? (wanted ? await loadEmail(ctx.supabase, ctx.business.id, wanted) : null) ?? queue.emails[0] ?? null;

  let matches: DetailMatch[] = [];
  let linked: { id: string; booking_ref: string } | null = null;
  if (selected) {
    const [found, linkedRow] = await Promise.all([
      selected.kind !== "not-booking" && selected.status === "review" ? loadBookingMatches(ctx.supabase, ctx.business.id, selected.extracted) : Promise.resolve([]),
      selected.booking_id
        ? ctx.supabase.from("show_bookings").select("id,booking_ref").eq("business_id", ctx.business.id).eq("id", selected.booking_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    matches = found.map((m) => ({ ...m, diffs: bookingDifferences(selected.extracted, m.booking) }));
    linked = linkedRow.data ? { id: String(linkedRow.data.id), booking_ref: String(linkedRow.data.booking_ref) } : null;
  }

  const signInError = SIGN_IN_ERRORS[one(sp.error)] ?? (one(sp.error) ? SIGN_IN_ERRORS.provider : null);
  const created = one(sp.created);
  const hrefFor = (params: { tab?: EmailTab; id?: string }) => {
    const q = new URLSearchParams();
    const t = params.tab ?? tab;
    if (t !== "review") q.set("tab", t);
    if (params.id) q.set("id", params.id);
    const s = q.toString();
    return `/dashboard/show-ops/email-bookings${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <ShowOpsPageHeader
        eyebrow="Operations"
        title="Email bookings"
        subtitle="Booking emails from the partners you track, read into a list for the office to check. Nothing becomes a booking until you open it in the booking form and save it, and the same booking is never added twice."
      />

      {signInError && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">{signInError}</p>}
      {one(sp.connected) === "1" && !conn && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">Signed in, but the inbox couldn&rsquo;t be read back. Refresh the page.</p>}
      {created && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
          Booking {created} saved from the email. <Link href="/dashboard/show-ops/bookings" className="font-semibold underline">Open Bookings</Link>
        </p>
      )}
      {queue.missingTable && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
          Email bookings needs a database update before it can be used (migration 20260930010000_show_ops_email_bookings).
        </p>
      )}
      {gmailReady && !secretsKeyConfigured() && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
          The server&rsquo;s secrets key (SHOW_OPS_SECRETS_KEY) isn&rsquo;t set, so an inbox sign-in can&rsquo;t be stored yet.
        </p>
      )}

      <EmailInboxCard
        inbox={conn ? { provider: conn.provider, address: conn.address, skipped: conn.skipped, sellers: conn.sellers, lastSyncAt: conn.last_sync_at } : null}
        gmailReady={gmailReady}
        canManage={canManage}
        justConnected={one(sp.connected) === "1"}
      />

      {(conn || queue.emails.length > 0 || queue.counts.added + queue.counts.ignored > 0) && (
        <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80">
          <nav className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-3" aria-label="Filter emails">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={hrefFor({ tab: t.key })}
                aria-current={tab === t.key ? "page" : undefined}
                className={cn(
                  "shrink-0 border-b-2 px-3 pb-2 text-sm font-semibold",
                  tab === t.key ? "border-[var(--show-ops-primary,#7c3aed)] text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900",
                )}
              >
                {t.label}
                {t.key !== "all" && <span className="ml-1.5 text-xs tabular-nums text-slate-400">{queue.counts[t.key]}</span>}
              </Link>
            ))}
          </nav>

          <div className="grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <ul className="max-h-[44rem] divide-y divide-slate-100 overflow-y-auto border-b border-slate-100 lg:border-b-0 lg:border-r">
              {queue.emails.length === 0 && (
                <li className="px-4 py-10 text-center text-sm text-slate-500">{tab === "review" ? "All caught up." : "Nothing here."}</li>
              )}
              {queue.emails.map((e) => (
                <li key={e.id}>
                  <Link
                    href={hrefFor({ id: e.id })}
                    aria-current={selected?.id === e.id ? "true" : undefined}
                    className={cn("flex flex-col gap-1 px-4 py-3", selected?.id === e.id ? "bg-violet-50/70" : "hover:bg-slate-50")}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900">{e.extracted.name ?? e.from_name}</span>
                      <span className="shrink-0 text-xs text-slate-400">{when(e.received_at)}</span>
                    </span>
                    <span className="truncate text-xs text-slate-500">
                      {e.seller_name ?? e.from_name}
                      {e.extracted.reference ? ` · ${e.extracted.reference}` : ""}
                      {e.extracted.date ? ` · ${e.extracted.date}` : ""}
                      {e.extracted.quantity ? ` · ${e.extracted.quantity} pax` : ""}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <KindPill kind={e.kind} />
                      {e.system_note?.startsWith("Duplicate") || e.system_note?.startsWith("Already in bookings") ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">Duplicate</span>
                      ) : null}
                      {e.notes ? <span className="text-[11px] text-slate-400">Has notes</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="min-w-0 p-5">
              {selected ? (
                <EmailDetail key={selected.id} email={selected} matches={matches} linked={linked} matchOnly={isMatchOnlySeller(selected.seller_key)} />
              ) : (
                <p className="py-12 text-center text-sm text-slate-500">Pick an email to check it.</p>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
