import Link from "next/link";

import {
  generateAllInvoicePacksAction,
  generateInvoicePackAction,
} from "@/app/dashboard/show-ops/actions";
import { SubmitOnce } from "@/components/show-ops/submit-once";
import { SHOW_OPS_GHOST_BTN, SHOW_OPS_PRIMARY_BTN, ShowOpsPageHeader, ShowOpsPill } from "@/components/show-ops/show-ops-page-header";
import { pushInvoiceToHoldedAction, syncHoldedInvoicesAction } from "@/app/dashboard/show-ops/actions-holded";
import { holdedInvoiceUrl } from "@/lib/show-ops/holded";
import { listHoldedSalesInvoices, loadHoldedConnection } from "@/lib/show-ops/holded-connection";
import { buildPnl } from "@/lib/show-ops/expenses";
import { ExpensesPanel, PnlPanel, type ExpenseRow } from "@/components/show-ops/expenses-panel";
import { requireShowOpsPage } from "@/lib/show-ops/access";
import { applyNoShowBilling, formatShowOpsMoney, resolveArrivedPax, round2 } from "@/lib/show-ops/calc";
import { hasShowOpsModule, showOpsCurrencyFor } from "@/lib/show-ops/config";
import { calendarMonthBounds, shiftMonth } from "@/lib/show-ops/invoice";

