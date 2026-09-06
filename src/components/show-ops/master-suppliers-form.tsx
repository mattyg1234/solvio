"use client";

import { Check, Link2, Pencil } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import {
  applyMasterSuppliersBulkAction,
  deleteSupplierAction,
  saveMasterSupplierOneAction,
  saveMasterSuppliersAllAction,
} from "@/app/dashboard/show-ops/actions";
import { partnerIslands, partnerSearchHaystack, partnerSellsOnIsland } from "@/lib/show-ops/partners";
import { PartnerBillingFields } from "@/components/show-ops/partner-billing-fields";
import { NumberInput } from "@/components/ui/number-input";

function stopEnterSubmit(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key !== "Enter") return;
  const el = e.target;
  if (el instanceof HTMLButtonElement || el instanceof HTMLTextAreaElement) return;
  e.preventDefault();
}

export type MasterSupplierRow = {
  id: string;
  name: string;
  email: string | null;
  partner_type: string;
  island?: string | null;
  billing_mode: string;
  deposit_percent: number;
  invoice_nett_percent: number;
  no_show_policy?: string | null;
  sale_rate_id?: string | null;
  invoice_rate_id?: string | null;
  tax_id?: string | null;
  legal_name?: string | null;
  invoice_address?: string | null;
  can_choose_billing_mode?: boolean | null;
  active: boolean | null;
};

/** Rate cards (legacy MHT "rates") a partner can be priced against. */
export type MasterRateRow = {
  id: string;
  name: string;
  rate_type: "sale" | "invoice";
  commission_percent: number | null;
  active: boolean;
};

function setField(form: HTMLFormElement, name: string, value: string) {
  const el = form.elements.namedItem(name);
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    el.value = value;
  }
}

function setCheckbox(form: HTMLFormElement, name: string, on: boolean) {
  const el = form.elements.namedItem(name);
  if (el instanceof HTMLInputElement && el.type === "checkbox") el.checked = on;
}

/**
 * Ticks one value inside a same-named checkbox group (the partner location boxes),
 * leaving the partner's other locations alone. A partner already set to All is
 * left alone too — it already sells there.
 */
function tickLocation(form: HTMLFormElement, name: string, value: string) {
  const group = form.elements.namedItem(name);
  const boxes =
    group instanceof RadioNodeList
      ? [...group].filter((el): el is HTMLInputElement => el instanceof HTMLInputElement)
      : group instanceof HTMLInputElement
        ? [group]
        : [];
  if (boxes.some((b) => b.value.toUpperCase() === "ALL" && b.checked)) return;
  const target = boxes.find((b) => b.value === value);
  if (target) target.checked = true;
}

export type MasterSupplierStat = { bookings: number; pax: number; revenue: number };

