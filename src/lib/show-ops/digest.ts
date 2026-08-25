import { addDaysIso, formatShowOpsMoney, paxTotal, round2 } from "@/lib/show-ops/calc";
import type { ShowOpsCurrency } from "@/lib/show-ops/types";

export { addDaysIso };

export type DigestBooking = {
  booking_ref: string;
  guest_name: string;
  show_name: string;
  show_date: string;
  island: string;
  supplier_name: string | null;
  adults: number;
  children: number;
  infants: number;
  total_cost: number;
  nett_total?: number | null;
  billing_mode: string;
  payment_status: string;
  created_at: string;
};

export type DigestBus = {
  island: string;
  seats_ordered: number;
  cost_total: number;
  bus_pax: number;
};

export function isoDateInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

export function buildDailyDigest(input: {
  reportDate: string;
  currency: ShowOpsCurrency;
  takenYesterday: DigestBooking[];
  lastNightShows: DigestBooking[];
  tonightBus: DigestBus[];
  merchantName: string;
}): {
  subject: string;
  text: string;
  html: string;
} {
  const money = (n: number) => formatShowOpsMoney(n, input.currency);
  const paxOf = (rows: DigestBooking[]) =>
    rows.reduce((s, b) => s + paxTotal(b.adults, b.children, b.infants), 0);
  const takenPax = paxOf(input.takenYesterday);
  const takenGross = round2(input.takenYesterday.reduce((s, b) => s + Number(b.total_cost || 0), 0));
  const byShow = new Map<string, { count: number; pax: number }>();
  const byPartner = new Map<string, { count: number; pax: number }>();
  for (const b of input.takenYesterday) {
    const pax = paxTotal(b.adults, b.children, b.infants);
    const show = byShow.get(b.show_name) || { count: 0, pax: 0 };
    show.count += 1;
    show.pax += pax;
    byShow.set(b.show_name, show);
    const name = b.supplier_name?.trim() || "Direct";
    const partner = byPartner.get(name) || { count: 0, pax: 0 };
    partner.count += 1;
    partner.pax += pax;
    byPartner.set(name, partner);
  }
  const unpaid = input.takenYesterday.filter(
    (b) => b.billing_mode === "deposit" && b.payment_status !== "paid" && b.payment_status !== "n_a",
  );

  const showLines = [...byShow.entries()]
    .sort((a, b) => b[1].pax - a[1].pax)
    .map(([n, v]) => `${n}: ${v.count} bookings · ${v.pax} pax`);
  const partnerLines = [...byPartner.entries()]
    .sort((a, b) => b[1].pax - a[1].pax)
    .slice(0, 8)
    .map(([n, v]) => `${n}: ${v.count} · ${v.pax} pax`);
  const lastNightPax = paxOf(input.lastNightShows);
  const busLines = input.tonightBus.map((b) => {
    const left = b.seats_ordered - b.bus_pax;
    const cph = b.bus_pax > 0 && b.cost_total > 0 ? money(round2(b.cost_total / b.bus_pax)) : "—";
    return `${b.island}: ${b.bus_pax} on bus · ${b.seats_ordered} ordered · ${left} left · spend ${money(b.cost_total)} · ${cph}/head`;
  });

  const subject = `${input.merchantName} · ${input.reportDate} · ${input.takenYesterday.length} bookings / ${takenPax} pax`;
  const text = [
    `${input.merchantName} — in-house digest for ${input.reportDate}`,
    "",
    `Taken yesterday: ${input.takenYesterday.length} bookings · ${takenPax} pax · ${money(takenGross)}`,
    showLines.length ? `By show:\n${showLines.map((l) => `  ${l}`).join("\n")}` : "By show: none",
    partnerLines.length ? `By partner:\n${partnerLines.map((l) => `  ${l}`).join("\n")}` : "By partner: none",
    unpaid.length ? `Unpaid deposits in that batch: ${unpaid.length}` : "Unpaid deposits: none",
    "",
    `Last night on the shows: ${input.lastNightShows.length} bookings · ${lastNightPax} pax`,
    busLines.length ? `Tonight bus:\n${busLines.map((l) => `  ${l}`).join("\n")}` : "Tonight bus: none ordered yet",
  ].join("\n");

  const htmlList = (lines: string[]) =>
    lines.length
      ? `<ul style="padding-left:18px;line-height:1.5">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`
      : `<p style="color:#64748b">None</p>`;

  const html = `
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <p style="font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin:0 0 8px">In-house digest</p>
      <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(input.merchantName)} · ${escapeHtml(input.reportDate)}</h1>
      <p style="font-size:16px;margin:0 0 12px"><strong>${input.takenYesterday.length}</strong> bookings taken yesterday · <strong>${takenPax}</strong> pax · ${escapeHtml(money(takenGross))}</p>
      <h2 style="font-size:14px;margin:20px 0 6px">By show</h2>
      ${htmlList(showLines)}
      <h2 style="font-size:14px;margin:20px 0 6px">By partner</h2>
      ${htmlList(partnerLines)}
      <p style="font-size:14px">${unpaid.length ? `${unpaid.length} unpaid deposit${unpaid.length === 1 ? "" : "s"} in that batch.` : "No unpaid deposits in that batch."}</p>
      <h2 style="font-size:14px;margin:20px 0 6px">Last night on the shows</h2>
      <p>${input.lastNightShows.length} bookings · ${lastNightPax} pax</p>
      <h2 style="font-size:14px;margin:20px 0 6px">Tonight’s buses</h2>
      ${htmlList(busLines)}
    </div>
  `;

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
