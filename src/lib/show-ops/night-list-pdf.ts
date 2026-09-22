import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * The printed night list, laid out like the Lanzasoft "Show Office List" the
 * office has pinned up for years (Joel's photo, 17 Sept 2026): landscape A4,
 * one line per booking, Ref · Name · Ad · Ch · In · Show · Tour Op · Hotel ·
 * Details · Total · Paid · Owed, thin rules between rows, who printed it and
 * when in the top-right corner. Special meals and the door sheet use the same
 * page with their own columns. Dietary needs print in full, never as a dot.
 */
export type NightListPdfView = "office" | "door" | "meals";

export type NightListPdfRow = {
  booking_ref: string;
  guest_name: string;
  adults: number;
  children: number;
  infants: number;
  show_name: string;
  supplier_name: string | null;
  hotel_name: string | null;
  /** Free text under Details: office comments, transport, ticket number, mobile. Diet is separate so it can lead. */
  details: string[];
  dietary: string | null;
  /** Pre-formatted money in the booking's currency. */
  total: string;
  paid: string;
  owed: string;
  /** "12:34" once marked in, "no show", or empty. Door sheet only. */
  door: string;
};

export type NightListPdfInput = {
  view: NightListPdfView;
  businessName: string;
  date: string;
  island: string | null;
  showName: string | null;
  printedBy: string;
  printedAt?: Date;
  rows: NightListPdfRow[];
};

export const NIGHT_LIST_PDF_TITLES: Record<NightListPdfView, string> = {
  office: "Show Office List",
  door: "Show Door List",
  meals: "Special Meals List",
};

// Landscape A4 in points.
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 28;
const INK = rgb(0, 0, 0);
const RULE = rgb(0.55, 0.55, 0.55);

type Col = { key: string; label: string; w: number; align?: "right" | "center"; bold?: boolean };

/** Column widths per sheet; they sum to the usable width (786pt). */
export function nightListColumns(view: NightListPdfView): Col[] {
  if (view === "meals") {
    return [
      { key: "ref", label: "Ref", w: 62 },
      { key: "name", label: "Name", w: 118, bold: true },
      { key: "ad", label: "Ad", w: 22, align: "center" },
      { key: "ch", label: "Ch", w: 22, align: "center" },
      { key: "in", label: "In", w: 22, align: "center" },
      { key: "show", label: "Show", w: 80 },
      { key: "supplier", label: "Tour Op", w: 96 },
      { key: "hotel", label: "Hotel", w: 116 },
      { key: "dietary", label: "Dietary requirement", w: 156, bold: true },
      { key: "details", label: "Details", w: 92 },
    ];
  }
  if (view === "door") {
    return [
      { key: "ref", label: "Ref", w: 62 },
      { key: "name", label: "Name", w: 118, bold: true },
      { key: "ad", label: "Ad", w: 22, align: "center" },
      { key: "ch", label: "Ch", w: 22, align: "center" },
      { key: "in", label: "In", w: 22, align: "center" },
      { key: "show", label: "Show", w: 74 },
      { key: "supplier", label: "Tour Op", w: 90 },
      { key: "hotel", label: "Hotel", w: 104 },
      { key: "details", label: "Details", w: 152 },
      { key: "owed", label: "Owed", w: 46, align: "right" },
      { key: "door", label: "In", w: 44, align: "center" },
      { key: "tick", label: "Tick", w: 30, align: "center" },
    ];
  }
  return [
    { key: "ref", label: "Ref", w: 62 },
    { key: "name", label: "Name", w: 112, bold: true },
    { key: "ad", label: "Ad", w: 22, align: "center" },
    { key: "ch", label: "Ch", w: 22, align: "center" },
    { key: "in", label: "In", w: 22, align: "center" },
    { key: "show", label: "Show", w: 74 },
    { key: "supplier", label: "Tour Op", w: 92 },
    { key: "hotel", label: "Hotel", w: 108 },
    { key: "details", label: "Details", w: 134 },
    { key: "total", label: "Total", w: 46, align: "right" },
    { key: "paid", label: "Paid", w: 46, align: "right" },
    { key: "owed", label: "Owed", w: 46, align: "right" },
  ];
}

/** Cell text per column. Details on the office sheet leads with the diet so the kitchen line is never buried. */
export function nightListCells(view: NightListPdfView, row: NightListPdfRow): Record<string, string> {
  const details = [...row.details];
  const diet = row.dietary?.trim() || "";
  return {
    ref: row.booking_ref,
    name: row.guest_name,
    ad: String(row.adults),
    ch: String(row.children),
    in: String(row.infants),
    show: row.show_name,
    supplier: row.supplier_name ?? "",
    hotel: row.hotel_name ?? "",
    details: view === "meals" ? details.join(" · ") : [diet ? `DIET: ${diet}` : "", ...details].filter(Boolean).join(" · "),
    dietary: diet,
    total: row.total,
    paid: row.paid,
    owed: row.owed,
    door: row.door,
    tick: "",
  };
}

/** Helvetica has no glyphs for emoji and some symbols; keep the text printable rather than fail the sheet. */
export function pdfSafe(text: string, font: PDFFont): string {
  const flat = text.replace(/\r\n?/g, "\n").replace(/\t/g, " ").replace(/\n+/g, " · ").trim();
  let out = "";
  for (const ch of flat) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    const joined = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(joined, size) <= width) {
      line = joined;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    for (const ch of word) {
      if (font.widthOfTextAtSize(line + ch, size) > width) {
        lines.push(line);
        line = "";
      }
      line += ch;
    }
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}

function stamp(printedBy: string, at: Date): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Atlantic/Canary",
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${printedBy} - ${g("hour")}:${g("minute")}:${g("second")} ${g("day")}-${g("month")}-${g("year")}`;
}

export async function buildNightListPdf(input: NightListPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const oblique = await doc.embedFont(StandardFonts.HelveticaOblique);
  const title = NIGHT_LIST_PDF_TITLES[input.view];
  doc.setTitle(`${title} ${input.date}${input.island ? ` ${input.island}` : ""}`);
  doc.setAuthor(input.businessName);
  doc.setCreator("Solvio Show Ops");

  const cols = nightListColumns(input.view);
  const tableW = cols.reduce((s, c) => s + c.w, 0);
  const left = (PAGE_W - tableW) / 2;
  const right = left + tableW;
  const printed = stamp(pdfSafe(input.printedBy, regular), input.printedAt ?? new Date());
  const bodySize = 8.6;
  const lineH = 10.6;
  const cellPad = 3;

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const text = (s: string, x: number, yy: number, size: number, font: PDFFont, align?: "right" | "center", w = 0) => {
    const tw = font.widthOfTextAtSize(s, size);
    const xx = align === "right" ? x + w - tw : align === "center" ? x + (w - tw) / 2 : x;
    page.drawText(s, { x: xx, y: yy, size, font, color: INK });
  };

  const header = (continued: boolean) => {
    y = PAGE_H - MARGIN;
    text(pdfSafe(`${input.businessName} ${title}`, bold), left, y - 16, 17, bold);
    const stampW = regular.widthOfTextAtSize(printed, 8.5);
    text(printed, right - stampW, y - 10, 8.5, oblique);
    y -= 30;
    text(pdfSafe(`${input.date}      ${input.showName || "All shows"}${continued ? "   (continued)" : ""}`, regular), left + 8, y - 6, 12, regular);
    if (input.island) {
      const isl = pdfSafe(input.island, oblique);
      text(isl, right - oblique.widthOfTextAtSize(isl, 12), y - 6, 12, oblique);
    }
    y -= 26;
    // Column headings, then the heavy rule under them.
    let x = left;
    for (const c of cols) {
      text(c.label, x + cellPad, y, 8, bold, c.align, c.w - cellPad * 2);
      x += c.w;
    }
    y -= 5;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1.2, color: INK });
    y -= 4;
  };

  const footer = () => {
    const pages = doc.getPages();
    pages.forEach((p, i) => {
      const s = `${i + 1} / ${pages.length}`;
      p.drawText(s, { x: right - regular.widthOfTextAtSize(s, 8), y: MARGIN - 12, size: 8, font: regular, color: INK });
      p.drawText(`Printed ${printed}`, { x: left, y: MARGIN - 12, size: 7.5, font: regular, color: INK });
    });
  };

  header(false);
  let pax = { ad: 0, ch: 0, in: 0 };
  for (const row of input.rows) {
    const cells = nightListCells(input.view, row);
    const wrapped = cols.map((c) => {
      const font = c.bold ? bold : regular;
      const size = c.key === "details" || c.key === "dietary" ? bodySize - 0.8 : bodySize;
      return { col: c, font, size, lines: wrap(pdfSafe(cells[c.key] ?? "", font), font, size, c.w - cellPad * 2) };
    });
    const rowLines = Math.max(1, ...wrapped.map((w) => w.lines.length));
    const rowH = rowLines * lineH + 4;
    if (y - rowH < MARGIN + 6) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      header(true);
    }
    let x = left;
    for (const w of wrapped) {
      w.lines.forEach((ln, i) => text(ln, x + cellPad, y - lineH * (i + 1) + 3, w.size, w.font, w.col.align, w.col.w - cellPad * 2));
      if (w.col.key === "tick") {
        page.drawRectangle({ x: x + (w.col.w - 10) / 2, y: y - lineH + 2, width: 10, height: 10, borderColor: INK, borderWidth: 0.8 });
      }
      x += w.col.w;
    }
    y -= rowH;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.4, color: RULE });
    pax = { ad: pax.ad + row.adults, ch: pax.ch + row.children, in: pax.in + row.infants };
  }
  // Totals line, like the count the office pencils at the bottom of the sheet.
  if (y - 18 < MARGIN + 6) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    header(true);
  }
  y -= 12;
  text(
    `${input.rows.length} booking${input.rows.length === 1 ? "" : "s"} · ${pax.ad} adults · ${pax.ch} children · ${pax.in} infants · ${pax.ad + pax.ch + pax.in} people`,
    left + cellPad,
    y,
    9,
    bold,
  );
  footer();
  return doc.save();
}
