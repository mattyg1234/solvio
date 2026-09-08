import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";

export type InvoicePdfLogo = { bytes: Uint8Array; kind: "png" | "jpg" };

export type InvoicePdfBranding = {
  /** Embedded top-left of page one and small on continuation pages. */
  logo?: InvoicePdfLogo | null;
  /** Hex colour used for the header rule, table header, totals box and PAID stamp. */
  accentColor?: string | null;
  /** IGIC / IVA / VAT — printed against the tax line. */
  taxLabel?: string | null;
  /** Bank details or registration line printed in the footer. */
  footerNote?: string | null;
  /** Company name for the closing line: "Thank you for working with MHT." Falls back to the issuer name. */
  thankYouName?: string | null;
};

export type InvoicePdfInput = {
  invoice: Record<string, unknown>;
  lines: Array<Record<string, unknown>>;
  branding?: InvoicePdfBranding;
};

export const MAX_INVOICE_PDF_BYTES = 18 * 1024 * 1024;
export const DEFAULT_INVOICE_ACCENT = "#7c3aed";

// A4 with generous margins. Everything below is in PDF points.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const LEFT = MARGIN;
const RIGHT = PAGE_W - MARGIN;
const CONTENT_W = RIGHT - LEFT;
const TOP = PAGE_H - MARGIN;
/** Content never runs below this; the footer band owns the rest of the page. */
const FOOTER_LIMIT = 112;

// Table columns: description gets whatever the numeric columns leave over.
const COL = { date: LEFT + 8, desc: LEFT + 66, qty: 372, net: 432, tax: 490, total: RIGHT - 8 } as const;
const DESC_W = COL.qty - 30 - COL.desc;

