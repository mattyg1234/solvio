import {
  importCsvAction,
  inviteSellerPortalAction,
  inviteShowOpsMemberAction,
  removeShowOpsMemberAction,
  updateShowOpsBrandingAction,
  updateShowOpsDailyReportAction,
  updateShowOpsMyNameAction,
  updateShowOpsOpsConfigAction,
} from "@/app/dashboard/show-ops/actions";
import { requireShowOpsEnabled } from "@/lib/show-ops/access";
import { ShowOpsPageHeader } from "@/components/show-ops/show-ops-page-header";
import { NumberInput } from "@/components/ui/number-input";

export default async function ShowOpsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ seller?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireShowOpsEnabled();
  const b = ctx.branding;
  const [{ data: members }, { data: suppliers }] = await Promise.all([
    ctx.supabase
      .from("show_ops_members")
      .select("id,user_id,role,supplier_id,created_at")
      .eq("business_id", ctx.business.id)
      .order("created_at"),
    ctx.supabase.from("show_suppliers").select("id,name").eq("business_id", ctx.business.id).eq("active", true).order("name"),
  ]);

  const { data: myProfile } = await ctx.supabase
    .from("profiles")
    .select("full_name")
    .eq("id", ctx.user.id)
    .maybeSingle();
  const myName = (myProfile?.full_name as string | null) ?? null;

  const memberIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = memberIds.length
    ? await ctx.supabase.from("profiles").select("id,email,full_name").in("id", memberIds)
    : { data: [] as { id: string; email: string | null; full_name: string | null }[] };
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
        <h2 className="font-semibold">Users & permissions</h2>
        <p className="mt-1 text-sm text-slate-600">
          Owner always has full access. Invite staff who already have a Solvio login — roles: booker, office, finance,
          admin.
        </p>
        <form action={inviteShowOpsMemberAction} className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm sm:col-span-2">
            Email
            <input
              name="email"
              type="email"
              required
              placeholder="colleague@mht.example"
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Role
            <select name="role" defaultValue="office" className="mt-1 w-full rounded-lg border px-3 py-2">
              <option value="booker">Booker</option>
              <option value="office">Office</option>
              <option value="finance">Finance</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button type="submit" className="sm:col-span-3 rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2.5 text-sm font-semibold text-white">
            Invite / update member
          </button>
        </form>
        <ul className="mt-4 divide-y text-sm">
          <li className="flex justify-between py-2">
            <span>
              {ctx.user.email || "Owner"} <span className="text-slate-500">(owner)</span>
            </span>
            <span className="font-medium">admin</span>
          </li>
          {(staffMembers ?? []).map((m) => {
            const p = profileById.get(m.user_id);
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{p?.full_name || p?.email || m.user_id.slice(0, 8)}</span>
                <span className="flex items-center gap-3">
                  <span className="font-medium">{m.role}</span>
                  {(ctx.isOwner || ctx.role === "admin" || ctx.role === "owner") && m.user_id !== ctx.user.id ? (
                    <form action={removeShowOpsMemberAction}>
                      <input type="hidden" name="member_id" value={m.id} />
                      <button type="submit" className="text-xs text-rose-700 hover:underline">
                        Remove
                      </button>
                    </form>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold">Seller portals</h2>
        <p className="mt-1 text-sm text-slate-600">
          Each partner can have several logins (front desk, manager, and so on). Type an email and Solvio sends the
          link + password automatically. After the first invite, they can add their own colleagues from their seller
          page — you do not have to create every login.
        </p>
        {sp.seller === "sent" ? (
          <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
            Invite emailed — they got the link, email (ID), and password (or a note to use their existing Solvio
            password).
          </p>
        ) : null}
        <form action={inviteSellerPortalAction} className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            Partner / supplier
            <select name="supplier_id" required className="mt-1 w-full rounded-lg border px-3 py-2">
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
            <input name="email" type="email" required placeholder="bookings@partner.com" className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          <button type="submit" className="sm:col-span-3 rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2.5 text-sm font-semibold text-white">
            Email seller link + password
          </button>
        </form>
        <ul className="mt-4 divide-y text-sm">
          {sellerMembers.map((m) => {
            const p = profileById.get(m.user_id);
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {p?.email || m.user_id.slice(0, 8)}{" "}
                  <span className="text-slate-500">· {supplierName.get(m.supplier_id || "") || "supplier"}</span>
                </span>
                {(ctx.isOwner || ctx.role === "admin" || ctx.role === "owner") ? (
                  <form action={removeShowOpsMemberAction}>
                    <input type="hidden" name="member_id" value={m.id} />
                    <button type="submit" className="text-xs text-rose-700 hover:underline">
                      Revoke
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
          {!sellerMembers.length ? <li className="py-2 text-slate-500">No seller logins yet.</li> : null}
        </ul>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold">In-house daily email</h2>
        <p className="mt-1 text-sm text-slate-600">
          Morning digest of yesterday’s bookings (by show and partner), last night on the shows, and tonight’s bus
          seats / spend / cost per head. Leave blank to skip. We can reshape it once you say what the old report was
          missing.
        </p>
        <form action={updateShowOpsDailyReportAction} className="mt-4 space-y-3">
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
          <button type="submit" className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2.5 text-sm font-semibold text-white">
            Save daily email
          </button>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold">Your name</h2>
        <p className="mt-1 text-sm text-slate-600">
          Used for your greeting and the sidebar — e.g. &ldquo;Welcome back, Joel&rdquo;. Only changes what you see.
        </p>
        <form action={updateShowOpsMyNameAction} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Name
            <input
              name="full_name"
              defaultValue={myName ?? ""}
              placeholder="Joel"
              className="mt-1 block min-w-[14rem] rounded-lg border px-3 py-2"
            />
          </label>
          <button type="submit" className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2.5 text-sm font-semibold text-white">
            Save name
          </button>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold">White-label branding</h2>
        <p className="mt-1 text-sm text-slate-600">
          Workspace name, logo, colours, and custom domain (point DNS CNAME to Solvio, then enter hostname here).
        </p>
        <form action={updateShowOpsBrandingAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            Workspace name
            <input name="display_name" defaultValue={b.displayName} className="mt-1 w-full rounded-lg border px-3 py-2" />
            <span className="mt-1 block text-xs text-slate-500">Shown in the sidebar, on printed lists and on guest emails.</span>
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
              Paste a link to your logo (PNG or SVG, transparent background works best).
            </span>
          </label>
          {b.logoUrl ? (
            <div className="sm:col-span-2 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-xs font-medium text-slate-500">Current logo</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.logoUrl} alt="" className="h-8 w-auto max-w-[10rem] object-contain" />
            </div>
          ) : null}
          <label className="text-sm">
            Primary colour
            <input name="primary_color" type="color" defaultValue={b.primaryColor} className="mt-1 h-10 w-full rounded-lg border" />
          </label>
          <label className="text-sm">
            Accent colour
            <input name="accent_color" type="color" defaultValue={b.accentColor} className="mt-1 h-10 w-full rounded-lg border" />
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
          <button type="submit" className="sm:col-span-2 rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2.5 text-sm font-semibold text-white">
            Save branding
          </button>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold">Ops customisation</h2>
        <p className="mt-1 text-sm text-slate-600">
          Shape Solvio for your business — boat parties, show desks, day trips. Labels, regions, sales channels,
          dietary options and extra booking questions.
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
              <select name="currency" defaultValue={ctx.config.currency} className="mt-1 w-full rounded-lg border px-3 py-2">
                <option value="eur">EUR €</option>
                <option value="gbp">GBP £</option>
                <option value="usd">USD $</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="guest_stripe_enabled" value="1" defaultChecked={ctx.config.guest_stripe_enabled} />
              Email Stripe payment links for guest deposits
            </label>
          </div>
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
            <p className="text-sm font-medium text-slate-800">Custom booking questions</p>
            <p className="text-xs text-slate-500">
              Shown on New / Edit booking. Leave a label blank to remove a row. Add empty rows below for new
              questions.
            </p>
            {[...ctx.config.booking_questions, { id: "", label: "", type: "text" as const }, { id: "", label: "", type: "text" as const }].map(
              (q, i) => (
                <div key={`${q.id || "new"}-${i}`} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-6">
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
                    <select name="q_type" defaultValue={q.type} className="mt-1 w-full rounded border px-2 py-1.5 text-sm">
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
              ),
            )}
          </div>

          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-800">Invoice issuer (Verifactu-ready)</p>
            <p className="text-xs text-slate-500">
              Used when you issue an invoice. Default is 7% (Canaries IGIC). Change it here for this business —
              UK VAT, other islands, or 0% if you do not charge tax. Each invoice line can still override it.
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

          <button type="submit" className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2.5 text-sm font-semibold text-white">
            Save ops customisation
          </button>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold">CSV import</h2>
        <p className="mt-1 text-sm text-slate-600">
          Headers: suppliers → name,partner_type,billing_mode,deposit_percent · hotels → name,island · stops →
          island,resort,stop_name,pickup_time,sort_order
        </p>
        <form action={importCsvAction} className="mt-3 space-y-3">
          <select name="kind" className="rounded-lg border px-3 py-2 text-sm">
            <option value="suppliers">Suppliers</option>
            <option value="hotels">Hotels</option>
            <option value="stops">Bus stops</option>
          </select>
          <textarea name="csv" rows={6} placeholder="name,partner_type,..." className="w-full rounded-lg border px-3 py-2 font-mono text-xs" />
          <button type="submit" className="rounded-lg bg-[var(--show-ops-primary,#7c3aed)] px-3 py-2 text-sm text-white">
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
