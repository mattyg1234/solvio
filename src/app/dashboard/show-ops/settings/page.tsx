import { Crown } from "lucide-react";
import {
  importCsvAction,
  createShowOpsStaffAction,
  resetShowOpsStaffPasswordAction,
  updateShowOpsMemberPagesAction,
  inviteSellerPortalAction,
  setSellerPartnerAdminAction,
  inviteShowOpsMemberAction,
  removeShowOpsMemberAction,
  updateShowOpsBrandingAction,
  updateShowOpsDailyReportAction,
  updateShowOpsMyNameAction,
  updateShowOpsOpsConfigAction,
} from "@/app/dashboard/show-ops/actions";
import { sendDigestSampleAction } from "@/app/dashboard/show-ops/actions-reports";
import {
  MemberIslandsForm,
  IslandScopeFields,
} from "@/components/show-ops/member-islands-form";
import { isGlobalShowOpsAdmin } from "@/lib/show-ops/island-access";
import { requireShowOpsPage } from "@/lib/show-ops/access";
import {
  showOpsAllowedPages,
  SHOW_OPS_PAGE_KEYS,
  SHOW_OPS_PAGE_LABELS,
  SHOW_OPS_SENIOR_PAGE_KEYS,
} from "@/lib/show-ops/nav";
import { ShowOpsPageHeader } from "@/components/show-ops/show-ops-page-header";
import { NumberInput } from "@/components/ui/number-input";