export function hexToRgb(hex: string | null | undefined): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  const value = m ? m[1] : DEFAULT_INVOICE_ACCENT.slice(1);
  return rgb(parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-05" → "5 Sep 2026"; anything else is printed as stored. */
export function formatInvoiceDate(raw: unknown): string {
  const text = String(raw ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!m) return text || "–";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** Render stored invoice amounts; never recalculate historical prices from today's catalogue. */
export async function buildInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const { invoice: inv, lines } = input;
  const branding = input.branding ?? {};
  if (!["eur", "gbp", "usd"].includes(String(inv.currency))) throw new Error("Invoice currency is missing or unsupported.");
  if (!lines.length) throw new Error("Invoice has no lines to attach.");
  if (lines.length > 2000) throw new Error("Invoice is too long for one email. Split the invoice pack.");

  const doc = await PDFDocument.create();
  // Two faces of one family: Helvetica for body, Helvetica Bold for headings and emphasis.
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.09, 0.11, 0.18);
  const muted = rgb(0.42, 0.45, 0.52);
  const hairline = rgb(0.86, 0.85, 0.9);
  const zebra = rgb(0.975, 0.972, 0.988);
  const accent = hexToRgb(branding.accentColor);
  const white = rgb(1, 1, 1);

  const number = String(inv.invoice_number || inv.verifactu_number || "Invoice");
  if (number.length > 80) throw new Error("Invoice number is too long to fit safely in the PDF.");
  const taxLabel = String(branding.taxLabel || "Tax").trim().slice(0, 12) || "Tax";
  const dueIso = String(inv.due_date ?? "").slice(0, 10);
  const paid = Boolean(inv.paid);
  const issuerName = String(inv.issuer_name || "").trim();

  doc.setTitle(`Invoice ${number}`);
  doc.setAuthor(issuerName);
  doc.setCreator("Solvio Show Ops");

  let logo: PDFImage | null = null;
  if (branding.logo?.bytes?.length) {
    try {
      logo = branding.logo.kind === "png" ? await doc.embedPng(branding.logo.bytes) : await doc.embedJpg(branding.logo.bytes);
    } catch {
      throw new Error("The business logo could not be embedded in the PDF. Re-upload it as a PNG or JPEG under Settings.");
    }
  }

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = TOP;

  const clean = (value: unknown) => {
    const text = String(value ?? "").replace(/\r\n?/g, "\n").replace(/\t/g, " ");
    if (text.length > 4000) throw new Error("Invoice text is too long to fit safely in the PDF.");
    try { regular.encodeText(text.replace(/\n/g, " ")); } catch {
      throw new Error("Invoice text contains characters unsupported by the PDF font. Review the invoice before sending.");
    }
    return text;
  };
  const wrap = (value: unknown, width: number, size = 9.5, font: PDFFont = regular): string[] => {
    const out: string[] = [];
    for (const paragraph of clean(value).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        if (!word) continue;
        if (font.widthOfTextAtSize(word, size) > width) {
          if (line) { out.push(line); line = ""; }
          for (const char of word) {
            if (font.widthOfTextAtSize(line + char, size) > width) { out.push(line); line = ""; }
            line += char;
          }
        } else if (line && font.widthOfTextAtSize(`${line} ${word}`, size) > width) {
          out.push(line); line = word;
        } else line = line ? `${line} ${word}` : word;
      }
      out.push(line);
    }
    return out;
  };
  const draw = (text: string, x: number, baseline: number, size = 9.5, font: PDFFont = regular, color: RGB = ink) => {
    page.drawText(clean(text), { x, y: baseline, size, font, color });
  };
  const drawRight = (text: string, rightEdge: number, baseline: number, size = 9.5, font: PDFFont = regular, color: RGB = ink) => {
    draw(text, rightEdge - font.widthOfTextAtSize(clean(text), size), baseline, size, font, color);
  };
  const amount = (raw: unknown) => {
    const n = Number(raw ?? 0);
    if (!Number.isFinite(n)) throw new Error("Invoice contains an invalid amount.");
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: String(inv.currency).toUpperCase() }).format(n);
  };
  /** Right-aligned figure that shrinks slightly to fit its column and refuses to overlap the neighbour. */
  const figure = (text: string, rightEdge: number, baseline: number, font: PDFFont = regular, width = 56, color: RGB = ink) => {
    const size = Math.min(9, 9 * width / Math.max(1, font.widthOfTextAtSize(text, 9)));
    if (size < 6) throw new Error("Invoice amount is too wide for the PDF table.");
    drawRight(text, rightEdge, baseline, size, font, color);
  };
  const rule = (yPos: number, color: RGB = hairline, thickness = 0.5) => {
    page.drawLine({ start: { x: LEFT, y: yPos }, end: { x: RIGHT, y: yPos }, thickness, color });
  };
  const drawLogo = (maxW: number, maxH: number, x: number, top: number) => {
    if (!logo) return 0;
    const dims = logo.scaleToFit(maxW, maxH);
    page.drawImage(logo, { x, y: top - dims.height, width: dims.width, height: dims.height });
    return dims.height;
  };

  // ---- Page one header: logo left, metadata block right, accent rule beneath.
  const pageOneHeader = () => {
    const blockTop = y;
    const logoHeight = drawLogo(170, 60, LEFT, blockTop);
    if (!logoHeight) {
      // No logo yet: the legal name takes its place so the header never looks empty.
      const nameLines = wrap(issuerName || "Invoice", 250, 16, bold).slice(0, 2);
      nameLines.forEach((text, i) => draw(text, LEFT, blockTop - 16 - i * 20, 16, bold, accent));
    }
    drawRight("INVOICE", RIGHT, blockTop - 18, 22, bold, accent);
    const meta: Array<[string, string]> = [
      ["Invoice no.", number],
      ["Invoice date", formatInvoiceDate(inv.invoice_date)],
      ["Due date", formatInvoiceDate(inv.due_date)],
      ["Period", `${formatInvoiceDate(inv.period_start)} – ${formatInvoiceDate(inv.period_end)}`],
      ["Status", paid ? `Paid ${formatInvoiceDate(inv.paid_at)}`.trim() : "Awaiting payment"],
    ];
    let metaY = blockTop - 40;
    for (const [label, value] of meta) {
      const valueWidth = bold.widthOfTextAtSize(clean(value), 9);
      draw(label, RIGHT - valueWidth - 10 - regular.widthOfTextAtSize(label, 8), metaY, 8, regular, muted);
      drawRight(value, RIGHT, metaY, 9, bold, ink);
      metaY -= 13;
    }
    const blockHeight = Math.max(logoHeight, blockTop - metaY) + 14;
    y = blockTop - blockHeight;
    rule(y, accent, 1.5);
    y -= 26;
  };

  const continuationHeader = () => {
    const logoHeight = drawLogo(100, 32, LEFT, y);
    if (!logoHeight) draw(issuerName || "Invoice", LEFT, y - 12, 11, bold, accent);
    drawRight(`Invoice ${number}  ·  continued`, RIGHT, y - 12, 9, regular, muted);
    y -= Math.max(logoHeight, 16) + 10;
    rule(y, accent, 1.5);
    y -= 22;
  };

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = TOP;
    continuationHeader();
  };
  const ensure = (height: number) => { if (y - height < FOOTER_LIMIT) newPage(); };

  pageOneHeader();

  // ---- Parties. Each block wraps independently and reserves its full height before the table.
  const colW = (CONTENT_W - 24) / 2;
  const party = (label: string, name: unknown, nif: unknown, address: unknown) => [
    label, ...wrap(name, colW, 10.5, bold), ...(nif ? wrap(`NIF ${nif}`, colW) : []), ...wrap(address, colW),
  ];
  const issuer = party("FROM", inv.issuer_name, inv.issuer_tax_id, inv.issuer_address);
  const recipient = party("BILL TO", inv.recipient_name || inv.supplier_name, inv.recipient_tax_id, inv.recipient_address);
  const partyHeight = Math.max(issuer.length, recipient.length) * 13.5 + 6;
  if (partyHeight > 330) throw new Error("Invoice address is too long to fit safely in the PDF.");
  ensure(partyHeight);
  const partiesTop = y;
  for (const [x, entries] of [[LEFT, issuer], [LEFT + colW + 24, recipient]] as const) {
    entries.forEach((text, i) => {
      if (i === 0) draw(text, x, y - 7, 7.5, bold, muted);
      else draw(text, x, y - 7 - i * 13.5, i === 1 ? 10.5 : 9.5, i === 1 ? bold : regular, ink);
    });
  }
  y -= partyHeight + 22;

  // ---- PAID stamp only, with the date paid beneath: tasteful outline, rotated, beside the parties block.
  if (paid) {
    const label = "PAID";
    const dateLine = inv.paid_at ? formatInvoiceDate(inv.paid_at) : "";
    const color = accent;
    const size = 20;
    const dateSize = 8;
    const labelW = bold.widthOfTextAtSize(label, size);
    const dateW = dateLine ? bold.widthOfTextAtSize(clean(dateLine), dateSize) : 0;
    const boxW = Math.max(labelW, dateW) + 28;
    const boxH = dateLine ? 50 : 38;
    const cx = RIGHT - boxW / 2 - 6;
    const cy = partiesTop - partyHeight / 2 + 4;
    const rot = 12;
    const rad = rot * Math.PI / 180;
    // Everything is placed in the stamp's own rotated frame: local (lx, ly) from the centre.
    const place = (lx: number, ly: number) => ({ x: cx + lx * Math.cos(rad) - ly * Math.sin(rad), y: cy + lx * Math.sin(rad) + ly * Math.cos(rad) });
    const box = place(-boxW / 2, -boxH / 2);
    page.drawRectangle({ x: box.x, y: box.y, width: boxW, height: boxH, borderColor: color, borderWidth: 2, borderOpacity: 0.8, rotate: degrees(rot) });
    const labelDy = dateLine ? 5 : 0;
    const labelPos = place(-labelW / 2, labelDy - size * 0.36);
    page.drawText(label, { x: labelPos.x, y: labelPos.y, size, font: bold, color, opacity: 0.8, rotate: degrees(rot) });
    if (dateLine) {
      const datePos = place(-dateW / 2, -13 - dateSize * 0.36);
      page.drawText(clean(dateLine), { x: datePos.x, y: datePos.y, size: dateSize, font: bold, color, opacity: 0.8, rotate: degrees(rot) });
    }
  }

  // ---- Line items.
  const ROW_TEXT = 9;
  const SUB_LEAD = 11.5;
  const tableHeader = () => {
    page.drawRectangle({ x: LEFT, y: y - 22, width: CONTENT_W, height: 22, color: accent });
    const base = y - 15;
    draw("DATE", COL.date, base, 7.5, bold, white);
    draw("DESCRIPTION", COL.desc, base, 7.5, bold, white);
    drawRight("QTY", COL.qty, base, 7.5, bold, white);
    drawRight("NET", COL.net, base, 7.5, bold, white);
    drawRight(taxLabel.toUpperCase(), COL.tax, base, 7.5, bold, white);
    drawRight("TOTAL", COL.total, base, 7.5, bold, white);
    y -= 22;
  };
  ensure(70);
  tableHeader();
  lines.forEach((line, index) => {
    const desc = [line.description || line.guest_name || "Line", line.notes,
      line.booking_ref ? `Ref ${line.booking_ref}` : null,
      line.supplier_ticket_number ? `Ticket ${line.supplier_ticket_number}` : null,
      line.vat_rate != null ? `${taxLabel} ${line.vat_rate}%` : null,
    ].filter(Boolean).flatMap((text, i) => wrap(text, DESC_W, i === 0 ? ROW_TEXT : 8));
    const height = 14 + (desc.length - 1) * SUB_LEAD + 8;
    if (height > 650) throw new Error("Invoice line is too long to fit safely in the PDF.");
    if (y - height < FOOTER_LIMIT) { newPage(); tableHeader(); }
    if (index % 2 === 1) page.drawRectangle({ x: LEFT, y: y - height, width: CONTENT_W, height, color: zebra });
    const base = y - 14;
    draw(formatInvoiceDate(line.show_date || inv.invoice_date), COL.date, base, 8.5, regular, ink);
    desc.forEach((text, i) => draw(text, COL.desc, base - i * SUB_LEAD, i === 0 ? ROW_TEXT : 8, regular, i === 0 ? ink : muted));
    figure(String(Number(line.quantity ?? 0)), COL.qty, base, regular, 24);
    figure(amount(line.net_total), COL.net, base);
    figure(amount(line.vat_amount), COL.tax, base);
    figure(amount(line.line_total), COL.total, base, bold);
    y -= height;
    rule(y);
  });

  // ---- Totals box, bottom right, with the grand total boxed in the accent colour.
  const boxW = 224;
  const boxX = RIGHT - boxW;
  const totalsHeight = 20 + 20 + 34 + 10;
  ensure(totalsHeight + 10);
  y -= 16;
  const totals: Array<[string, unknown]> = [["Net", inv.net_total ?? inv.total_amount], [taxLabel, inv.vat_total]];
  for (const [label, value] of totals) {
    draw(label, boxX + 12, y - 8, 9.5, regular, muted);
    figure(amount(value), RIGHT - 12, y - 8, regular, 96);
    y -= 20;
  }
  page.drawRectangle({ x: boxX, y: y - 34, width: boxW, height: 34, color: accent, opacity: 0.07, borderColor: accent, borderWidth: 1 });
  draw("TOTAL", boxX + 12, y - 21, 9, bold, accent);
  figure(amount(inv.total_amount), RIGHT - 12, y - 22, bold, 110, ink);
  y -= 34 + 10;
  const totalsBottom = y;

  // ---- Notes sit to the left of the totals box when there is room, otherwise below.
  if (inv.notes) {
    const noteLines = wrap(inv.notes, CONTENT_W - boxW - 30, 9);
    const noteTop = totalsBottom + totalsHeight - 16;
    const fitsBeside = noteLines.length * 12 + 14 <= totalsHeight - 10 && noteTop - noteLines.length * 12 - 14 > FOOTER_LIMIT;
    if (fitsBeside) {
      draw("NOTES", LEFT, noteTop - 8, 7.5, bold, muted);
      noteLines.forEach((text, i) => draw(text, LEFT, noteTop - 22 - i * 12, 9, regular, ink));
    } else {
      const full = wrap(inv.notes, CONTENT_W, 9);
      ensure(full.length * 12 + 20);
      draw("NOTES", LEFT, y - 8, 7.5, bold, muted);
      full.forEach((text, i) => draw(text, LEFT, y - 22 - i * 12, 9, regular, ink));
      y -= full.length * 12 + 26;
    }
  }

  // ---- Footer on every page: legal line, terms, thank-you, optional bank/registration note, page numbers.
  const legal = [issuerName, inv.issuer_tax_id ? `NIF ${inv.issuer_tax_id}` : null,
    String(inv.issuer_address ?? "").replace(/\s*\n+\s*/g, ", ").trim() || null].filter(Boolean).join("   ·   ");
  const termsDays = Number(inv.payment_terms_days);
  const thankYouName = String(branding.thankYouName ?? "").trim() || issuerName;
  const thanks = thankYouName ? `Thank you for working with ${thankYouName}.` : "Thank you for your business.";
  const terms = paid
    ? `Paid in full${inv.paid_at ? ` on ${formatInvoiceDate(inv.paid_at)}` : ""}. ${thanks}`
    : `${Number.isFinite(termsDays) && termsDays > 0 ? `Payment due within ${termsDays} days of the invoice date` : "Payment due"}${dueIso ? `, by ${formatInvoiceDate(dueIso)}` : ""}. Please quote ${number} on your payment. ${thanks}`;
  const footerNote = String(branding.footerNote ?? "").trim();
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    page = p;
    rule(96, hairline, 0.5);
    const pageLabel = `Page ${i + 1} of ${pages.length}`;
    drawRight(pageLabel, RIGHT, 84, 7.5, regular, muted);
    const footerW = CONTENT_W - regular.widthOfTextAtSize(pageLabel, 7.5) - 16;
    let fy = 84;
    for (const text of [...(legal ? wrap(legal, footerW, 7.5).slice(0, 2) : []), ...wrap(terms, footerW, 7.5).slice(0, 2), ...(footerNote ? wrap(footerNote, footerW, 7.5).slice(0, 3) : [])]) {
      draw(text, LEFT, fy, 7.5, regular, muted);
      fy -= 10;
    }
  });

  const bytes = await doc.save();
  if (bytes.length > MAX_INVOICE_PDF_BYTES) throw new Error("Invoice PDF exceeds the email attachment limit. Split the invoice pack before sending.");
  return bytes;
}

export function invoicePdfFilename(number: unknown): string {
  return `invoice-${String(number || "invoice").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80)}.pdf`;
}
