"use client";

import { useMemo, useState } from "react";

import { issueInvoiceAction, saveInvoiceDraftAction } from "@/app/dashboard/show-ops/actions";
import { SHOW_OPS_PRIMARY_BTN } from "@/components/show-ops/show-ops-page-header";
import { SubmitOnce } from "@/components/show-ops/submit-once";
import { NumberInput } from "@/components/ui/number-input";
import { formatShowOpsMoney } from "@/lib/show-ops/calc";
import { recalcInvoiceLine, sumInvoiceLines } from "@/lib/show-ops/invoice";
import type { ShowOpsCurrency } from "@/lib/show-ops/types";

export type InvoiceEditorLine = {
  id: string;
  booking_id: string | null;
  booking_ref: string | null;
  guest_name: string | null;
  supplier_ticket_number: string | null;
  description: string;
  adults: number;
  children: number;
  adult_unit_price: number;
  child_unit_price: number;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  notes: string | null;
  line_kind: "booking" | "manual";
};

export function InvoiceEditor({
  invoiceId,
  series,
  invoiceDate,
  paymentTermsDays,
  notes,
  recipientName,
  recipientTaxId,
  recipientAddress,
  defaultVatRate,
  currency,
  lines: initialLines,
}: {
  invoiceId: string;
  series: string;
  invoiceDate: string;
  paymentTermsDays: number;
  notes: string;
  recipientName: string;
  recipientTaxId: string;
  recipientAddress: string;
  defaultVatRate: number;
  currency: ShowOpsCurrency;
  lines: InvoiceEditorLine[];
}) {
  const [lines, setLines] = useState(initialLines);
  const money = (n: number) => formatShowOpsMoney(n, currency);

  const computed = useMemo(
    () =>
      lines.map((l) => {
        const row =
          l.line_kind === "manual"
            ? recalcInvoiceLine({ quantity: l.quantity, unitPrice: l.unit_price, vatRate: l.vat_rate })
            : recalcInvoiceLine({
                adults: l.adults,
                children: l.children,
                adultUnit: l.adult_unit_price,
                childUnit: l.child_unit_price,
                vatRate: l.vat_rate,
              });
        return { ...l, row };
      }),
    [lines],
  );
  const totals = sumInvoiceLines(computed.map((c) => c.row));

  function patch(id: string, next: Partial<InvoiceEditorLine>) {
    setLines((cur) => cur.map((l) => (l.id === id ? { ...l, ...next } : l)));
  }

  function addExtra() {
    setLines((cur) => [
      ...cur,
      {
        id: `new-${Date.now()}`,
        booking_id: null,
        booking_ref: "",
        guest_name: "Extra",
        supplier_ticket_number: null,
        description: "",
        adults: 0,
        children: 0,
        adult_unit_price: 0,
        child_unit_price: 0,
        quantity: 1,
        unit_price: 0,
        vat_rate: defaultVatRate,
        notes: null,
        line_kind: "manual",
      },
    ]);
  }

  return (
    <form className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 print:hidden">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-slate-600">
          Invoice date
          <input type="date" name="invoice_date" defaultValue={invoiceDate} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Payment terms
          <select name="payment_terms_days" defaultValue={paymentTermsDays} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
            {[7, 15, 30, 45, 60, 90].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Series
          <input name="series" defaultValue={series} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm uppercase" />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Bill to
          <input name="recipient_name" defaultValue={recipientName} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Recipient NIF / tax ID
          <input name="recipient_tax_id" defaultValue={recipientTaxId} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs font-medium text-slate-600 sm:col-span-3">
          Recipient address
          <input name="recipient_address" defaultValue={recipientAddress} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs font-medium text-slate-600 sm:col-span-3">
          Notes (on invoice)
          <textarea name="notes" defaultValue={notes} rows={2} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1 pr-2">Description</th>
              <th className="py-1 pr-2">Qty / pax</th>
              <th className="py-1 pr-2">Unit</th>
              <th className="py-1 pr-2">Tax %</th>
              <th className="py-1 pr-2 text-right">Net</th>
              <th className="py-1 pr-2 text-right">Tax</th>
              <th className="py-1 text-right">Total</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {computed.map(({ row, ...l }) => (
              <tr key={l.id} className="border-t align-top">
                <td className="py-2 pr-2">
                  <input type="hidden" name="line_id" value={l.id} />
                  <input type="hidden" name={`line_kind_${l.id}`} value={l.line_kind} />
                  <input type="hidden" name={`booking_id_${l.id}`} value={l.booking_id ?? ""} />
                  <input type="hidden" name={`booking_ref_${l.id}`} value={l.booking_ref ?? ""} />
                  <input type="hidden" name={`guest_name_${l.id}`} value={l.guest_name ?? ""} />
                  <input type="hidden" name={`ticket_${l.id}`} value={l.supplier_ticket_number ?? ""} />
                  <input type="hidden" name={`notes_${l.id}`} value={l.notes ?? ""} />
                  <input
                    name={`description_${l.id}`}
                    value={l.description}
                    onChange={(e) => patch(l.id, { description: e.target.value })}
                    className="w-full min-w-[12rem] rounded-lg border px-2 py-1.5 text-sm"
                  />
                  {l.notes ? <p className="mt-1 text-xs text-slate-500">{l.notes}</p> : null}
                  {l.booking_ref ? <p className="mt-0.5 font-mono text-[11px] text-slate-400">{l.booking_ref}</p> : null}
                </td>
                <td className="py-2 pr-2">
                  {l.line_kind === "manual" ? (
                    <NumberInput
                      name={`quantity_${l.id}`}
                      value={l.quantity}
                      onValueChange={(n) => patch(l.id, { quantity: n === "" ? 0 : n })}
                      className="w-20 rounded-lg border px-2 py-1.5 text-sm"
                    />
                  ) : (
                    <div className="flex gap-1">
                      <label className="text-[10px] text-slate-500">
                        Ad
                        <NumberInput
                          name={`adults_${l.id}`}
                          value={l.adults}
                          onValueChange={(n) => patch(l.id, { adults: n === "" ? 0 : n })}
                          className="mt-0.5 w-14 rounded-lg border px-2 py-1.5 text-sm"
                        />
                      </label>
                      <label className="text-[10px] text-slate-500">
                        Ch
                        <NumberInput
                          name={`children_${l.id}`}
                          value={l.children}
                          onValueChange={(n) => patch(l.id, { children: n === "" ? 0 : n })}
                          className="mt-0.5 w-14 rounded-lg border px-2 py-1.5 text-sm"
                        />
                      </label>
                    </div>
                  )}
                </td>
                <td className="py-2 pr-2">
                  {l.line_kind === "manual" ? (
                    <NumberInput
                      name={`unit_price_${l.id}`}
                      value={l.unit_price}
                      onValueChange={(n) => patch(l.id, { unit_price: n === "" ? 0 : n })}
                      className="w-24 rounded-lg border px-2 py-1.5 text-sm"
                    />
                  ) : (
                    <div className="flex gap-1">
                      <NumberInput
                        name={`adult_unit_${l.id}`}
                        value={l.adult_unit_price}
                        onValueChange={(n) => patch(l.id, { adult_unit_price: n === "" ? 0 : n })}
                        className="w-20 rounded-lg border px-2 py-1.5 text-sm"
                      />
                      <NumberInput
                        name={`child_unit_${l.id}`}
                        value={l.child_unit_price}
                        onValueChange={(n) => patch(l.id, { child_unit_price: n === "" ? 0 : n })}
                        className="w-20 rounded-lg border px-2 py-1.5 text-sm"
                      />
                    </div>
                  )}
                </td>
                <td className="py-2 pr-2">
                  <NumberInput
                    name={`vat_rate_${l.id}`}
                    value={l.vat_rate}
                    onValueChange={(n) => patch(l.id, { vat_rate: n === "" ? 0 : n })}
                    className="w-16 rounded-lg border px-2 py-1.5 text-sm"
                  />
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{money(row.netTotal)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{money(row.vatAmount)}</td>
                <td className="py-2 text-right font-medium tabular-nums">{money(row.lineTotal)}</td>
                <td className="py-2 pl-2">
                  <label className="text-[11px] text-rose-700">
                    <input type="checkbox" name={`delete_${l.id}`} value="1" className="mr-1" />
                    Remove
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={addExtra}
          className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--show-ops-primary,#7c3aed)] ring-1 ring-[var(--show-ops-primary,#7c3aed)]/30"
        >
          Add extra line
        </button>
        <div className="text-right text-sm">
          <p className="text-slate-600">Net {money(totals.netTotal)} · Tax {money(totals.vatTotal)}</p>
          <p className="text-lg font-semibold text-slate-900">Total {money(totals.grandTotal)}</p>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Save keeps this as a draft so you can keep editing prices. Issue assigns the next number in this series and
        locks the invoice. Verifactu is ready: with no API key it stays local (status manual); paste the key later and
        retry from this page.
      </p>

      <div className="flex flex-wrap gap-2">
        <SubmitOnce formAction={saveInvoiceDraftAction} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-200">
          Save draft
        </SubmitOnce>
        <SubmitOnce formAction={issueInvoiceAction} className={SHOW_OPS_PRIMARY_BTN}>
          Issue invoice
        </SubmitOnce>
      </div>
    </form>
  );
}