// "Sync with Holded" sends and reads many invoices in one press.
export const maxDuration = 300;

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
    status?: string;
    q?: string;
    holded_synced?: string;
    holded_sent?: string;
    holded_failed?: string;
    holded_drafts?: string;
    holded_waiting?: string;
    holded_msg?: string;
    holded_error?: string;
    expense?: string;
    expense_error?: string;
    pnl_from?: string;
    pnl_to?: string;
  }>;
}) {
  const sp = await searchParams;
  const ctx = await requireShowOpsPage("invoices");
  if (!hasShowOpsModule(ctx.config, ctx.tier, "invoices")) {
    return <p className="text-sm text-slate-600">Invoices are not enabled for this workspace.</p>;
  }

  const view = sp.view || "generate";
  const holded = await loadHoldedConnection(ctx);

  let expenseRows: ExpenseRow[] = [];
  let expenseProducts: Array<{ id: string; name: string; island: string }> = [];
  if (view === "expenses") {
    const [{ data: exp }, { data: prods }] = await Promise.all([
      ctx.supabase.from("show_expenses").select("*").eq("business_id", ctx.business.id).order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(200),
      ctx.supabase.from("show_products").select("id,name,island").eq("business_id", ctx.business.id).eq("active", true).order("island").order("name"),
    ]);
    expenseProducts = (prods ?? []) as Array<{ id: string; name: string; island: string }>;
    const withReceipts = (exp ?? []).filter((e) => e.receipt_path);
    const signed = withReceipts.length
      ? await ctx.supabase.storage.from("show-ops-proofs").createSignedUrls(withReceipts.map((e) => e.receipt_path as string), 60 * 60)
      : { data: [] as Array<{ path: string | null; signedUrl: string }> };
    const urlByPath = new Map((signed.data ?? []).map((x) => [x.path, x.signedUrl]));
    expenseRows = (exp ?? []).map((e) => ({
      id: e.id, expense_date: e.expense_date, supplier_name: e.supplier_name, description: e.description, category: e.category, island: e.island,
      net_amount: e.net_amount, tax_rate: e.tax_rate, total_amount: e.total_amount, currency: e.currency,
      receipt_url: e.receipt_path ? urlByPath.get(e.receipt_path) ?? null : null, holded_status: e.holded_status, holded_error: e.holded_error,
      holded_claim_token: e.holded_claim_token ?? null, holded_claimed_at: e.holded_claimed_at ?? null,
    }));
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const pnlTo = /^\d{4}-\d{2}-\d{2}$/.test(sp.pnl_to ?? "") ? (sp.pnl_to as string) : todayIso;
  const pnlFromDefault = (() => { const d = new Date(`${pnlTo}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 2, 1); return d.toISOString().slice(0, 10); })();
  const pnlFrom = /^\d{4}-\d{2}-\d{2}$/.test(sp.pnl_from ?? "") ? (sp.pnl_from as string) : pnlFromDefault;
  let pnlRows: ReturnType<typeof buildPnl> = [];
  if (view === "pnl") {
    const bookings: Array<{ show_date: string; island: string | null; total_cost: number; nett_total: number; cancelled_at: string | null }> = [];
    for (let offset = 0; offset < 20000; offset += 1000) {
      const { data } = await ctx.supabase
        .from("show_bookings")
        .select("show_date,island,total_cost,nett_total,cancelled_at")
        .eq("business_id", ctx.business.id)
        .gte("show_date", pnlFrom)
        .lte("show_date", pnlTo)
        .is("cancelled_at", null)
        .order("id")
        .range(offset, offset + 999);
      bookings.push(...((data ?? []) as typeof bookings));
      if (!data || data.length < 1000) break;
    }
    const { data: exp } = await ctx.supabase.from("show_expenses").select("expense_date,island,net_amount").eq("business_id", ctx.business.id).gte("expense_date", pnlFrom).lte("expense_date", pnlTo);
    pnlRows = buildPnl(bookings, exp ?? []);
  }
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = calendarMonthBounds(today);
  const lastMonth = calendarMonthBounds(shiftMonth(today, -1));
  const periodStart = sp.period_start || thisMonth.start;
  const periodEnd = sp.period_end || thisMonth.end;
  const asOf = sp.as_of || today;
  const sort = sp.sort || (view === "list" ? "date" : "owed");
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
      // Approved late cancellations stay on the invoice in full.
      .or("cancelled_at.is.null,cancel_charge.eq.charge")
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

  // Invoices made directly in Holded (not pushed from the Hub), so the list shows everything.
  const holdedList = view === "list" && holded.connected
    ? await listHoldedSalesInvoices(ctx, shiftMonth(today, -12).slice(0, 7) + "-01")
    : { invoices: [], error: null };
  const pushedIds = new Set(invoices.map((i) => i.holded_document_id).filter(Boolean));
  const holdedOnly = holdedList.invoices.filter((h) => !pushedIds.has(h.id));

  // One row model for both sources, so tabs, search and totals treat them alike.
  const listRows: ListRow[] = [
    ...invoices.map((inv): ListRow => {
      const lines = linesByInvoice.get(inv.id) || [];
      const pax = lines.reduce((s, l) => s + Number(l.adults || 0) + Number(l.children || 0), 0);
      const tag = islandTag(inv.island);
      const client = inv.recipient_name && inv.recipient_name !== inv.supplier_name ? `${inv.recipient_name} (${inv.supplier_name})` : inv.supplier_name;
      return {
        key: inv.id,
        source: "hub",
        invoiceId: inv.id,
        href: `/dashboard/show-ops/invoices/${inv.id}`,
        holdedUrl: inv.holded_document_id ? holdedInvoiceUrl(inv.holded_document_id) : null,
        date: inv.invoice_date,
        docNumber: inv.holded_doc_number || null,
        docSub: inv.invoice_number ? `Invoice · Hub ${inv.invoice_number}` : "Invoice · not issued yet",
        dueDate: inv.due_date,
        client: String(client || "—"),
        description: inv.island ? `MHT ${inv.island}` : "—",
        detail: `Shows ${dmy(inv.period_start)} → ${dmy(inv.period_end)} · ${lines.length} bookings / ${pax} pax`,
        island: inv.island ?? null,
        tags: tag ? [tag] : [],
        total: Number(inv.total_amount || 0),
        currency: inv.currency,
        status: invoiceListStatus(inv, today),
        search: [client, inv.invoice_number, inv.holded_doc_number, ...lines.map((l) => `${l.booking_ref} ${l.guest_name} ${l.supplier_ticket_number ?? ""}`)].join(" ").toLowerCase(),
      };
    }),
    ...holdedOnly.map((h): ListRow => {
      const status = h.status === "paid"
        ? LIST_STATUS.paid
        : h.status === "approved"
          ? h.dueDate && h.dueDate < today ? LIST_STATUS.overdue : LIST_STATUS.approved
          : LIST_STATUS.holded_draft;
      const islandFromTag = ctx.config.islands.find((i) => h.tags.some((t) => t.toLowerCase() === islandTag(i))) ?? null;
      return {
        key: `holded-${h.id}`,
        source: "holded",
        invoiceId: null,
        href: holdedInvoiceUrl(h.id),
        holdedUrl: holdedInvoiceUrl(h.id),
        date: h.date,
        docNumber: h.docNumber,
        docSub: "Invoice · made in Holded",
        dueDate: h.dueDate,
        client: h.contactName || "—",
        description: h.description || "—",
        detail: null,
        island: islandFromTag,
        tags: h.tags,
        total: h.total,
        currency: "eur",
        status,
        search: [h.contactName, h.docNumber, h.description, ...h.tags].join(" ").toLowerCase(),
      };
    }),
  ];
  const statusFilter = LIST_TABS.some(([id]) => id === sp.status) ? (sp.status as ListTab) : "all";
  const search = String(sp.q ?? "").trim();
  const islandFilter = String(sp.island ?? "").trim();
  const shownRows = listRows
    .filter((r) => statusFilter === "all" || rowInTab(r, statusFilter))
    .filter((r) => !islandFilter || r.island === islandFilter)
    .filter((r) => !search || search.toLowerCase().split(/\s+/).every((w) => r.search.includes(w)))
    .sort((a, b) => {
      const owed = (r: ListRow) => (r.status.key === "paid" || r.status.key === "draft" ? 0 : Number(r.total || 0));
      if (sort === "owed") return owed(b) - owed(a) || String(b.date || "").localeCompare(String(a.date || ""));
      if (sort === "supplier") return a.client.localeCompare(b.client);
      if (sort === "due") return String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"));
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
  const kpis = { invoiced: 0, invoicedCount: 0, collected: 0, collectedCount: 0, pending: 0, pendingCount: 0, overdue: 0, overdueCount: 0 };
  for (const r of listRows) {
    const total = Number(r.total || 0);
    if (r.status.key === "draft" || r.status.key === "holded_draft") continue;
    kpis.invoiced += total;
    kpis.invoicedCount += 1;
    if (r.status.key === "paid") { kpis.collected += total; kpis.collectedCount += 1; }
    else if (r.status.key === "overdue") { kpis.overdue += total; kpis.overdueCount += 1; }
    else { kpis.pending += total; kpis.pendingCount += 1; }
  }
  const syncNote = syncSummary(sp);

  return (
    <div className="space-y-6">
      <ShowOpsPageHeader
        eyebrow="Operations"
        title="Invoicing"
        subtitle={
          holded.connected
            ? "Draft from bookings, check prices, then Issue and send: Holded gives the legal number and handles Verifactu. Sync pulls back numbers and payments."
            : "Draft invoices, edit prices, issue a number. Connect Holded in Settings for legal numbering and Verifactu."
        }
        actions={
          <>
            <Link href="/dashboard/show-ops/invoices?view=generate" className={SHOW_OPS_GHOST_BTN}>
              + New invoice
            </Link>
            {holded.connected ? (
              <form action={syncHoldedInvoicesAction}>
                <SubmitOnce className={SHOW_OPS_PRIMARY_BTN}>Sync with Holded</SubmitOnce>
              </form>
            ) : null}
          </>
        }
      />
      {syncNote ? (
        <div className={`rounded-xl px-4 py-3 text-sm ring-1 ${syncNote.tone === "ok" ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}>
          <p className="font-semibold">{syncNote.title}</p>
          {syncNote.lines.map((l) => (
            <p key={l} className="mt-0.5">{l}</p>
          ))}
        </div>
      ) : null}
      {sp.holded_error ? (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 ring-1 ring-rose-200">{sp.holded_error}</p>
      ) : null}
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
          ["expenses", "Expenses"],
          ["pnl", "P&L"],
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
                {holded.connected ? (
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-3">
                    <input type="checkbox" name="send_to_holded" value="1" defaultChecked className="h-4 w-4" />
                    Create in Holded at the same time (issued and sent as a Holded draft, ready to approve there)
                  </label>
                ) : null}
                <SubmitOnce className="self-end rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
                  {`Generate all ${previewBySupplier.size} supplier packs`}
                </SubmitOnce>
              </form>
              <p className="mt-2 text-xs text-slate-500">
                {holded.connected
                  ? "One invoice per supplier for this period. With Holded ticked, each is issued and created in Holded straight away; untick it to review drafts in the Hub first."
                  : "One draft per supplier for this period — nothing is issued until you review each pack."}
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
                        {holded.connected ? (
                          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
                            <input type="checkbox" name="send_to_holded" value="1" defaultChecked className="h-4 w-4" />
                            Create in Holded at the same time (issued and sent as a Holded draft, ready to approve there)
                          </label>
                        ) : null}
                        <SubmitOnce className="self-end rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2">
                          {holded.connected ? "Create invoice" : "Generate draft invoice"}
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
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Invoiced", value: kpis.invoiced, note: `${kpis.invoicedCount} invoice${kpis.invoicedCount === 1 ? "" : "s"}`, tone: "text-slate-900" },
              { label: "Collected", value: kpis.collected, note: `${kpis.collectedCount} paid`, tone: "text-emerald-700" },
              { label: "Pending to collect", value: kpis.pending, note: `${kpis.pendingCount} not due yet`, tone: "text-sky-700" },
              { label: "Overdue", value: kpis.overdue, note: `${kpis.overdueCount} past due date`, tone: "text-rose-700" },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl bg-white px-5 py-4 ring-1 ring-slate-200">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${k.tone}`}>{money(k.value, "eur")}</p>
                <p className="mt-0.5 text-xs text-slate-500">{k.note}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-slate-200 px-3 pt-3">
              {LIST_TABS.map(([id, label]) => {
                const on = statusFilter === id;
                const count = id === "all" ? listRows.length : listRows.filter((r) => rowInTab(r, id)).length;
                return (
                  <a
                    key={id}
                    href={listHref({ status: id, q: search, island: islandFilter, sort })}
                    className={`-mb-px border-b-2 px-3 pb-2.5 text-sm font-semibold ${on ? "border-[var(--show-ops-primary,#7c3aed)] text-[var(--show-ops-primary,#7c3aed)]" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                  >
                    {label}
                    <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${on ? "bg-[var(--show-ops-primary,#7c3aed)]/10" : "bg-slate-100 text-slate-500"}`}>{count}</span>
                  </a>
                );
              })}
            </div>
            <form method="get" className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
              <input type="hidden" name="view" value="list" />
              <input type="hidden" name="status" value={statusFilter} />
              <input
                name="q"
                defaultValue={search}
                placeholder="Search client, number, booking ref…"
                className="min-w-[16rem] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <select name="island" defaultValue={islandFilter} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm">
                <option value="">All islands</option>
                {ctx.config.islands.map((i) => (
                  <option key={i} value={i}>
                    {islandTag(i) ? `#${islandTag(i)} · ${i}` : i}
                  </option>
                ))}
              </select>
              <select name="sort" defaultValue={sort} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm">
                <option value="date">Newest first</option>
                <option value="owed">Owed (biggest first)</option>
                <option value="due">Due date</option>
                <option value="supplier">Client A–Z</option>
              </select>
              <button type="submit" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                Search
              </button>
            </form>
            {holdedList.error ? (
              <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                Couldn&apos;t read Holded&apos;s invoice list: {holdedList.error}
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="px-4 py-3">Issue date</th>
                    <th className="px-3 py-3">Document no.</th>
                    <th className="px-3 py-3">Due date</th>
                    <th className="px-3 py-3">Client</th>
                    <th className="px-3 py-3">Description</th>
                    <th className="px-3 py-3">Tags</th>
                    <th className="px-3 py-3 text-right">Total</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r) => (
                    <tr key={r.key} className="group border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/70">
                      <td className="px-4 py-3 whitespace-nowrap">{dmy(r.date)}</td>
                      <td className="px-3 py-3">
                        <a href={r.href} target={r.source === "holded" ? "_blank" : undefined} rel="noreferrer" className="font-semibold text-slate-900 hover:underline">
                          {r.docNumber || "Draft"}
                        </a>
                        <span className="block text-xs text-slate-500">{r.docSub}</span>
                      </td>
                      <td className={`px-3 py-3 whitespace-nowrap ${r.status.key === "overdue" ? "font-semibold text-rose-700" : ""}`}>{dmy(r.dueDate)}</td>
                      <td className="px-3 py-3">
                        <a href={r.href} target={r.source === "holded" ? "_blank" : undefined} rel="noreferrer" className="font-medium text-slate-900 hover:underline">
                          {r.client}
                        </a>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {r.description}
                        {r.detail ? <span className="block text-xs text-slate-500">{r.detail}</span> : null}
                      </td>
                      <td className="px-3 py-3 text-[var(--show-ops-primary,#7c3aed)]">{r.tags.map((t) => `#${t}`).join(" ")}</td>
                      <td className="px-3 py-3 text-right font-semibold whitespace-nowrap tabular-nums">{r.total === null ? "—" : money(r.total, r.currency)}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${r.status.tone}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {r.status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {r.status.key === "to_send" && r.invoiceId && holded.connected ? (
                            <form action={pushInvoiceToHoldedAction}>
                              <input type="hidden" name="invoice_id" value={r.invoiceId} />
                              <SubmitOnce className="rounded-lg bg-[var(--show-ops-primary,#7c3aed)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">
                                Send to Holded
                              </SubmitOnce>
                            </form>
                          ) : null}
                          {r.holdedUrl && r.source === "hub" ? (
                            <a href={r.holdedUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                              Holded ↗
                            </a>
                          ) : null}
                          <a href={r.href} target={r.source === "holded" ? "_blank" : undefined} rel="noreferrer" className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                            {r.source === "holded" ? "Open in Holded ↗" : r.status.key === "draft" ? "Edit" : "Open"}
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!shownRows.length ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                        {listRows.length ? "No invoices match this filter." : "No invoices yet. Generate a pack to make the first one."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              <span>
                {shownRows.length} of {listRows.length} · total {money(round2(shownRows.reduce((s, r) => s + Number(r.total || 0), 0)), "eur")}
              </span>
              {holded.connected ? <span>Invoices made directly in Holded are listed too and open in Holded.</span> : null}
            </div>
          </div>
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
              <li key={inv.id}>
                <a
                  href={`/dashboard/show-ops/invoices/${inv.id}`}
                  className="flex justify-between gap-3 py-2 hover:underline"
                  style={{ color: "inherit" }}
                >
                  <span>
                    {inv.supplier_name} · due {inv.due_date} · {inv.invoice_number || inv.verifactu_number || "unnumbered"}
                    <span className="ml-2 text-xs font-normal text-[var(--show-ops-primary,#7c3aed)]">Open →</span>
                  </span>
                  <span className="font-medium text-rose-600">{money(Number(inv.total_amount || 0), inv.currency)}</span>
                </a>
              </li>
            ))}
            {!overdue?.length ? <li className="py-4 text-slate-500">None overdue</li> : null}
          </ul>
        </div>
      ) : null}

      {view === "expenses" ? (
        <ExpensesPanel
          rows={expenseRows}
          islands={ctx.config.islands}
          products={expenseProducts}
          currency={ctx.config.currency}
          defaultTaxRate={ctx.config.invoice.defaultVatRate}
          holdedConnected={holded.connected}
          message={sp.expense}
          error={sp.expense_error}
        />
      ) : null}
      {view === "pnl" ? <PnlPanel rows={pnlRows} currency={ctx.config.currency} from={pnlFrom} to={pnlTo} /> : null}
    </div>
  );
}

/** dd/mm/yyyy, as Holded shows dates. */
function dmy(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

/** The island tag MHT uses in Holded (#tfs, #ace, #lpa). */
function islandTag(island: string | null | undefined): string | null {
  const key = String(island || "").toLowerCase();
  if (key === "tenerife") return "tfs";
  if (key === "lanzarote") return "ace";
  if (key === "gran canaria") return "lpa";
  if (key === "uk tour") return "uk";
  return null;
}

type ListStatusKey = "draft" | "to_send" | "holded_draft" | "approved" | "overdue" | "paid";
type ListStatus = { key: ListStatusKey; label: string; tone: string };
const LIST_STATUS: Record<ListStatusKey, ListStatus> = {
  draft: { key: "draft", label: "Draft", tone: "bg-slate-100 text-slate-600" },
  to_send: { key: "to_send", label: "To send to Holded", tone: "bg-violet-50 text-violet-700" },
  holded_draft: { key: "holded_draft", label: "Draft in Holded", tone: "bg-amber-50 text-amber-700" },
  approved: { key: "approved", label: "Pending", tone: "bg-sky-50 text-sky-700" },
  overdue: { key: "overdue", label: "Overdue", tone: "bg-rose-50 text-rose-700" },
  paid: { key: "paid", label: "Paid", tone: "bg-emerald-50 text-emerald-700" },
};

type ListTab = "all" | "draft" | "to_send" | "holded" | "overdue" | "paid";
const LIST_TABS: Array<[ListTab, string]> = [
  ["all", "All"],
  ["draft", "Drafts"],
  ["to_send", "To send"],
  ["holded", "In Holded"],
  ["overdue", "Overdue"],
  ["paid", "Paid"],
];

type ListRow = {
  key: string;
  source: "hub" | "holded";
  invoiceId: string | null;
  href: string;
  holdedUrl: string | null;
  date: string | null;
  docNumber: string | null;
  docSub: string;
  dueDate: string | null;
  client: string;
  description: string;
  detail: string | null;
  island: string | null;
  tags: string[];
  total: number | null;
  currency: string | null;
  status: ListStatus;
  search: string;
};

function rowInTab(r: ListRow, tab: ListTab): boolean {
  if (tab === "all") return true;
  if (tab === "holded") return r.status.key === "holded_draft" || r.status.key === "approved";
  return r.status.key === tab;
}

function listHref(p: { status: string; q: string; island: string; sort: string }): string {
  const q = new URLSearchParams({ view: "list", status: p.status });
  if (p.q) q.set("q", p.q);
  if (p.island) q.set("island", p.island);
  if (p.sort && p.sort !== "date") q.set("sort", p.sort);
  return `/dashboard/show-ops/invoices?${q.toString()}`;
}

/** Plain-words result of "Sync with Holded", from the redirect's counts. */
function syncSummary(sp: { holded_synced?: string; holded_sent?: string; holded_failed?: string; holded_drafts?: string; holded_waiting?: string; holded_msg?: string }): { title: string; lines: string[]; tone: "ok" | "warn" } | null {
  if (sp.holded_synced == null) return null;
  const n = (v?: string) => Math.max(0, Number(v) || 0);
  const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  const sent = n(sp.holded_sent);
  const updated = n(sp.holded_synced);
  const failed = n(sp.holded_failed);
  const drafts = n(sp.holded_drafts);
  const waiting = n(sp.holded_waiting);
  const lines: string[] = [];
  const parts = [sent ? `${plural(sent, "invoice")} sent to Holded` : null, updated ? `${plural(updated, "invoice")} updated from Holded` : null].filter(Boolean);
  const title = parts.length ? `Holded sync done: ${parts.join(", ")}.` : "Holded sync done. Everything in Holded was already up to date.";
  if (waiting) lines.push(`${plural(waiting, "more invoice")} still to send. Press Sync again to carry on.`);
  if (failed) lines.push(`${plural(failed, "invoice")} could not be synced${sp.holded_msg ? `. First problem: ${sp.holded_msg}` : "."}`);
  if (drafts) lines.push(`${plural(drafts, "draft")} in the Hub ${drafts === 1 ? "isn't" : "aren't"} issued yet, so ${drafts === 1 ? "it stays" : "they stay"} here. Open a draft and press Issue and send to Holded.`);
  return { title, lines, tone: failed ? "warn" : "ok" };
}

function invoiceListStatus(
  inv: { status?: string | null; paid?: boolean | null; due_date?: string | null; holded_status?: string | null; holded_document_id?: string | null },
  today: string,
): ListStatus {
  if (inv.paid || inv.holded_status === "paid") return LIST_STATUS.paid;
  if (inv.status === "draft") return LIST_STATUS.draft;
  if (!inv.holded_document_id) return LIST_STATUS.to_send;
  if (inv.holded_status !== "approved") return LIST_STATUS.holded_draft;
  if (inv.due_date && inv.due_date < today) return LIST_STATUS.overdue;
  return LIST_STATUS.approved;
}
