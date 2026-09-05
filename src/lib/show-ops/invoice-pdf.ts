import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export type InvoicePdfInput = {
  invoice: Record<string, unknown>;
  lines: Array<Record<string, unknown>>;
};

export const MAX_INVOICE_PDF_BYTES = 18 * 1024 * 1024;

/** Render stored invoice amounts; never recalculate historical prices from today's catalogue. */
export async function buildInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const { invoice: inv, lines } = input;
  if (!["eur", "gbp", "usd"].includes(String(inv.currency))) throw new Error("Invoice currency is missing or unsupported.");
  if (!lines.length) throw new Error("Invoice has no lines to attach.");
  if (lines.length > 2000) throw new Error("Invoice is too long for one email. Split the invoice pack.");
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.09, 0.13, 0.22);
  const muted = rgb(0.36, 0.41, 0.49);
  const number = String(inv.invoice_number || inv.verifactu_number || "Invoice");
  if (number.length > 80) throw new Error("Invoice number is too long to fit safely in the PDF.");
  doc.setTitle(`Invoice ${number}`);
  doc.setAuthor(String(inv.issuer_name || ""));
  doc.setCreator("Solvio Show Ops");
  let page = doc.addPage([595.28, 841.89]);
  let y = 794;
  const left = 42;
  const right = 553;
  const clean = (value: unknown) => {
    const text = String(value ?? "").replace(/\r\n?/g, "\n").replace(/\t/g, " ");
    if (text.length > 4000) throw new Error("Invoice text is too long to fit safely in the PDF.");
    try { regular.encodeText(text.replace(/\n/g, " ")); } catch {
      throw new Error("Invoice text contains characters unsupported by the PDF font. Review the invoice before sending.");
    }
    return text;
  };
  const wrap = (value: unknown, width: number, size = 10, font: PDFFont = regular): string[] => {
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
  const draw = (text: string, x: number, baseline: number, size = 10, strong = false, subtle = false) => {
    page.drawText(clean(text), { x, y: baseline, size, font: strong ? bold : regular, color: subtle ? muted : ink });
  };
  const amount = (raw: unknown) => {
    const n = Number(raw ?? 0);
    if (!Number.isFinite(n)) throw new Error("Invoice contains an invalid amount.");
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: String(inv.currency).toUpperCase() }).format(n);
  };
  const rightText = (text: string, x: number, baseline: number, strong = false, width = 62) => {
    const font = strong ? bold : regular;
    const size = Math.min(9, 9 * width / Math.max(1, font.widthOfTextAtSize(text, 9)));
    if (size < 6) throw new Error("Invoice amount is too wide for the PDF table.");
    draw(text, x - font.widthOfTextAtSize(text, size), baseline, size, strong);
  };
  const newPage = () => {
    page = doc.addPage([595.28, 841.89]); y = 794;
    draw(`Invoice ${number}`, left, y, 12, true); y -= 30;
  };
  const ensure = (height: number) => { if (y - height < 62) newPage(); };
  const paragraph = (text: unknown, strong = false) => {
    for (const part of wrap(text, right - left, 10, strong ? bold : regular)) {
      ensure(15); draw(part, left, y, 10, strong); y -= 15;
    }
  };

  draw("INVOICE", left, y, 22, true); y -= 31;
  paragraph(number, true);
  paragraph(`Invoice date ${inv.invoice_date || "-"}   |   Due ${inv.due_date || "-"}`);
  paragraph(`Period ${inv.period_start || "-"} to ${inv.period_end || "-"}`);
  paragraph(inv.paid ? `PAID${inv.paid_at ? ` ${inv.paid_at}` : ""}` : "UNPAID", true);
  y -= 13;
  // Party blocks wrap independently and reserve their full height before the table.
  const party = (label: string, name: unknown, nif: unknown, address: unknown) => [
    label, ...wrap(name, 235, 10, bold), ...(nif ? wrap(`NIF ${nif}`, 235) : []), ...wrap(address, 235),
  ];
  const issuer = party("FROM", inv.issuer_name, inv.issuer_tax_id, inv.issuer_address);
  const recipient = party("BILL TO", inv.recipient_name || inv.supplier_name, inv.recipient_tax_id, inv.recipient_address);
  const partyHeight = Math.max(issuer.length, recipient.length) * 15;
  if (partyHeight > 330) throw new Error("Invoice address is too long to fit safely in the PDF.");
  ensure(partyHeight);
  for (const [x, entries] of [[left, issuer], [315, recipient]] as const) {
    entries.forEach((text, i) => draw(text, x, y - i * 15, i === 0 ? 9 : 10, i === 1, i === 0));
  }
  y -= partyHeight + 24;
  const tableHeader = () => {
    page.drawRectangle({ x: left, y: y - 7, width: right - left, height: 23, color: rgb(0.94, 0.95, 0.97) });
    draw("Date", left + 5, y, 9, true);
    draw("Description / reference", 111, y, 9, true);
    rightText("Qty", 353, y, true); rightText("Net", 415, y, true); rightText("Tax", 477, y, true); rightText("Total", 548, y, true);
    y -= 27;
  };
  ensure(50); tableHeader();
  for (const line of lines) {
    const desc = [line.description || line.guest_name || "Line", line.notes,
      line.booking_ref ? `Ref ${line.booking_ref}` : null,
      line.supplier_ticket_number ? `Ticket ${line.supplier_ticket_number}` : null,
      line.vat_rate != null ? `Tax rate ${line.vat_rate}%` : null,
    ].filter(Boolean).flatMap((text) => wrap(text, 216, 9));
    const height = Math.max(desc.length * 13, 22) + 10;
    if (height > 650) throw new Error("Invoice line is too long to fit safely in the PDF.");
    if (y - height < 62) { newPage(); tableHeader(); }
    draw(String(line.show_date || inv.invoice_date || "-"), left + 5, y, 8);
    desc.forEach((text, i) => draw(text, 111, y - i * 13, 9, i === 0, i > 0));
    rightText(String(Number(line.quantity ?? 0)), 353, y, false, 24);
    rightText(amount(line.net_total), 415, y); rightText(amount(line.vat_amount), 477, y); rightText(amount(line.line_total), 548, y, true);
    y -= height;
    page.drawLine({ start: { x: left, y: y + 14 }, end: { x: right, y: y + 14 }, thickness: 0.5, color: rgb(0.88, 0.90, 0.93) });
  }
  ensure(90); y -= 13;
  for (const [label, value] of [["Subtotal", inv.net_total ?? inv.total_amount], ["Tax", inv.vat_total], ["Total", inv.total_amount]] as const) {
    draw(label, 370, y, 10, label === "Total"); rightText(amount(value), right - 5, y, label === "Total"); y -= 20;
  }
  if (inv.notes) { y -= 12; paragraph(inv.notes); }
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`Invoice ${number} | Page ${i + 1} of ${pages.length}`, { x: left, y: 32, size: 8, font: regular, color: muted });
  });
  const bytes = await doc.save();
  if (bytes.length > MAX_INVOICE_PDF_BYTES) throw new Error("Invoice PDF exceeds the email attachment limit. Split the invoice pack before sending.");
  return bytes;
}

export function invoicePdfFilename(number: unknown): string {
  return `invoice-${String(number || "invoice").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80)}.pdf`;
}
