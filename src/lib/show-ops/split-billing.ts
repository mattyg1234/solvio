/**
 * Split billing (Matty, 9 Nov 2026): a partner set to "can do both" can put some
 * guests of one booking on invoice and the rest on deposit. The Hub saves it as
 * two linked bookings, one per billing mode, so invoices, the door, payments and
 * reports all keep working on plain deposit / invoice bookings.
 */

export const SPLIT_BILLING = "split";

type Pax = { adults: number; children: number; infants: number };

function count(v: FormDataEntryValue | null): number {
  const n = Math.floor(Number(v ?? 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export type SplitForms =
  | { ok: true; invoice: FormData; deposit: FormData; invoicePax: Pax; depositPax: Pax }
  | { ok: false; error: string };

/** Null when the form is not a split; otherwise the two forms to save, invoice part first. */
export function splitBillingForms(formData: FormData): SplitForms | null {
  if (String(formData.get("billing_mode") ?? "") !== SPLIT_BILLING) return null;
  const total: Pax = {
    adults: count(formData.get("adults")),
    children: count(formData.get("children")),
    infants: count(formData.get("infants")),
  };
  const invoicePax: Pax = {
    adults: count(formData.get("split_invoice_adults")),
    children: count(formData.get("split_invoice_children")),
    infants: count(formData.get("split_invoice_infants")),
  };
  if (invoicePax.adults > total.adults || invoicePax.children > total.children || invoicePax.infants > total.infants) {
    return { ok: false, error: "More guests on invoice than on the booking. Check the split numbers." };
  }
  const depositPax: Pax = {
    adults: total.adults - invoicePax.adults,
    children: total.children - invoicePax.children,
    infants: total.infants - invoicePax.infants,
  };
  const invoicePeople = invoicePax.adults + invoicePax.children;
  const depositPeople = depositPax.adults + depositPax.children;
  if (!invoicePeople || !depositPeople) {
    return { ok: false, error: "A split needs at least one adult or child on invoice and one on deposit. Otherwise pick Deposit or Invoice." };
  }
  const note = `Split booking: ${describe(invoicePax)} on invoice, ${describe(depositPax)} on deposit.`;

  const make = (pax: Pax, mode: "invoice" | "deposit") => {
    const fd = new FormData();
    for (const [k, v] of formData.entries()) {
      if (k.startsWith("split_invoice_")) continue;
      fd.append(k, v);
    }
    fd.set("billing_mode", mode);
    fd.set("split_part", "1");
    fd.set("adults", String(pax.adults));
    fd.set("children", String(pax.children));
    fd.set("infants", String(pax.infants));
    const comments = String(formData.get("office_comments") ?? "").trim();
    fd.set("office_comments", comments ? `${comments}\n${note}` : note);
    if (mode === "invoice") {
      // One guest message, from the deposit part (it carries what is left to pay).
      fd.delete("send_ticket");
      // Extras, attendee names and the ticket photo stay on the deposit part only.
      fd.set("extras", "[]");
      fd.delete("ticket_photo");
      for (const k of [...fd.keys()]) if (k.startsWith("attendee_")) fd.delete(k);
    }
    return fd;
  };

  return { ok: true, invoice: make(invoicePax, "invoice"), deposit: make(depositPax, "deposit"), invoicePax, depositPax };
}

export function describe(p: Pax): string {
  const parts = [
    p.adults ? `${p.adults} adult${p.adults === 1 ? "" : "s"}` : "",
    p.children ? `${p.children} child${p.children === 1 ? "" : "ren"}` : "",
    p.infants ? `${p.infants} infant${p.infants === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return parts.join(" + ") || "nobody";
}