export function MasterSuppliersForm({
  suppliers,
  partnerTypes,
  islands = [],
  rates = [],
  tab,
  stats = {},
  statsLabel = "this year",
  currency = "eur",
  highlightId,
}: {
  suppliers: MasterSupplierRow[];
  partnerTypes: string[];
  islands?: string[];
  rates?: MasterRateRow[];
  tab: "partners" | "rates";
  stats?: Record<string, MasterSupplierStat>;
  statsLabel?: string;
  currency?: string;
  highlightId?: string;
}) {
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: (currency || "eur").toUpperCase(),
      maximumFractionDigits: 0,
    }).format(n || 0);
  const formRef = useRef<HTMLFormElement>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [openIds, setOpenIds] = useState<Set<string>>(() => (highlightId ? new Set([highlightId]) : new Set()));
  const [copied, setCopied] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const locations = [...new Set(
    [...islands, ...suppliers.flatMap((s) => partnerIslands(s.island))]
      .map((island) => island.trim())
      .filter((island) => island && island.toUpperCase() !== "ALL"),
  )].sort((a, b) => a.localeCompare(b));
  const visible = suppliers.filter((s) => {
    if (!partnerSellsOnIsland(s.island, location)) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return partnerSearchHaystack(s).includes(q);
  });

  useEffect(() => {
    if (!highlightId) return;
    setOpenIds((cur) => new Set(cur).add(highlightId));
    document.getElementById(`created-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  function toggleOpen(id: string) {
    setOpenIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Partner booking link — they sign in and only ever see their own bookings. */
  async function copyPortalLink(id: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/partner`);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      /* clipboard blocked — the link is shown on the row anyway */
    }
  }
  // Live rate cards first, retired ones still listed so historic partners keep showing their rate.
  const byRate = (a: MasterRateRow, b: MasterRateRow) =>
    Number(b.active) - Number(a.active) || a.name.localeCompare(b.name);
  const saleRates = rates.filter((r) => r.rate_type === "sale").sort(byRate);
  const invoiceRates = rates.filter((r) => r.rate_type === "invoice").sort(byRate);

  const allOn = visible.length > 0 && visible.every((s) => ticked.has(s.id));

  return (
    <form
      ref={formRef}
      className="mt-4 space-y-3"
      onKeyDown={stopEnterSubmit}
    >
      <input type="hidden" name="tab" value={tab} />
      {[...ticked].map((id) => (
        <input key={id} type="hidden" name="ticked" value={id} />
      ))}
      <div className="sticky top-0 z-10 space-y-3 rounded-xl bg-white/95 p-3 ring-1 ring-slate-200 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setBulkOpen((o) => !o)}
            aria-expanded={bulkOpen}
            title="Mass-edit partners"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${
              bulkOpen
                ? "bg-[var(--show-ops-primary,#7c3aed)] text-white ring-transparent"
                : "bg-[var(--show-ops-primary,#7c3aed)]/10 text-[var(--show-ops-primary,#7c3aed)] ring-[var(--show-ops-primary,#7c3aed)]/25 hover:bg-[var(--show-ops-primary,#7c3aed)]/20"
            }`}
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              checked={allOn}
              onChange={(e) => setTicked(e.target.checked ? new Set(visible.map((s) => s.id)) : new Set())}
            />
            Tick all
          </label>
          <span className="text-xs text-slate-500">
            {ticked.size || "None"} selected · {visible.length} shown
            {visible.length !== suppliers.length ? ` of ${suppliers.length}` : ""}
          </span>
          <button
            type="submit"
            formAction={saveMasterSuppliersAllAction}
            className="ml-auto rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white"
          >
            Save all partners
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1 text-xs font-medium text-slate-600">
            Search
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, type or island"
              className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Island
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 w-full min-w-[10rem] rounded-lg border px-2 py-1.5 text-sm"
            >
              <option value="">All islands</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={bulkOpen ? "grid gap-2 sm:grid-cols-4" : "hidden"}>
          <label className="text-xs font-medium text-slate-600">
            Set billing
            <select name="bulk_billing_mode" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              <option value="">Keep</option>
              <option value="deposit">Deposit %</option>
              <option value="invoice">Invoice nett</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Set deposit %
            <NumberInput name="bulk_deposit_percent" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Set invoice nett %
            <NumberInput name="bulk_invoice_nett_percent" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Add location to ticked
            <select name="bulk_add_island" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              <option value="">Keep</option>
              {islands.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            No-show default
            <select name="bulk_no_show_policy" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              <option value="">Keep</option>
              <option value="charge">Charge anyway</option>
              <option value="write_off">Write off</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Active
            <select name="bulk_active" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              <option value="">Keep</option>
              <option value="1">Active</option>
              <option value="0">Off</option>
            </select>
          </label>
          <button
            type="submit"
            name="intent"
            value="bulk"
            formAction={applyMasterSuppliersBulkAction}
            disabled={!ticked.size}
            className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white sm:col-span-4 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              const form = formRef.current;
              if (!form || !ticked.size) return;
              const fd = new FormData(form);
              const billing = String(fd.get("bulk_billing_mode") ?? "").trim();
              const deposit = String(fd.get("bulk_deposit_percent") ?? "").trim();
              const nett = String(fd.get("bulk_invoice_nett_percent") ?? "").trim();
              const active = String(fd.get("bulk_active") ?? "");
              const addIsland = String(fd.get("bulk_add_island") ?? "").trim();
              for (const id of ticked) {
                const p = `${id}::`;
                if (billing) setField(form, `${p}billing_mode`, billing);
                if (deposit) setField(form, `${p}deposit_percent`, deposit);
                if (nett) setField(form, `${p}invoice_nett_percent`, nett);
                if (active === "1" || active === "0") setCheckbox(form, `${p}active`, active === "1");
                // Adds the island alongside whatever the partner already sells —
                // it never takes one away.
                if (addIsland) tickLocation(form, `${p}island`, addIsland);
              }
            }}
          >
            Apply to ticked
          </button>
        </div>
      </div>

      {visible.map((s) => {
        const prefix = `${s.id}::`;
        const open = openIds.has(s.id);
        return (
          <div
            key={s.id}
            id={`created-${s.id}`}
            className={`rounded-xl bg-white ring-1 ${
              highlightId === s.id
                ? "ring-2 ring-[var(--show-ops-primary,#7c3aed)]"
                : "ring-slate-200"
            }`}
          >
            <input type="hidden" name="supplier_id" value={s.id} />
            <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <input
                type="checkbox"
                aria-label={`Include ${s.name} in bulk edit`}
                checked={ticked.has(s.id)}
                onChange={(e) => {
                  setTicked((cur) => {
                    const next = new Set(cur);
                    if (e.target.checked) next.add(s.id);
                    else next.delete(s.id);
                    return next;
                  });
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-900">
                  {s.name}
                  {highlightId === s.id ? (
                    <span className="ml-2 rounded-full bg-[var(--show-ops-primary,#7c3aed)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--show-ops-primary,#7c3aed)]">
                      Just added
                    </span>
                  ) : null}
                  {s.active === false ? (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      Off
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {s.partner_type.replace(/_/g, " ")}
                  {s.island ? ` · ${s.island}` : ""} ·{" "}
                  {s.billing_mode === "deposit"
                    ? `deposit ${s.deposit_percent}%`
                    : `invoice nett ${s.invoice_nett_percent}%`}
                  {s.email ? ` · ${s.email}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold tabular-nums text-slate-900">
                  {fmtMoney(stats[s.id]?.revenue ?? 0)}
                </span>
                <span className="block text-[11px] text-slate-400">
                  {stats[s.id]?.bookings ?? 0} bookings · {stats[s.id]?.pax ?? 0} pax {statsLabel}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void copyPortalLink(s.id)}
                title="Copy this partner's booking link — they sign in and only see their own bookings"
                className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
              >
                {copied === s.id ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}
                {copied === s.id ? "Copied" : "Booking link"}
              </button>
              <button
                type="button"
                onClick={() => toggleOpen(s.id)}
                aria-label={`Edit ${s.name}`}
                aria-expanded={open}
                className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${
                  open
                    ? "bg-[var(--show-ops-primary,#7c3aed)] text-white ring-transparent"
                    : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                <Pencil className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* Fields stay mounted when collapsed so "Save all" and bulk-apply keep working. */}
            <div className={open ? "grid gap-2 border-t border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-3" : "hidden"}>
              <label className="text-xs font-medium text-slate-600">
                Name
                <input name={`${prefix}name`} required defaultValue={s.name} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Invoice email
                <input name={`${prefix}email`} type="email" defaultValue={s.email ?? ""} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Legal name
                <input name={`${prefix}legal_name`} defaultValue={s.legal_name ?? ""} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-600">
                NIF / tax ID
                <input name={`${prefix}tax_id`} defaultValue={s.tax_id ?? ""} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-600 sm:col-span-3">
                Invoice address
                <input name={`${prefix}invoice_address`} defaultValue={s.invoice_address ?? ""} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Partner type
                <select name={`${prefix}partner_type`} defaultValue={s.partner_type} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
                  {(partnerTypes.includes(s.partner_type) ? partnerTypes : [s.partner_type, ...partnerTypes]).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <PartnerLocations prefix={prefix} islands={islands} value={s.island} />
              <label className="text-xs font-medium text-slate-600">
                Sale rate
                <select name={`${prefix}sale_rate_id`} defaultValue={s.sale_rate_id ?? ""} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
                  <option value="">— none —</option>
                  {saleRates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.active ? "" : " (retired)"}
                    </option>
                  ))}
                </select>
              </label>
              <PartnerBillingFields
                prefix={prefix} billingMode={s.billing_mode} depositPercent={s.deposit_percent}
                invoiceNettPercent={s.invoice_nett_percent} canChoose={Boolean(s.can_choose_billing_mode)}
                invoiceRate={
              <label className="text-xs font-medium text-slate-600">
                Invoice rate
                <select name={`${prefix}invoice_rate_id`} defaultValue={s.invoice_rate_id ?? ""} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
                  <option value="">— none —</option>
                  {invoiceRates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.commission_percent == null ? "" : ` — ${r.commission_percent}%`}
                      {r.active ? "" : " (retired)"}
                    </option>
                  ))}
                </select>
              </label>
                }
              />
              <label className="text-xs font-medium text-slate-600">
                No-show default
                <select
                  name={`${prefix}no_show_policy`}
                  defaultValue={s.no_show_policy === "write_off" ? "write_off" : "charge"}
                  className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
                >
                  <option value="charge">Charge anyway</option>
                  <option value="write_off">Write off</option>
                </select>
              </label>
              <p className="text-xs text-slate-500 sm:col-span-2">
                Booking link: <span className="font-mono text-slate-700">/partner</span> — send it only to partners you
                want booking directly. They need a login (Settings → Seller portals); without one the link does nothing,
                and they only ever see their own bookings.
              </p>
              <label className="flex items-center gap-2 self-end pb-2 text-xs">
                <input type="checkbox" name={`${prefix}active`} value="1" defaultChecked={s.active !== false} /> Active
              </label>
              <div className="flex flex-wrap items-center gap-4 self-end sm:col-span-3">
                <button
                  type="submit"
                  formAction={saveMasterSupplierOneAction.bind(null, s.id)}
                  className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white"
                >
                  Save this partner
                </button>
                <button
                  type="submit"
                  formAction={deleteSupplierAction.bind(null, s.id)}
                  onClick={(e) => {
                    if (!confirm(`Delete "${s.name}"? Only possible if it has no bookings or invoices.`)) e.preventDefault();
                  }}
                  className="text-xs font-medium text-rose-700 underline"
                >
                  Delete partner
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {!visible.length ? (
        <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
          {suppliers.length ? "No partners match that search." : "No partners yet — add one above."}
        </p>
      ) : null}

    </form>
  );
}

