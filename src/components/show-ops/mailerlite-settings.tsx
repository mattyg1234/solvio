import {
  connectMailerLiteAction,
  disconnectMailerLiteAction,
  refreshMailerLiteAction,
  saveMailerLiteGroupsAction,
  syncMailerLiteNowAction,
} from "@/app/dashboard/show-ops/actions-mailerlite";
import type { ShowOpsContext } from "@/lib/show-ops/access";
import { MAILERLITE_ISLANDS, parseMailerLiteGroups } from "@/lib/show-ops/mailerlite";

const btn = "rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200";

/** Settings → MailerLite. Owner/admin only (the integration row is hidden from everyone else by RLS). */
export async function MailerLiteSettings({ ctx, flash, flashMsg, flashError }: { ctx: ShowOpsContext; flash?: string; flashMsg?: string; flashError?: string }) {
  const [{ data: row }, waiting, added, noEmail] = await Promise.all([
    ctx.supabase.from("show_ops_integrations").select("status,meta,last_checked_at,last_error").eq("business_id", ctx.business.id).eq("provider", "mailerlite").maybeSingle(),
    ctx.supabase
      .from("show_bookings")
      .select("id", { count: "exact", head: true })
      .eq("business_id", ctx.business.id)
      .not("marketing_opt_in_at", "is", null)
      .is("whatsapp_opted_out_at", null)
      .is("mailerlite_synced_at", null)
      .not("guest_email", "is", null),
    ctx.supabase.from("show_bookings").select("id", { count: "exact", head: true }).eq("business_id", ctx.business.id).not("mailerlite_synced_at", "is", null),
    ctx.supabase.from("show_bookings").select("id", { count: "exact", head: true }).eq("business_id", ctx.business.id).not("marketing_opt_in_at", "is", null).is("guest_email", null),
  ]);
  const meta = (row?.meta ?? {}) as { hint?: string; group_list?: Array<{ id: string; name: string }> };
  const groups = parseMailerLiteGroups(row?.meta);
  const groupList = meta.group_list ?? [];
  const connected = row?.status === "connected";

  return (
    <section id="mailerlite" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <h2 className="font-semibold">MailerLite — guest marketing list</h2>
      <p className="mt-1 text-sm text-slate-600">
        Guests who reply YES to the MHT updates WhatsApp are added to MailerLite automatically every hour, with their name,
        email and mobile. Guests who never said YES are never sent. A guest who replies STOP is taken back out of these
        groups. The token is stored encrypted and never shown again.
      </p>

      {flash === "connected" ? (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">MailerLite connected. Now choose the group below.</p>
      ) : flash === "groups_saved" ? (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Groups saved.</p>
      ) : flash === "ok" ? (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Connection test passed and the group list is up to date.</p>
      ) : flash === "synced" ? (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Sent to MailerLite: {flashMsg}</p>
      ) : flash === "disconnected" ? (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">MailerLite disconnected. Guests already added stay in MailerLite.</p>
      ) : null}
      {flashError ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{flashError}</p> : null}

      {row ? (
        <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3 text-sm">
          <p>
            <span className={`font-medium ${connected ? "text-emerald-700" : "text-rose-700"}`}>{connected ? "Connected" : "Connection error"}</span>
            {meta.hint ? <span className="text-slate-600"> · token {meta.hint}</span> : null}
            {row.last_checked_at ? <span className="text-slate-500"> · last run {new Date(row.last_checked_at).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Atlantic/Canary" })}</span> : null}
          </p>
          {row.last_error ? <p className="text-rose-700">{row.last_error}</p> : null}
          <p className="text-slate-700">
            <b>{added.count ?? 0}</b> guests added so far · <b>{waiting.count ?? 0}</b> said YES and are waiting for the next run
            {noEmail.count ? <> · {noEmail.count} said YES but have no email on the booking</> : null}
          </p>

          <form action={saveMailerLiteGroupsAction} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            <label className="block text-sm">
              Every guest goes into
              <select name="group_all" defaultValue={groups.all} required className="mt-1 block w-full max-w-sm rounded-lg border px-3 py-2 text-sm">
                <option value="">Choose a MailerLite group…</option>
                {groupList.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </label>
            <p className="text-xs text-slate-600">Optional: also put guests in a group for the island they saw the show on.</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {MAILERLITE_ISLANDS.map((island) => (
                <label key={island} className="text-sm">
                  {island}
                  <select name={`group_${island}`} defaultValue={groups.islands[island] ?? ""} className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm">
                    <option value="">No island group</option>
                    {groupList.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {!groupList.length ? <p className="text-xs text-amber-800">MailerLite has no groups yet. Make one in MailerLite (Subscribers → Groups), then press Refresh groups.</p> : null}
            <button type="submit" className={btn}>Save groups</button>
          </form>

          <div className="flex flex-wrap gap-2">
            {connected && groups.all ? (
              <form action={syncMailerLiteNowAction}>
                <button type="submit" className={btn}>Send waiting guests now</button>
              </form>
            ) : null}
            <form action={refreshMailerLiteAction}>
              <button type="submit" className={btn}>Test &amp; refresh groups</button>
            </form>
            <form action={disconnectMailerLiteAction}>
              <button type="submit" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">Disconnect</button>
            </form>
          </div>
        </div>
      ) : null}

      <form action={connectMailerLiteAction} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          {row ? "Replace token" : "MailerLite API token"}
          <input
            name="mailerlite_token"
            type="password"
            autoComplete="new-password"
            data-1p-ignore="true"
            data-lpignore="true"
            data-bwignore="true"
            data-form-type="other"
            spellCheck={false}
            required
            placeholder="From MailerLite → Integrations → API"
            className="mt-1 block min-w-[22rem] rounded-lg border px-3 py-2 font-mono text-sm"
          />
        </label>
        <button type="submit" className="rounded-lg bg-[var(--show-ops-primary,#7c3aed)] px-3 py-2 text-sm font-semibold text-white">
          {row ? "Save new token" : "Connect MailerLite"}
        </button>
      </form>
    </section>
  );
}
