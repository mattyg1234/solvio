"use client";

import { useState, type ReactNode } from "react";

/** Inactive inputs stay mounted so saving another field preserves the other method's agreed rate. */
export function PartnerBillingFields({
  prefix = "", billingMode = "deposit", depositPercent = 30, invoiceNettPercent = 100,
  canChoose = false, invoiceRate,
}: {
  prefix?: string; billingMode?: string; depositPercent?: number; invoiceNettPercent?: number;
  canChoose?: boolean; invoiceRate?: ReactNode;
}) {
  const [mode, setMode] = useState(billingMode);
  const [choice, setChoice] = useState(canChoose);
  const [nett, setNett] = useState(String(invoiceNettPercent));
  const showDeposit = mode === "deposit" || choice;
  const showInvoice = mode === "invoice" || choice;
  const fieldClass = "mt-1 w-full rounded-lg border px-2 py-1.5 text-sm";
  return (
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:col-span-3 sm:grid-cols-3">
      <label className="text-xs font-medium text-slate-600">
        How this partner pays
        <select name={`${prefix}billing_mode`} defaultValue={billingMode} onChange={(e) => setMode(e.target.value)} className={fieldClass}>
          <option value="deposit">Deposit upfront</option>
          <option value="invoice">Invoice the partner</option>
        </select>
      </label>
      <label className="flex items-start gap-2 text-xs text-slate-600 sm:col-span-2">
        <input type="checkbox" name={`${prefix}can_choose_billing_mode`} value="1" defaultChecked={canChoose} onChange={(e) => setChoice(e.target.checked)} />
        Let the desk choose deposit or invoice for each booking
      </label>
      <div className={showDeposit ? "rounded-lg bg-slate-50 p-3 sm:col-span-3" : "hidden"}>
        <label className="block text-xs font-medium text-slate-700">
          Deposit collected upfront %
          <input type="number" name={`${prefix}deposit_percent`} defaultValue={depositPercent} min={0} max={100} step="0.01" required={showDeposit} className={fieldClass} />
        </label>
        <p className="mt-2 text-xs text-slate-500">Part of the guest ticket price collected upfront. The rest remains due. This is not an invoice nett rate.</p>
      </div>
      <div className={showInvoice ? "space-y-3 rounded-lg bg-slate-50 p-3 sm:col-span-3" : "hidden"}>
        <label className="block text-xs font-medium text-slate-700">
          Ticket price invoiced to this partner %
          <input type="number" name={`${prefix}invoice_nett_percent`} defaultValue={invoiceNettPercent} onChange={(e) => setNett(e.target.value)} min={0} max={100} step="0.01" required={showInvoice} className={fieldClass} />
        </label>
        <p className="text-xs text-slate-500">
          {nett !== "" && Number.isFinite(Number(nett)) && Number(nett) >= 0 && Number(nett) <= 100
            ? `${nett}% nett means the partner is invoiced ${nett}% of the ticket price. ${Math.round((100 - Number(nett)) * 100) / 100}% is deducted as commission.`
            : "Enter the agreed percentage of the ticket price to invoice to this partner."}
          {" "}A deposit percentage does not set this rate automatically.
        </p>
        {invoiceRate}
      </div>
    </div>
  );
}
