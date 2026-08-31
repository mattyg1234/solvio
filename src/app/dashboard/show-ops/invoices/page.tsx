import {
  generateAllInvoicePacksAction,
  generateInvoicePackAction,
  markInvoicePaidAction,
  voidInvoiceAction,
} from "@/app/dashboard/show-ops/actions";
import { SubmitOnce } from "@/components/show-ops/submit-once";
import { ShowOpsPageHeader, ShowOpsPill } from "@/components/show-ops/show-ops-page-header";
import { requireShowOpsPage } from "@/lib/show-ops/access";
import { applyNoShowBilling, formatShowOpsMoney, resolveArrivedPax, round2 } from "@/lib/show-ops/calc";
import { hasShowOpsModule, showOpsCurrencyFor } from "@/lib/show-ops/config";
import { calendarMonthBounds, shiftMonth } from "@/lib/show-ops/invoice";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    period_start?: string;
    period_end?: string;
    island?: string;
    supplier_id?: string;
    as_of?: string;
    sort?: string;
    generated?: string;
  }>;
}) {
  const sp = await searchParams;
  const ctx = await requireShowOpsPage("invoices");
  if (!hasShowOpsModule(ctx.config, ctx.tier, "invoices")) {
    return <p className="text-sm text-slate-600">Invoices are not enabled for this workspace.</p>;
  }

  const view = sp.view || "generate";
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = calendarMonthBounds(today);
  const lastMonth = calendarMonthBounds(shiftMonth(today, -1));
  const periodStart = sp.period_start || thisMonth.start;
  const periodEnd = sp.period_end || thisMonth.end;
  const asOf = sp.as_of || today;
  const sort = sp.sort || "owed";
  const money = (n: number, cur?: string | null) =>
    formatShowOpsMoney(n, cur === "gbp" || cur === "usd" || cur === "eur" ? cur : ctx.config.currency);

  const [{ data: suppliers }, { data: invoiceRows }] = await Promise.all([
    ctx.supabase
      .from("show_suppliers")
      .select("id,name")
      .eq("business_id", ctx.business.id)
      .eq("billing_mode", "invoice")
      .order("name"),
    ctx.supabase
      .from("show_invoices")
      .select("*")
      .eq("business_id", ctx.business.id)
      .eq("voided", false)
      .order("invoice_date", { ascending: false })
      .limit(500),
  ]);

  const { data: overdue } = await ctx.supabase
    .from("show_invoices")
    .select("*")
    .eq("business_id", ctx.business.id)
    .eq("paid", false)
    .eq("voided", false)
    .lt("due_date", asOf)
    .order("due_date");

  const invoices = [...(invoiceRows ?? [])].sort((a, b) => {
    const owedA = a.paid ? 0 : Number(a.total_amount || 0);
    const owedB = b.paid ? 0 : Number(b.total_amount || 0);
    if (sort === "owed") return owedB - owedA || String(b.invoice_date || "").localeCompare(String(a.invoice_date || ""));
    if (sort === "supplier") return String(a.supplier_name || "").localeCompare(String(b.supplier_name || ""));
    if (sort === "due") return String(a.due_date || "9999").localeCompare(String(b.due_date || "9999"));
    return String(b.invoice_date || "").localeCompare(String(a.invoice_date || ""));
  });

  let previewRows: Array<{
    supplier_id: string | null;
    supplier_name: string | null;
    guest_name: string;
    booking_ref: string;
    supplier_ticket_number: string | null;
    adults: number;
    children: number;
    adult_nett_total: number;
    child_nett_total: number;
    nett_total: number;
    show_date: string;
    island: string | null;
  }> = [];

  if (view === "generate") {
    let q = ctx.supabase
      .from("show_bookings")
      .select(
        "supplier_id,supplier_name,guest_name,booking_ref,supplier_ticket_number,island,adults,children,infants,adult_nett_total,child_nett_total,nett_total,total_cost,show_date,arrived_pax,arrived_at,no_show,no_show_charge",
      )
      .eq("business_id", ctx.business.id)
      .eq("billing_mode", "invoice")
      .is("invoice_id", null)
      .is("cancelled_at", null)
      .gte("show_date", periodStart)
      .lte("show_date", periodEnd)
      .order("supplier_name")
      .order("guest_name");
    if (sp.island) q = q.eq("island", sp.island);
    if (sp.supplier_id) q = q.eq("supplier_id", sp.supplier_id);
    const { data } = await q;
    previewRows = (data ?? []).map((r) => {
      const arrival = resolveArrivedPax({
        adults: Number(r.adults),
        children: Number(r.children),
        infants: Number(r.infants),
        arrivedPax: r.arrived_pax,
        arrivedAt: r.arrived_at,
        noShow: r.no_show,
      });
      const billed = applyNoShowBilling({
        booked: arrival.booked,
        arrived: arrival.arrived,
        totalCost: Number(r.total_cost),
        nettTotal: Number(r.nett_total),
        adultNettTotal: Number(r.adult_nett_total),
        childNettTotal: Number(r.child_nett_total),
        charge: r.no_show_charge,
      });
      return {
        supplier_id: r.supplier_id,
        supplier_name: r.supplier_name,
        guest_name: r.guest_name,
        booking_ref: r.booking_ref,
        supplier_ticket_number: r.supplier_ticket_number,
        adults: Number(r.adults),
        children: Number(r.children),
        adult_nett_total: billed.billedAdultNett,
        child_nett_total: billed.billedChildNett,
        nett_total: billed.billedNett,
        show_date: r.show_date,
        island: (r as { island?: string | null }).island ?? null,
      };
    });
  }

  const previewBySupplier = new Map<string, { name: string; id: string; rows: typeof previewRows }>();
  for (const r of previewRows) {
    const id = r.supplier_id || "unknown";
    const cur = previewBySupplier.get(id) || {
      name: r.supplier_name || "Supplier",
      id,
      rows: [],
    };
    cur.rows.push(r);
    previewBySupplier.set(id, cur);
  }

  const invoiceIds = (invoices ?? []).map((i) => i.id);
  type InvLine = {
    id: string;
    invoice_id: string;
    guest_name: string;
    booking_ref: string;
    supplier_ticket_number: string | null;
    adults: number;
    children: number;
    adult_nett_total: number;
    child_nett_total: number;
    line_total: number;
  };
  const { data: allLines } = invoiceIds.length
    ? await ctx.supabase
        .from("show_invoice_lines")
        .select(
          "id,invoice_id,guest_name,booking_ref,supplier_ticket_number,adults,children,adult_nett_total,child_nett_total,line_total",
        )
        .eq("business_id", ctx.business.id)
        .in("invoice_id", invoiceIds)
    : { data: [] as InvLine[] };
  const linesByInvoice = new Map<string, InvLine[]>();
  for (const line of (allLines ?? []) as InvLine[]) {
    const list = linesByInvoice.get(line.invoice_id) || [];
    list.push(line);
    linesByInvoice.set(line.invoice_id, list);
  }

  return (
    <div className="space-y-6">
      <ShowOpsPageHeader
        eyebrow="Operations"
        title="Invoicing"
        subtitle="Draft invoices, edit prices, issue a number. Verifactu API when you add the key."
      />
      {sp.generated ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
          Generated {sp.generated} draft invoice{sp.generated === "1" ? "" : "s"} — review and issue below.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {[
          ["generate", "Generate pack"],
          ["list", "Invoice list"],
          ["overdue", "Overdue"],
        ].map(([id, label]) => (
          <ShowOpsPill key={id} href={`/dashboard/show-ops/invoices?view=${id}`} on={view === id}>
            {label}
          </ShowOpsPill>
        ))}
      </div>

      {view === "generate" ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="font-semibold">Reservations → invoice</h2>
            <p className="mt-1 text-sm text-slate-600">
              Preview uninvoiced invoice-mode bookings, generate a draft, then edit prices before you issue.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={`/dashboard/show-ops/invoices?view=generate&period_start=${thisMonth.start}&period_end=${thisMonth.end}`}
                className="rounded-full bg-[var(--show-ops-primary,#7c3aed)]/10 px-3 py-1 text-xs font-semibold text-[var(--show-ops-primary,#7c3aed)]"
              >
                This month
              </a>
              <a
                href={`/dashboard/show-ops/invoices?view=generate&period_start=${lastMonth.start}&period_end=${lastMonth.end}`}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
              >
                Last month
              </a>
            </div>
            <form method="get" className="mt-4 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="view" value="generate" />
              <label className="text-sm">
                Period start
                <input
                  type="date"
                  name="period_start"
                  required
                  defaultValue={periodStart}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </label>
              <label className="text-sm">
                Period end
                <input
                  type="date"
                  name="period_end"
                  required
                  defaultValue={periodEnd}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </label>
              <label className="text-sm">
                Island
                <select name="island" defaultValue={sp.island || ""} className="mt-1 w-full rounded-lg border px-3 py-2">
                  <option value="">All</option>
                  {ctx.config.islands.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Supplier (optional for preview)
                <select
                  name="supplier_id"
                  defaultValue={sp.supplier_id || ""}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                >
                  <option value="">All invoice suppliers</option>
                  {(suppliers ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="sm:col-span-2 rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white">
                Preview reservations
              </button>
            </form>
          </div>

          {previewBySupplier.size > 1 ? (
            <div className="rounded-2xl bg-white p-5 ring-1 ring-[var(--show-ops-primary,#7c3aed)]/30">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">Month-end run</h3>
                <p className="text-sm text-slate-600">
                  {previewBySupplier.size} suppliers · {previewRows.length} reservations below
                </p>
              </div>
              <form action={generateAllInvoicePacksAction} className="mt-3 grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="period_start" value={periodStart} />
                <input type="hidden" name="period_end" value={periodEnd} />
                <input type="hidden" name="island" value={sp.island || ""} />
                <label className="text-sm">
                  Invoice date
                  <input type="date" name="invoice_date" defaultValue={today} className="mt-1 w-full rounded-lg border px-3 py-2" />
                </label>
                <label className="text-sm">
                  Payment terms
                  <select name="payment_terms_days" defaultValue={30} className="mt-1 w-full rounded-lg border px-3 py-2">
                    {[7, 15, 30, 45, 60, 90].map((d) => (
                      <option key={d} value={d}>
                        {d} days
                      </option>
                    ))}
                  </select>
                </label>
                <SubmitOnce className="self-end rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
                  {`Generate all ${previewBySupplier.size} supplier packs`}
                </SubmitOnce>
              </form>
              <p className="mt-2 text-xs text-slate-500">
                One draft per supplier for this period — nothing is issued until you review each pack.
              </p>
            </div>
          ) : null}
          <div className="space-y-4">
              {[...previewBySupplier.values()].map((group) => {
                const total = round2(group.rows.reduce((s, r) => s + Number(r.nett_total), 0));
                const groupIslands = new Set(group.rows.map((r) => r.island).filter(Boolean));
                const groupCurrency = showOpsCurrencyFor(ctx.config, groupIslands.size === 1 ? [...groupIslands][0] : null);
                return (
                  <div key={group.id} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-semibold">
                        {group.name} · {group.rows.length} reservations · {money(total, groupCurrency)}
                      </h3>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="text-xs uppercase text-slate-500">
                          <tr>
                            <th className="py-1 pr-3">Name</th>
                            <th className="py-1 pr-3">MHT ref</th>
                            <th className="py-1 pr-3">Ticket #</th>
                            <th className="py-1 pr-3">Adult nett</th>
                            <th className="py-1 pr-3">Child nett</th>
                            <th className="py-1">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((r) => (
                            <tr key={r.booking_ref} className="border-t">
                              <td className="py-1.5 pr-3">{r.guest_name}</td>
                              <td className="py-1.5 pr-3 font-mono text-xs">{r.booking_ref}</td>
                              <td className="py-1.5 pr-3">{r.supplier_ticket_number || "—"}</td>
                              <td className="py-1.5 pr-3">{money(Number(r.adult_nett_total), groupCurrency)}</td>
                              <td className="py-1.5 pr-3">{money(Number(r.child_nett_total), groupCurrency)}</td>
                              <td className="py-1.5">{money(Number(r.nett_total), groupCurrency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {group.id !== "unknown" ? (
                      <form action={generateInvoicePackAction} className="mt-4 grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="period_start" value={periodStart} />
                        <input type="hidden" name="period_end" value={periodEnd} />
                        <input type="hidden" name="island" value={sp.island || ""} />
                        <input type="hidden" name="supplier_id" value={group.id} />
                        <label className="text-sm">
                          Invoice date
                          <input
                            type="date"
                            name="invoice_date"
                            defaultValue={today}
                            className="mt-1 w-full rounded-lg border px-3 py-2"
                          />
                        </label>
                        <label className="text-sm">
                          Payment terms
                          <select
                            name="payment_terms_days"
                            defaultValue={30}
                            className="mt-1 w-full rounded-lg border px-3 py-2"
                          >
                            {[7, 15, 30, 45, 60, 90].map((d) => (
                              <option key={d} value={d}>
                                {d} days
                              </option>
                            ))}
                          </select>
                        </label>
                        <SubmitOnce className="self-end rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2">
                          Generate draft invoice
                        </SubmitOnce>
                      </form>
                    ) : (
                      <p className="mt-3 text-sm text-amber-700">Bookings missing supplier — fix under Edit booking.</p>
                    )}
                  </div>
                );
              })}
              {!previewRows.length ? (
                <p className="rounded-2xl bg-white p-5 text-sm text-slate-500 ring-1 ring-slate-200">
                  No uninvoiced invoice-mode reservations for {periodStart} → {periodEnd}.
                </p>
              ) : null}
            </div>
        </div>
      ) : null}

      {view === "list" ? (
        <div className="space-y-3">
          <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
            <input type="hidden" name="view" value="list" />
            <label className="text-xs font-medium text-slate-600">
              Sort
              <select name="sort" defaultValue={sort} className="mt-1 block rounded-lg border px-2 py-1.5 text-sm">
                <option value="owed">Owed (biggest first)</option>
                <option value="date">Invoice date</option>
                <option value="due">Due date</option>
                <option value="supplier">Supplier</option>
              </select>
            </label>
            <button type="submit" className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white">
              Apply
            </button>
          </form>
          {(invoices ?? []).map((inv) => {
            const lines = linesByInvoice.get(inv.id) || [];
            const guests = lines.length;
            const pax = lines.reduce((s, l) => s + Number(l.adults || 0) + Number(l.children || 0), 0);
            const owed = inv.paid ? 0 : Number(inv.total_amount || 0);
            return (
              <div key={inv.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      <a
                        href={`/dashboard/show-ops/invoices/${inv.id}`}
                        className="hover:underline"
                        style={{ color: "inherit" }}
                      >
                        {inv.supplier_name}
                      </a>{" "}
                      · {money(Number(inv.total_amount || 0), inv.currency)}
                      <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {inv.status || "draft"}
                      </span>
                      {inv.paid ? (
                        <span className="ml-2 text-xs text-emerald-600">PAID {inv.paid_at || ""}</span>
                      ) : (
                        <span className="ml-2 text-xs font-semibold text-amber-700">Owed {money(owed, inv.currency)}</span>
                      )}
                      <a
                        href={`/dashboard/show-ops/invoices/${inv.id}`}
                        className="ml-2 text-xs font-normal text-[var(--show-ops-primary,#7c3aed)] underline"
                      >
                        {inv.status === "draft" ? "Edit draft" : "Open / print"}
                      </a>
                    </p>
                    <p className="text-sm text-slate-600">
                      {inv.invoice_number || inv.verifactu_number || "No number yet"} · Invoice {inv.invoice_date || "—"} · shows{" "}
                      {inv.period_start} → {inv.period_end} · due {inv.due_date || "—"} · {guests} guests / {pax} pax
                      {inv.emailed_at ? ` · emailed ${inv.emailed_to || ""}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!inv.paid ? (
                      <form action={markInvoicePaidAction} className="flex items-end gap-2">
                        <input type="hidden" name="invoice_id" value={inv.id} />
                        <input
                          type="date"
                          name="paid_at"
                          defaultValue={today}
                          className="rounded border px-2 py-1 text-sm"
                        />
                        <button type="submit" className="rounded bg-emerald-600 px-3 py-1 text-sm text-white">
                          Mark paid
                        </button>
                      </form>
                    ) : null}
                    <form action={voidInvoiceAction}>
                      <input type="hidden" name="invoice_id" value={inv.id} />
                      <button type="submit" className="rounded bg-rose-700 px-3 py-1 text-sm text-white">
                        Void
                      </button>
                    </form>
                  </div>
                </div>
                {lines.length ? (
                  <table className="mt-3 w-full text-left text-xs text-slate-600">
                    <thead>
                      <tr className="uppercase text-slate-400">
                        <th className="py-1">Guest</th>
                        <th>Ref</th>
                        <th>Ticket</th>
                        <th>Pax</th>
                        <th>Adult nett</th>
                        <th>Child nett</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.id} className="border-t border-slate-100">
                          <td className="py-1">{l.guest_name}</td>
                          <td className="font-mono">{l.booking_ref}</td>
                          <td>{l.supplier_ticket_number || "—"}</td>
                          <td>
                            {l.adults}/{l.children}
                          </td>
                          <td>{money(Number(l.adult_nett_total), inv.currency)}</td>
                          <td>{money(Number(l.child_nett_total), inv.currency)}</td>
                          <td>{money(Number(l.line_total), inv.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {view === "overdue" ? (
        <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="view" value="overdue" />
            <label className="text-sm">
              As of date
              <input
                type="date"
                name="as_of"
                defaultValue={asOf}
                className="mt-1 block rounded-lg border px-3 py-2"
              />
            </label>
            <button type="submit" className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white">
              Refresh
            </button>
          </form>
          <h2 className="font-semibold">Overdue as of {asOf}</h2>
          <ul className="mt-3 divide-y text-sm">
            {[...(overdue ?? [])]
              .sort((a, b) => Number(b.total_amount || 0) - Number(a.total_amount || 0))
              .map((inv) => (
              <li key={inv.id} className="flex justify-between py-2">
                <span>
                  {inv.supplier_name} · due {inv.due_date} · {inv.invoice_number || inv.verifactu_number || "unnumbered"}
                </span>
                <span className="font-medium text-rose-600">{money(Number(inv.total_amount || 0), inv.currency)}</span>
              </li>
            ))}
            {!overdue?.length ? <li className="py-4 text-slate-500">None overdue</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
