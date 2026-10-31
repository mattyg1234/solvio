import Link from "next/link";
import { notFound } from "next/navigation";

import { PartnerHoldedButtons } from "@/components/show-ops/partner-holded-buttons";
import { requireShowOpsPage } from "@/lib/show-ops/access";
import { formatShowOpsMoney } from "@/lib/show-ops/calc";
import { countryName, holdedReadiness, type PartnerBilling } from "@/lib/show-ops/partner-billing";
import { partnerIslands } from "@/lib/show-ops/partners";

export const dynamic = "force-dynamic";

const ISLAND_TAGS: Record<string, string> = { tenerife: "TFS", lanzarote: "ACE", "gran canaria": "LPA", "uk tour": "UK" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Supplier = PartnerBilling & {
  id: string;
  name: string;
  email: string | null;
  island: string | null;
  partner_type: string | null;
  billing_mode: string | null;
  deposit_percent: number | null;
  invoice_nett_percent: number | null;
  payment_terms_days: number | null;
  holded_contact_id: string | null;
  active: boolean | null;
};

type InvoiceRow = {
  id: string;
  invoice_date: string | null;
  due_date: string | null;
  invoice_number: string | null;
  holded_doc_number: string | null;
  total_amount: number | null;
  paid: boolean | null;
  status: string | null;
  holded_status: string | null;
  currency: string | null;
};

function dmy(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

/**
 * One partner, laid out like its contact in Holded (details on the left, the year's
 * sales on the right), so the office sees the same thing in both places.
 */
export default async function PartnerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireShowOpsPage("partners");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await ctx.supabase.from("show_suppliers").select("*").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!data) notFound();
  const s = data as Supplier;

  const thisYear = new Date().getUTCFullYear();
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : thisYear;
  const [{ data: inv }, { data: totals }] = await Promise.all([
    ctx.supabase
      .from("show_invoices")
      .select("id,invoice_date,due_date,invoice_number,holded_doc_number,total_amount,paid,status,holded_status,currency")
      .eq("business_id", ctx.business.id)
      .eq("supplier_id", s.id)
      .eq("voided", false)
      .gte("invoice_date", `${year}-01-01`)
      .lte("invoice_date", `${year}-12-31`)
      .order("invoice_date", { ascending: false }),
    ctx.supabase.rpc("show_ops_partner_totals", { p_business: ctx.business.id, p_from: `${year}-01-01`, p_to: `${year}-12-31` }),
  ]);
  const invoices = (inv ?? []) as InvoiceRow[];
  const stat = ((totals ?? []) as Array<{ supplier_id: string; bookings: number; pax: number; revenue: number }>).find((t) => t.supplier_id === s.id);
  const money = (n: number) => formatShowOpsMoney(n, ctx.config.currency);

  const invoiced = invoices.reduce((t, i) => t + Number(i.total_amount || 0), 0);
  const collected = invoices.filter((i) => i.paid || i.holded_status === "paid").reduce((t, i) => t + Number(i.total_amount || 0), 0);
  const byMonth = Array.from({ length: 12 }, (_, m) =>
    invoices.filter((i) => Number(String(i.invoice_date).slice(5, 7)) === m + 1).reduce((t, i) => t + Number(i.total_amount || 0), 0),
  );
  const peak = Math.max(...byMonth, 1);

  const islands = partnerIslands(s.island);
  const tags = [...new Set(islands.map((i) => ISLAND_TAGS[i.toLowerCase()] ?? i.toUpperCase()))];
  const legal = String(s.legal_name || "").trim();
  const title = legal && legal.toLowerCase() !== s.name.toLowerCase() ? `${s.name} (${legal})` : s.name;
  const missing = holdedReadiness(s);
  const isInvoice = s.billing_mode === "invoice";
  const holdedUrl = s.holded_contact_id ? `https://app.holded.com/contacts/${encodeURIComponent(s.holded_contact_id)}` : null;

  const card = "rounded-2xl bg-white p-5 ring-1 ring-slate-200";
  const lbl = "text-xs text-slate-500";
  const val = "text-sm text-slate-900";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/show-ops/master?tab=partners" className="text-sm text-slate-500 hover:text-slate-800">
          ← Partners
        </Link>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${isInvoice ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>
          {isInvoice ? "Client · invoiced" : "Client · deposit"}
        </span>
        {s.active === false ? <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Off</span> : null}
        <div className="ml-auto flex flex-wrap gap-2">
          {holdedUrl ? (
            <a href={holdedUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200">
              Open in Holded ↗
            </a>
          ) : null}
          <Link href={`/dashboard/show-ops/master?tab=partners&open=${s.id}`} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200">
            Edit partner
          </Link>
          {isInvoice ? (
            <Link
              href={`/dashboard/show-ops/invoices?view=generate&supplier_id=${s.id}`}
              className="rounded-lg bg-[var(--show-ops-primary,#7c3aed)] px-3 py-2 text-sm font-semibold text-white"
            >
              + Invoice
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(280px,1fr)_2fr]">
        <div className="space-y-5">
          <section className={`${card} space-y-4`}>
            <div>
              <p className={lbl}>Email</p>
              <p className={val}>{s.email || <span className="text-slate-400">No email yet</span>}</p>
            </div>
            <div>
              <p className={lbl}>Company registration number</p>
              <p className={`${val} font-mono`}>{s.tax_id || <span className="font-sans text-slate-400">No NIF yet</span>}</p>
            </div>
            <div>
              <p className={lbl}>Tags</p>
              <p className="text-sm text-[var(--show-ops-primary,#7c3aed)]">
                {tags.length ? tags.map((t) => `#${t}`).join(" ") : <span className="text-slate-400">All islands</span>}
                {s.partner_type ? <span className="ml-2 text-slate-500">· {s.partner_type}</span> : null}
              </p>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-slate-900">Address</p>
              <p className={`${lbl} mt-2`}>Address</p>
              <p className={val}>{s.invoice_address || "—"}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <p className={lbl}>City</p>
                  <p className={val}>{s.invoice_city || "—"}</p>
                </div>
                <div>
                  <p className={lbl}>Postal code</p>
                  <p className={val}>{s.invoice_postal_code || "—"}</p>
                </div>
                <div>
                  <p className={lbl}>Province</p>
                  <p className={val}>{s.invoice_province || "—"}</p>
                </div>
                <div>
                  <p className={lbl}>Country</p>
                  <p className={val}>{s.invoice_country_code ? countryName(s.invoice_country_code) : "—"}</p>
                </div>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-slate-900">Billing</p>
              <p className="mt-1 text-sm text-slate-700">
                {isInvoice
                  ? `Invoiced at ${Number(s.invoice_nett_percent ?? 100)}% of the ticket price${s.payment_terms_days ? `, ${s.payment_terms_days} days to pay` : ""}.`
                  : `Pays a ${Number(s.deposit_percent ?? 0)}% deposit upfront.`}
              </p>
            </div>
          </section>

          <section className={`${card} space-y-3`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Holded</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.holded_contact_id ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {s.holded_contact_id ? "Linked" : "Not linked"}
              </span>
            </div>
            <p className="text-xs text-slate-600">
              {s.holded_contact_id
                ? "Invoices for this partner go to its Holded contact. Saving the partner in the Hub updates Holded too."
                : "Send it to Holded to link it to its contact there, or create it if Holded doesn't have it."}
            </p>
            {missing.length ? <p className="text-xs text-amber-700">Missing for a full invoice: {missing.join(", ")}.</p> : null}
            <PartnerHoldedButtons supplierId={s.id} linked={Boolean(s.holded_contact_id)} />
          </section>
        </div>

        <div className="space-y-5">
          <section className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Sales
              </p>
              <div className="flex gap-1 text-xs">
                {[thisYear - 1, thisYear].map((y) => (
                  <Link
                    key={y}
                    href={`/dashboard/show-ops/master/partners/${s.id}?year=${y}`}
                    className={`rounded-md px-2 py-1 font-semibold ${y === year ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
                  >
                    {y}
                  </Link>
                ))}
              </div>
            </div>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{money(invoiced)}</p>
            <div className="mt-4 grid gap-5 md:grid-cols-[3fr_2fr]">
              <div className="flex h-36 items-end gap-1.5 border-b border-slate-200 pb-1">
                {byMonth.map((v, m) => (
                  <div key={m} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-emerald-400/80"
                      style={{ height: `${Math.max(2, Math.round((v / peak) * 110))}px` }}
                      title={`${MONTHS[m]}: ${money(v)}`}
                    />
                    <span className="text-[10px] text-slate-400">{MONTHS[m]}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Total collected</p>
                  <p className="font-semibold">{money(collected)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Pending to collect</p>
                  <p className="font-semibold">{money(invoiced - collected)}</p>
                </div>
                <div className="col-span-2 rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Bookings {year}</p>
                  <p className="font-semibold">
                    {stat ? `${Number(stat.bookings)} bookings · ${Number(stat.pax)} pax · ${money(Number(stat.revenue))} ticket sales` : "No bookings"}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className={card}>
            <p className="text-sm font-semibold text-slate-900">Invoices {year}</p>
            {invoices.length ? (
              <table className="mt-3 w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-slate-500">
                    <th className="py-2">Issue date</th>
                    <th>Document no.</th>
                    <th>Due date</th>
                    <th className="text-right">Total</th>
                    <th className="pl-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id} className="border-t border-slate-100">
                      <td className="py-2">{dmy(i.invoice_date)}</td>
                      <td>
                        <Link href={`/dashboard/show-ops/invoices/${i.id}`} className="font-medium hover:underline" style={{ color: "inherit" }}>
                          {i.holded_doc_number || i.invoice_number || "Draft"}
                        </Link>
                      </td>
                      <td>{dmy(i.due_date)}</td>
                      <td className="text-right">{money(Number(i.total_amount || 0))}</td>
                      <td className="pl-3 text-xs">
                        {i.paid || i.holded_status === "paid" ? "Paid" : i.status === "draft" ? "Draft" : i.holded_status === "approved" ? "Approved in Holded" : "Issued"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No invoices in {year}.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
