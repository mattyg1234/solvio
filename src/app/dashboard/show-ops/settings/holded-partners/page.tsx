import Link from "next/link";

import {
  applyHoldedPartnerImportAction,
  createHoldedContactsAction,
  linkHoldedPartnersAction,
  applyHoldedDetailsAction,
} from "@/app/dashboard/show-ops/actions-holded-partners";
import { ShowOpsPageHeader } from "@/components/show-ops/show-ops-page-header";
import { requireShowOpsPage } from "@/lib/show-ops/access";
import { FIELD_LABELS, FILLABLE_FIELDS, type ImportRow } from "@/lib/show-ops/holded-partner-import";
import { loadPartnerImportPlan } from "@/lib/show-ops/holded-partner-import-data";
import { isGlobalShowOpsAdmin } from "@/lib/show-ops/island-access";
import { holdedReadiness } from "@/lib/show-ops/partner-billing";

export const dynamic = "force-dynamic";

type FillRow = Extract<ImportRow, { kind: "fill" }>;

function fillText(row: FillRow): string {
  return FILLABLE_FIELDS.filter((f) => f in row.fill && f !== "holded_contact_id")
    .map((f) => `${FIELD_LABELS[f]}: ${f === "is_person" ? (row.fill[f] ? "yes" : "no") : row.fill[f]}`)
    .join(" · ");
}

export default async function HoldedPartnersPage({ searchParams }: { searchParams: Promise<{ filled?: string; linked?: string; replaced?: string; created?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireShowOpsPage("settings");
  if (!isGlobalShowOpsAdmin(ctx.role, ctx.allowedIslands)) {
    return <p className="text-sm text-slate-700">Only the owner and all-island administrators can import partner details.</p>;
  }
  const plan = await loadPartnerImportPlan(ctx);
  const fills = plan.rows.filter((r): r is FillRow => r.kind === "fill");
  const conflicts = plan.rows.filter((r): r is Extract<ImportRow, { kind: "conflict" }> => r.kind === "conflict");
  const ambiguous = plan.rows.filter((r): r is Extract<ImportRow, { kind: "ambiguous" }> => r.kind === "ambiguous");
  const unmatched = plan.rows.filter((r): r is Extract<ImportRow, { kind: "unmatched" }> => r.kind === "unmatched");
  const creatable = unmatched.filter((r) => holdedReadiness(r.partner).length === 0);
  const incomplete = unmatched.filter((r) => holdedReadiness(r.partner).length > 0);
  const complete = plan.rows.filter((r) => r.kind === "complete").length;

  return (
    <div className="space-y-4">
      <ShowOpsPageHeader
        eyebrow="Settings · Holded"
        title="Partners ↔ Holded"
        subtitle="Matches each partner to a Holded contact by its Holded link, NIF, or name. Fill copies only what the partner is missing; the other steps are only done for the partners you tick."
        actions={
          <Link href="/dashboard/show-ops/settings#holded" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200">
            Back to Settings
          </Link>
        }
      />

      {sp.filled ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Filled details on {sp.filled} partner{sp.filled === "1" ? "" : "s"}.</p>
      ) : null}
      {sp.linked ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Linked {sp.linked} partner{sp.linked === "1" ? "" : "s"} to Holded.</p> : null}
      {sp.replaced ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{sp.replaced} partner{sp.replaced === "1" ? " now uses" : "s now use"} Holded&apos;s details.</p> : null}
      {sp.created ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Created {sp.created} contact{sp.created === "1" ? "" : "s"} in Holded and linked them.</p> : null}
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

      {ambiguous.length ? (
        <form action={linkHoldedPartnersAction} className="rounded-2xl bg-white p-5 text-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Unclear: pick the right Holded contact ({ambiguous.length})</h2>
            <button type="submit" className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white">
              Link picked contacts
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-600">More than one Holded contact has this name. Linking fills only the partner&apos;s empty fields.</p>
          <ul className="mt-3 space-y-3">
            {ambiguous.map((r) => (
              <li key={r.partner.id}>
                <p className="font-medium">{r.partner.name}</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  <label className="flex items-center gap-1.5 text-slate-500">
                    <input type="radio" name={`link:${r.partner.id}`} value="" defaultChecked /> Leave for now
                  </label>
                  {r.contacts.map((c) => (
                    <label key={c.id} className="flex items-center gap-1.5">
                      <input type="radio" name={`link:${r.partner.id}`} value={c.id} />
                      {c.name}
                      <span className="text-xs text-slate-500">{[c.taxId, c.city, c.tags.join(", ")].filter(Boolean).join(" · ")}</span>
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </form>
      ) : null}

      {conflicts.length ? (
        <form action={applyHoldedDetailsAction} className="rounded-2xl bg-white p-5 text-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Hub and Holded disagree ({conflicts.length})</h2>
            <button type="submit" className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white">
              Use Holded&apos;s details for ticked
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-600">Ticked partners take the Holded contact&apos;s legal name, NIF, email and address, and link to it. Leave unticked to keep the Hub&apos;s.</p>
          <ul className="mt-3 space-y-1">
            {conflicts.map((r) => (
              <li key={r.partner.id} className="flex items-start gap-2">
                <input type="checkbox" name="partner" value={r.partner.id} aria-label={`Use Holded details for ${r.partner.name}`} className="mt-1" />
                <span>
                  <span className="font-medium">{r.partner.name}</span> ↔ {r.contact.name}: {r.reason}
                </span>
              </li>
            ))}
          </ul>
        </form>
      ) : null}

      {creatable.length ? (
        <form action={createHoldedContactsAction} className="rounded-2xl bg-white p-5 text-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Not in Holded yet, ready to create ({creatable.length})</h2>
            <button type="submit" className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white">
              Create ticked in Holded
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-600">These partners have a legal name, NIF and full address in the Hub. Creating adds them to Holded as clients and links them.</p>
          <ul className="mt-3 space-y-1">
            {creatable.map((r) => (
              <li key={r.partner.id} className="flex items-start gap-2">
                <input type="checkbox" name="partner" value={r.partner.id} aria-label={`Create ${r.partner.name} in Holded`} className="mt-1" />
                <span>
                  <span className="font-medium">{r.partner.name}</span>
                  <span className="text-slate-500"> · {r.partner.legal_name} · {r.partner.tax_id}</span>
                </span>
              </li>
            ))}
          </ul>
        </form>
      ) : null}

      {incomplete.length ? (
        <details className="rounded-2xl bg-white p-5 text-sm ring-1 ring-slate-200">
          <summary className="cursor-pointer font-semibold">Not in Holded and missing details ({incomplete.length})</summary>
          <p className="mt-2 text-xs text-slate-600">Add these in Holded (they&apos;ll match next time) or fill them on the partner in the Hub and use Send to Holded.</p>
          <ul className="mt-2 space-y-1">
            {incomplete.map((r) => (
              <li key={r.partner.id}>
                <span className="font-medium">{r.partner.name}</span>
                <span className="text-slate-500">: missing {holdedReadiness(r.partner).join(", ")}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