export default async function ShowOpsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    seller?: string;
    seller_error?: string;
    sample_sent?: string;
    sample_error?: string;
  }>;
}) {
  const sp = await searchParams;
  const ctx = await requireShowOpsPage("settings");
  if (!isGlobalShowOpsAdmin(ctx.role, ctx.allowedIslands)) {
    return (
      <div className="space-y-4">
        <ShowOpsPageHeader
          eyebrow="Settings"
          title="Your access"
          subtitle="Global settings and permission management are available to the owner and administrators with all-island access."
        />
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <p className="text-sm text-slate-700">Role: {ctx.role}</p>
          <p className="mt-2 text-sm text-slate-700">
            Islands:{" "}
            {ctx.allowedIslands === null
              ? "All islands"
              : ctx.allowedIslands.length
                ? ctx.allowedIslands.join(", ")
                : "No islands"}
          </p>
          <p className="mt-3 text-sm text-slate-500">
            Contact an administrator with all-island access to change your
            permissions or workspace settings.
          </p>
        </section>
      </div>
    );
  }
  const b = ctx.branding;
  const [{ data: members }, { data: suppliers }] = await Promise.all([
    ctx.supabase
      .from("show_ops_members")
      .select(
        "id,user_id,role,supplier_id,created_at,allowed_pages,display_name,partner_admin,allowed_islands",
      )
      .eq("business_id", ctx.business.id)
      .order("created_at"),
    ctx.supabase
      .from("show_suppliers")
      .select("id,name")
      .eq("business_id", ctx.business.id)
      .eq("active", true)
      .order("name"),
  ]);

  const { data: myProfile } = await ctx.supabase
    .from("profiles")
    .select("full_name")
    .eq("id", ctx.user.id)
    .maybeSingle();
  const myName = (myProfile?.full_name as string | null) ?? null;

  const memberIds = [
    ...new Set([
      ctx.business.owner_id,
      ...(members ?? []).map((m) => m.user_id),
    ]),
  ];
  const { data: profiles } = memberIds.length
    ? await ctx.supabase
        .from("profiles")
        .select("id,email,full_name")
        .in("id", memberIds)
    : {
        data: [] as {
          id: string;
          email: string | null;
          full_name: string | null;
        }[],
      };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const staffMembers = (members ?? []).filter((m) => m.role !== "seller");
  const sellerMembers = (members ?? []).filter((m) => m.role === "seller");
  const supplierName = new Map((suppliers ?? []).map((s) => [s.id, s.name]));

  return (
    <div className="space-y-8">
      <ShowOpsPageHeader
        eyebrow="Settings"
        title="Settings"
        subtitle="Staff, seller portals, branding and ops customisation for this workspace."
      />
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
        <h2 className="font-semibold">Staff & permissions</h2>
        <p className="mt-1 text-sm text-slate-600">
          Create a login for a member of staff and tick exactly what they can
          see. Venue check-in staff normally need <strong>Door</strong> (live
          arrivals) and <strong>Night lists</strong> (printed office / bus /
          dietary sheets) and nothing else. The owner always has full access.
        </p>
        <form
          action={createShowOpsStaffAction}
          className="mt-4 grid gap-3 sm:grid-cols-3"
        >
          <label className="text-sm">
            Name
            <input
              name="display_name"
              placeholder="Maria at the door"
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Email (their login)
            <input
              name="email"
              type="email"
              required
              placeholder="maria@mht.example"
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Password
            <input
              name="password"
              type="text"
              required
              minLength={8}
              placeholder="at least 8 characters"
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Role
            <select
              name="role"
              defaultValue="booker"
              className="mt-1 w-full rounded-lg border px-3 py-2"
            >
              <option value="booker">Booker — takes bookings</option>
              <option value="office">Office — bookings + operations</option>
              <option value="finance">Finance — adds invoicing</option>
              <option value="admin">Admin — full access</option>
            </select>
          </label>
          <fieldset className="sm:col-span-3 rounded-xl border border-slate-200 p-3">
            <legend className="px-1 text-sm font-medium">
              Pages this person can open
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {SHOW_OPS_PAGE_KEYS.filter((k) => k !== "settings").map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="pages"
                    value={key}
                    defaultChecked={key === "lists"}
                    className="h-4 w-4"
                  />
                  {SHOW_OPS_PAGE_LABELS[key]}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Shows, Partners, Hotels & pick-ups and Settings require owner or
              admin access, even if ticked. Booking staff can still use the
              catalogue when taking bookings.
            </p>
          </fieldset>
          <div className="sm:col-span-3">
            <IslandScopeFields islands={ctx.config.islands} />
          </div>
          <button
            type="submit"
            className="sm:col-span-3 rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Create staff login
          </button>
        </form>

        <details className="mt-4 rounded-xl bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Add someone who already has a Solvio login
          </summary>
          <form
            action={inviteShowOpsMemberAction}
            className="mt-3 grid gap-3 sm:grid-cols-3"
          >
            <label className="text-sm sm:col-span-2">
              Email
              <input
                name="email"
                type="email"
                required
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Role
              <select
                name="role"
                defaultValue="office"
                className="mt-1 w-full rounded-lg border px-3 py-2"
              >
                <option value="booker">Booker</option>
                <option value="office">Office</option>
                <option value="finance">Finance</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <div className="sm:col-span-3">
              <IslandScopeFields islands={ctx.config.islands} />
            </div>
            <button
              type="submit"
              className="sm:col-span-3 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Add existing user
            </button>
          </form>
        </details>
        <ul className="mt-4 divide-y text-sm">
          <li className="flex justify-between py-2">
            <span>
              {profileById.get(ctx.business.owner_id)?.email ||
                (ctx.isOwner ? ctx.user.email : "Workspace owner")}{" "}
              <span className="text-slate-500">(owner)</span>
            </span>
            <span className="font-medium">owner · All islands</span>
          </li>
          {(staffMembers ?? []).map((m) => {
            const p = profileById.get(m.user_id);
            return (
              <li key={m.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {(m as { display_name?: string | null }).display_name ||
                      p?.full_name ||
                      p?.email ||
                      m.user_id.slice(0, 8)}
                    {p?.email ? (
                      <span className="ml-2 text-xs text-slate-500">
                        {p.email}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-medium">{m.role}</span>
                    {(ctx.isOwner ||
                      ctx.role === "admin" ||
                      ctx.role === "owner") &&
                    m.user_id !== ctx.user.id ? (
                      <form action={removeShowOpsMemberAction}>
                        <input type="hidden" name="member_id" value={m.id} />
                        <button
                          type="submit"
                          className="text-xs text-rose-700 hover:underline"
                        >
                          Remove
                        </button>
                      </form>
                    ) : null}
                  </span>
                </div>
                <MemberIslandsForm
                  key={JSON.stringify(m.allowed_islands)}
                  memberId={m.id}
                  islands={ctx.config.islands}
                  allowedIslands={m.allowed_islands ?? null}
                  isSelf={m.user_id === ctx.user.id}
                />
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-slate-500 hover:underline">
                    Can open:{" "}
                    {showOpsAllowedPages(
                      m.role,
                      (m as { allowed_pages?: string[] | null }).allowed_pages,
                    )
                      .map((k) => SHOW_OPS_PAGE_LABELS[k])
                      .join(", ") || "nothing"}
                  </summary>
                  <form
                    action={updateShowOpsMemberPagesAction}
                    className="mt-2 rounded-xl bg-slate-50 p-3"
                  >
                    <input type="hidden" name="member_id" value={m.id} />
                    <div className="grid gap-2 sm:grid-cols-3">
                      {SHOW_OPS_PAGE_KEYS.filter((k) => k !== "settings").map(
                        (key) => (
                          <label
                            key={key}
                            className="flex items-center gap-2 text-xs"
                          >
                            <input
                              type="checkbox"
                              name="pages"
                              value={key}
                              disabled={
                                m.role !== "owner" &&
                                m.role !== "admin" &&
                                SHOW_OPS_SENIOR_PAGE_KEYS.includes(key)
                              }
                              defaultChecked={showOpsAllowedPages(
                                m.role,
                                (m as { allowed_pages?: string[] | null })
                                  .allowed_pages,
                              ).includes(key)}
                              className="h-4 w-4"
                            />
                            {SHOW_OPS_PAGE_LABELS[key]}
                          </label>
                        ),
                      )}
                    </div>
                    {m.role !== "seller" ? (
                      <label className="mt-3 block text-xs text-slate-600">
                        Books for (pre-selected on their new-booking form)
                        <select
                          name="default_supplier_id"
                          defaultValue={m.supplier_id ?? ""}
                          className="mt-1 block w-full max-w-sm rounded-lg border px-2 py-1.5 text-sm"
                        >
                          <option value="">
                            — no partner, they pick every time —
                          </option>
                          {(suppliers ?? []).map((sup) => (
                            <option key={sup.id} value={sup.id}>
                              {sup.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <button
                      type="submit"
                      className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Save pages
                    </button>
                  </form>
                  <form
                    action={resetShowOpsStaffPasswordAction}
                    className="mt-2 flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="member_id" value={m.id} />
                    <label className="text-xs">
                      New password
                      <input
                        name="password"
                        type="text"
                        minLength={8}
                        required
                        className="mt-1 block rounded-lg border px-2 py-1.5 text-sm"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800"
                    >
                      Reset password
                    </button>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold">Seller portals</h2>
        <p className="mt-1 text-sm text-slate-600">
          Each partner can have several seller logins. Send a secure one-time
          sign-in link, then use Make admin to give their manager permission to
          invite sellers and see organisation sales. Ordinary sellers see only
          their own bookings and results.
        </p>
        {sp.seller === "sent" ? (
          <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
            Invitation submitted to the email provider with a secure one-time
            sign-in link.
          </p>
        ) : null}
        {sp.seller_error ? (
          <p
            role="alert"
            className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            {sp.seller_error}
          </p>
        ) : null}
        <form
          action={inviteSellerPortalAction}
          className="mt-4 grid gap-3 sm:grid-cols-3"
        >
          <label className="text-sm">
            Partner / supplier
            <select
              name="supplier_id"
              required
              className="mt-1 w-full rounded-lg border px-3 py-2"
            >
              <option value="">Select…</option>
              {(suppliers ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            Email to send login
            <input
              name="email"
              type="email"
              required
              placeholder="bookings@partner.com"
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <div className="sm:col-span-3">
            <IslandScopeFields islands={ctx.config.islands} />
          </div>
          <button
            type="submit"
            className="sm:col-span-3 rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Send or resend sign-in link
          </button>
        </form>
        <ul className="mt-4 divide-y text-sm">
          {sellerMembers.map((m) => {
            const p = profileById.get(m.user_id);
            return (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  {p?.email || m.user_id.slice(0, 8)}{" "}
                  {m.partner_admin ? (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <Crown className="h-4 w-4" aria-hidden="true" /> Admin
                    </span>
                  ) : null}{" "}
                  <span className="text-slate-500">
                    · {supplierName.get(m.supplier_id || "") || "supplier"}
                  </span>
                </span>
                {ctx.isOwner || ctx.role === "admin" || ctx.role === "owner" ? (
                  <div className="flex items-center gap-3">
                    <form action={setSellerPartnerAdminAction}>
                      <input type="hidden" name="member_id" value={m.id} />
                      <input
                        type="hidden"
                        name="partner_admin"
                        value={m.partner_admin ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        className="text-xs text-violet-700 hover:underline"
                      >
                        {m.partner_admin ? "Remove admin role" : "Make admin"}
                      </button>
                    </form>
                    <form action={removeShowOpsMemberAction}>
                      <input type="hidden" name="member_id" value={m.id} />
                      <button
                        type="submit"
                        className="text-xs text-rose-700 hover:underline"
                      >
                        Revoke
                      </button>
                    </form>
                  </div>
                ) : null}
                <MemberIslandsForm
                  key={JSON.stringify(m.allowed_islands)}
                  memberId={m.id}
                  islands={ctx.config.islands}
                  allowedIslands={m.allowed_islands ?? null}
                  isSelf={m.user_id === ctx.user.id}
                />
              </li>
            );
          })}
          {!sellerMembers.length ? (
            <li className="py-2 text-slate-500">No seller logins yet.</li>
          ) : null}
        </ul>
      </section>

      <section
        id="daily-email"
        className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200"
      >
        <h2 className="font-semibold">In-house daily email</h2>
        <p className="mt-1 text-sm text-slate-600">
          Morning digest (07:00) of yesterday’s bookings (by show and partner),
          last night on the shows, tonight’s bus seats / spend / cost per head,
          and any overdue invoices to chase. Leave blank to skip.
        </p>
        {sp.sample_sent ? (
          <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
            Sent to {sp.sample_sent} — check your inbox.
          </p>
        ) : null}
        {sp.sample_error ? (
          <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-900 ring-1 ring-rose-200">
            Not sent: {sp.sample_error}
          </p>
        ) : null}
        <form
          action={updateShowOpsDailyReportAction}
          className="mt-4 space-y-3"
        >
          <label className="block text-sm">
            Office emails (one per line)
            <textarea
              name="office_report_emails"
              rows={3}
              defaultValue={ctx.config.office_report_emails.join("\n")}
              placeholder="office@mht.example"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Save daily email
          </button>
        </form>
        <form
          action={sendDigestSampleAction}
          className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4"
        >
          <button
            type="submit"
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Send me a sample
          </button>
          <span className="text-xs text-slate-500">
            Builds this morning’s digest with live data and emails it to{" "}
            {ctx.user.email || "your login"} only.
          </span>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold">Your name</h2>
        <p className="mt-1 text-sm text-slate-600">
          Used for your greeting and the sidebar — e.g. &ldquo;Welcome back,
          Joel&rdquo;. Only changes what you see.
        </p>
        <form
          action={updateShowOpsMyNameAction}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <label className="text-sm">
            Name
            <input
              name="full_name"
              defaultValue={myName ?? ""}
              placeholder="Joel"
              className="mt-1 block min-w-[14rem] rounded-lg border px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Save name
          </button>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold">White-label branding</h2>
        <p className="mt-1 text-sm text-slate-600">
          Workspace name, logo, colours, and custom domain (point DNS CNAME to
          Solvio, then enter hostname here).
        </p>
        <form
          action={updateShowOpsBrandingAction}
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          <label className="text-sm sm:col-span-2">
            Workspace name
            <input
              name="display_name"
              defaultValue={b.displayName}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">
              What your team calls this system. Shown in the sidebar, on the
              dashboard heading, in the browser tab, on printed lists and on
              guest emails.
            </span>
          </label>
          <label className="text-sm sm:col-span-2">
            Logo URL
            <input
              name="logo_url"
              defaultValue={b.logoUrl ?? ""}
              placeholder="https://yourbrand.com/logo.png"
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Paste a link to your logo (PNG or SVG, transparent background
              works best).
            </span>
          </label>
          {b.logoUrl ? (
            <div className="sm:col-span-2 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-xs font-medium text-slate-500">
                Current logo
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={b.logoUrl}
                alt=""
                className="h-8 w-auto max-w-[10rem] object-contain"
              />
            </div>
          ) : null}
          <label className="text-sm">
            Primary colour
            <input
              name="primary_color"
              type="color"
              defaultValue={b.primaryColor}
              className="mt-1 h-10 w-full rounded-lg border"
            />
          </label>
          <label className="text-sm">
            Accent colour
            <input
              name="accent_color"
              type="color"
              defaultValue={b.accentColor}
              className="mt-1 h-10 w-full rounded-lg border"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Custom domain
            <input
              name="custom_domain"
              placeholder="ops.yourbrand.com"
              defaultValue={b.customDomain ?? ""}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="sm:col-span-2 rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Save branding
          </button>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold">Ops customisation</h2>
        <p className="mt-1 text-sm text-slate-600">
          Shape Solvio for your business — boat parties, show desks, day trips.
          Labels, regions, sales channels, dietary options and extra booking
          questions.
        </p>
        <form action={updateShowOpsOpsConfigAction} className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Product label
              <input
                name="product_label"
                defaultValue={ctx.config.product_label}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                placeholder="Trip / ticket"
              />
            </label>
            <label className="text-sm">
              Location label
              <input
                name="location_label"
                defaultValue={ctx.config.location_label}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                placeholder="Island / Region"
              />
            </label>
            <label className="text-sm">
              Currency
              <select
                name="currency"
                defaultValue={ctx.config.currency}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              >
                <option value="eur">EUR €</option>
                <option value="gbp">GBP £</option>
                <option value="usd">USD $</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="guest_stripe_enabled"
                value="1"
                defaultChecked={ctx.config.guest_stripe_enabled}
              />
              Email Stripe payment links for guest deposits
            </label>
          </div>
          <label className="block max-w-sm text-sm">
            Transport supplement per head
            <input
              type="number"
              name="transport_supplement"
              min={0}
              step="0.01"
              defaultValue={ctx.config.transport_supplement}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Added to every adult and child when a booking takes the bus.
              Infants never pay it, and partner commission is still worked out
              on the full total. Set 0 to turn it off. A show that carries its
              own without-transport price keeps that pair instead.
            </span>
          </label>
          <label className="block text-sm">
            {ctx.config.location_label}s (one per line)
            <textarea
              name="islands"
              rows={3}
              defaultValue={ctx.config.islands.join("\n")}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            Partner types (one per line)
            <textarea
              name="partner_types"
              rows={2}
              defaultValue={ctx.config.partner_types.join("\n")}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            Sales channels (one per line)
            <textarea
              name="sales_channels"
              rows={2}
              defaultValue={ctx.config.sales_channels.join("\n")}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Dietary mode
              <select
                name="dietary_mode"
                defaultValue={ctx.config.dietary_mode}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              >
                <option value="free_text">Free text</option>
                <option value="options">Checklist + notes</option>
              </select>
            </label>
            <label className="text-sm">
              Dietary options (one per line)
              <textarea
                name="dietary_options"
                rows={2}
                defaultValue={ctx.config.dietary_options.join("\n")}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="Gluten free&#10;Vegetarian"
              />
            </label>
          </div>

          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-800">
              Custom booking questions
            </p>
            <p className="text-xs text-slate-500">
              Shown on New / Edit booking. Leave a label blank to remove a row.
              Add empty rows below for new questions.
            </p>
            {[
              ...ctx.config.booking_questions,
              { id: "", label: "", type: "text" as const },
              { id: "", label: "", type: "text" as const },
            ].map((q, i) => (
              <div
                key={`${q.id || "new"}-${i}`}
                className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-6"
              >
                <input type="hidden" name="q_id" value={q.id} />
                <label className="text-xs sm:col-span-2">
                  Label
                  <input
                    name="q_label"
                    defaultValue={q.label}
                    className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                    placeholder="e.g. Cabin preference"
                  />
                </label>
                <label className="text-xs">
                  Type
                  <select
                    name="q_type"
                    defaultValue={q.type}
                    className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                  >
                    <option value="text">Text</option>
                    <option value="textarea">Long text</option>
                    <option value="select">Select</option>
                    <option value="checkbox">Checkbox</option>
                    <option value="number">Number</option>
                  </select>
                </label>
                <label className="text-xs sm:col-span-2">
                  Options (select only)
                  <input
                    name="q_options"
                    defaultValue={(q.options ?? []).join(", ")}
                    className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                    placeholder="A, B, C"
                  />
                </label>
                <div className="flex flex-col justify-end gap-1 text-xs">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      name={`q_required_${i}`}
                      value="1"
                      defaultChecked={Boolean(q.required)}
                    />{" "}
                    Required
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      name={`q_office_list_${i}`}
                      value="1"
                      defaultChecked={Boolean(q.show_on_office_list)}
                    />{" "}
                    On office list
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-800">
              Invoice issuer (Verifactu-ready)
            </p>
            <p className="text-xs text-slate-500">
              Used when you issue an invoice. Default is 7% (Canaries IGIC).
              Change it here for this business — UK VAT, other islands, or 0% if
              you do not charge tax. Each invoice line can still override it.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Series
                <input
                  name="invoice_series"
                  defaultValue={ctx.config.invoice.series}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  placeholder="MHT"
                />
              </label>
              <label className="text-sm">
                Default tax %
                <NumberInput
                  name="invoice_vat_rate"
                  defaultValue={ctx.config.invoice.defaultVatRate}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                Legal name
                <input
                  name="invoice_issuer_name"
                  defaultValue={ctx.config.invoice.issuerName}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  placeholder={ctx.branding.displayName}
                />
              </label>
              <label className="text-sm">
                NIF / tax ID
                <input
                  name="invoice_issuer_tax_id"
                  defaultValue={ctx.config.invoice.issuerTaxId}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </label>
              <label className="text-sm">
                Address
                <input
                  name="invoice_issuer_address"
                  defaultValue={ctx.config.invoice.issuerAddress}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </label>
            </div>
          </div>

          <button
            type="submit"
            className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Save ops customisation
          </button>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold">CSV import</h2>
        <p className="mt-1 text-sm text-slate-600">
          Headers: suppliers → name,partner_type,billing_mode,deposit_percent ·
          hotels → name,island · stops →
          island,resort,stop_name,pickup_time,sort_order
        </p>
        <form action={importCsvAction} className="mt-3 space-y-3">
          <select name="kind" className="rounded-lg border px-3 py-2 text-sm">
            <option value="suppliers">Suppliers</option>
            <option value="hotels">Hotels</option>
            <option value="stops">Bus stops</option>
          </select>
          <textarea
            name="csv"
            rows={6}
            placeholder="name,partner_type,..."
            className="w-full rounded-lg border px-3 py-2 font-mono text-xs"
          />
          <button
            type="submit"
            className="rounded-lg bg-[var(--show-ops-primary,#7c3aed)] px-3 py-2 text-sm text-white"
          >
            Import
          </button>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold">Backup</h2>
        <p className="mt-2 text-sm">
          <a href="/api/show-ops/export" className="underline">
            Download JSON backup
          </a>{" "}
          ·{" "}
          <a href="/dashboard/show-ops/backup" className="underline">
            Plan B runbook
          </a>
        </p>
      </section>
    </div>
  );
}