/**
 * Locations a partner sells on. Ticking nothing (or ticking ALL) means every
 * island — which is how the legacy export arrived, with no Gran Canaria anywhere
 * even though a third of the hotels are there.
 */
function PartnerLocations({
  prefix,
  islands,
  value,
}: {
  prefix: string;
  islands: string[];
  value?: string | null;
}) {
  const current = partnerIslands(value);
  const all = current.length === 0 || current.some((v) => v.toUpperCase() === "ALL");
  const [everywhere, setEverywhere] = useState(all);
  // Locations the partner already has that are not in the tenant's island list.
  const extras = current.filter((v) => v.toUpperCase() !== "ALL" && !islands.includes(v));

  return (
    <fieldset className="text-xs font-medium text-slate-600 sm:col-span-2">
      <legend>Locations</legend>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border bg-white px-2 py-1.5">
        <label className="flex items-center gap-1.5 font-semibold">
          <input
            type="checkbox"
            name={`${prefix}island`}
            value="ALL"
            checked={everywhere}
            onChange={(e) => setEverywhere(e.target.checked)}
          />
          All
        </label>
        {[...islands, ...extras].map((i) => (
          <label key={i} className={`flex items-center gap-1.5 ${everywhere ? "text-slate-400" : ""}`}>
            <input
              type="checkbox"
              name={`${prefix}island`}
              value={i}
              defaultChecked={current.includes(i)}
              disabled={everywhere}
            />
            {i}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
