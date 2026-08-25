import { partnerSellsOnIsland } from "@/lib/show-ops/partners";

import type { CloseKind } from "@/lib/show-ops/calendar";

export type CloseSalePartner = {
  name: string;
  email: string | null;
  island: string | null;
  active?: boolean | null;
};

export function closeSaleRecipients(
  partners: CloseSalePartner[],
  island: string,
): Array<{ name: string; email: string }> {
  const out: Array<{ name: string; email: string }> = [];
  const seen = new Set<string>();
  for (const p of partners) {
    if (p.active === false) continue;
    const email = (p.email || "").trim().toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    if (!partnerSellsOnIsland(p.island, island)) continue;
    seen.add(email);
    out.push({ name: p.name, email });
  }
  return out;
}

export function closeSaleCopy(input: {
  kind: CloseKind;
  merchantName: string;
  island: string;
  showDate: string;
  showName: string | null;
  note: string | null;
}): { subject: string; text: string; html: string } {
  const show = input.showName?.trim() || "all shows";
  const full = input.kind === "full";
  const headline = full ? "STOP SELLING" : "PART CLOSE — last seats only";
  const subject = `${input.merchantName} · ${headline} · ${show} · ${input.showDate}`;
  const body = full
    ? `Please stop selling ${show} on ${input.showDate} (${input.island}). Do not take any more bookings for this night.`
    : `Part close on ${show} · ${input.showDate} (${input.island}). Please stop extra sales — last seats only, check with the office before adding more.`;
  const note = input.note?.trim() ? `\n\nOffice note: ${input.note.trim()}` : "";
  const text = `${headline}\n\n${body}${note}\n\n${input.merchantName}`;
  const html = `
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <p style="display:inline-block;background:${full ? "#9f1239" : "#b45309"};color:#fff;font-weight:700;font-size:12px;letter-spacing:.08em;padding:6px 10px;border-radius:999px">${escapeHtml(headline)}</p>
      <p style="font-size:16px;line-height:1.5;margin-top:16px">${escapeHtml(body)}</p>
      ${input.note?.trim() ? `<p style="color:#64748b;font-size:14px">Office note: ${escapeHtml(input.note.trim())}</p>` : ""}
      <p style="color:#64748b;font-size:13px;margin-top:24px">${escapeHtml(input.merchantName)}</p>
    </div>
  `;
  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
