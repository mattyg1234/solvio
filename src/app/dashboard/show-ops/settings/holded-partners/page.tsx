import Link from "next/link";

import { applyHoldedPartnerImportAction } from "@/app/dashboard/show-ops/actions-holded-partners";
import { ShowOpsPageHeader } from "@/components/show-ops/show-ops-page-header";
import { requireShowOpsPage } from "@/lib/show-ops/access";
import { FIELD_LABELS, FILLABLE_FIELDS, type ImportRow } from "@/lib/show-ops/holded-partner-import";
import { loadPartnerImportPlan } from "@/lib/show-ops/holded-partner-import-data";
import { isGlobalShowOpsAdmin } from "@/lib/show-ops/island-access";

export const dynamic = "force-dynamic";

type FillRow = Extract<ImportRow, { kind: "fill" }>;

function fillText(row: FillRow): string {
  return FILLABLE_FIELDS.filter((f) => f in row.fill && f !== "holded_contact_id")
    .map((f) => `${FIELD_LABELS[f]}: ${f === "is_person" ? (row.fill[f] ? "yes" : "no") : row.fill[f]}`)
    .join(" · ");
}

export default async function HoldedPartnersPage({ searchParams }: { searchParams: Promise<{ filled?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireShowOpsPage("settings");
  if (!isGlobalShowOpsAdmin(ctx.role, ctx.allowedIslands)) {
    return <p className="text-sm text-slate-700">Only the owner and all-island administrators can import partner details.</p>;
  }
  const plan = await loadPartnerImportPlan(ctx);
  const fills = plan.rows.filter((r): r is FillRow => r.kind === "fill");
  const conflicts = plan.rows.filter((r): r is Extract<ImportRow, { kind: "conflict" }> => r.kind === "conflict");
  const ambiguous = plan.rows.filter((r): r is Extract<ImportRow, { kind: "ambiguous" }> => r.kind === "ambiguous");
  const unmatched = plan.rows.filter((r) => r.kind === "unmatched");
  const complete = plan.rows.filter((r) => r.kind === "complete").length;

  return (
    <div className="space-y-4">
      <ShowOpsPageHeader
        eyebrow="Settings · Holded"
        title="Fill partner details from Holded"
        subtitle="Matches each partner to a Holded contact by its Holded link, NIF, or name, and copies only what the partner is missing. Nothing already in the Hub is changed."
        actions={
          <Link href="/dashboard/show-ops/settings#holded" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200">
            Back to Settings
          </Link>
        }
      />

      {sp.filled ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Filled details on {sp.filled} partner{sp.filled === "1" ? "" : "s"}.</p>
      ) : null}
      {sp.error || plan.error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{sp.error ?? plan.error}</p> : null}

      {!plan.error ? (
        <section className="rounded-2xl bg-white p-5 text-sm ring-1 ring-slate-200">
          <p>
            {plan.contacts} Holded contacts read · <span className="font-medium text-emerald-700">{fills.length} partners can be filled</span> · {complete} already
            complete · {conflicts.length} conflicts · {ambiguous.length} unclear · {unmatched.length} not found in Holded
          </p>
        </section>
      ) : null}

      {fills.length ? (
        <form action={applyHoldedPartnerImportAction} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Ready to fill</h2>
            <button type="submit" className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white">
              Fill ticked partners
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-600">Name matches are worth a glance before you save; untick any that are the wrong business.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-2" />
                  <th className="py-2 pr-3">Hub partner</th>
                  <th className="py-2 pr-3">Holded contact</th>
                  <th className="py-2 pr-3">Matched by</th>
                  <th className="py-2">Will fill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fills.map((r) => (
                  <tr key={r.partner.id} className="align-top">
                    <td className="py-2 pr-2">
                      <input type="checkbox" name="partner" value={r.partner.id} defaultChecked aria-label={`Fill ${r.partner.name}`} />
                    </td>
                    <td className="py-2 pr-3 font-medium">{r.partner.name}</td>
                    <td className="py-2 pr-3">
                      {r.contact.name}
                      {r.contact.tags.length ? <span className="block text-xs text-slate-500">tags: {r.contact.tags.join(", ")}</span> : null}
                    </td>
                    <td className={`py-2 pr-3 ${r.matchedBy === "name" ? "text-amber-700" : "text-emerald-700"}`}>{r.matchedBy}</td>
                    <td className="py-2 text-slate-700">{fillText(r) || "Holded link only"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </form>
      ) : null}

      {conflicts.length || ambiguous.length ? (
        <section className="rounded-2xl bg-white p-5 text-sm ring-1 ring-slate-200">
          <h2 className="font-semibold">Needs a person to check</h2>
          <ul className="mt-2 space-y-1">
            {conflicts.map((r) => (
              <li key={r.partner.id}>
                <span className="font-medium">{r.partner.name}</span> ↔ {r.contact.name}: {r.reason}
              </li>
            ))}
            {ambiguous.map((r) => (
              <li key={r.partner.id}>
                <span className="font-medium">{r.partner.name}</span> could be: {r.contacts.map((c) => c.name).join(" / ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {unmatched.length ? (
        <details className="rounded-2xl bg-white p-5 text-sm ring-1 ring-slate-200">
          <summary className="cursor-pointer font-semibold">Not found in Holded ({unmatched.length})</summary>
          <p className="mt-2 text-slate-600">{unmatched.map((r) => r.partner.name).join(" · ")}</p>
        </details>
      ) : null}
    </div>
  );
}
