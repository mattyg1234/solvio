import ExcelJS from "exceljs";

import { splitPhone, joinPhone } from "@/lib/phone-country";
import { stopRunsOnDate } from "@/lib/show-ops/bus";
import { isReceptionPartner, partnerSellsOnIsland } from "@/lib/show-ops/partners";
import { showRunsOnDate, type ShowSchedule } from "@/lib/show-ops/nights";
import { PRIVATE_ACCOMMODATION_LABELS, PRIVATE_HOTEL_OPTION, type PrivateAccommodation } from "@/lib/show-ops/private-pickup";

/**
 * Paper bookings sheet (Plan B): an Excel file the office fills in by hand while
 * the Hub is down, then drops back into the Hub. Every column maps to a field on
 * the new-booking form. Reading never guesses: a value it cannot match exactly
 * (partner, hotel, stop, date, pax…) is reported against its row and column, and
 * that row is not added until it is fixed.
 */

export const BOOKING_SHEET_NAME = "Bookings";
export const BOOKING_SHEET_LISTS = "Lists";
/** Rows pre-formatted with dropdowns in the blank sheet; more can be typed below. */
export const BOOKING_SHEET_ROWS = 300;
/** Most rows one upload may add. */
export const BOOKING_SHEET_MAX_ROWS = 500;

export type SheetColumnKey =
  | "show_date" | "show" | "partner" | "partner_ref" | "guest_name" | "mobile" | "email"
  | "adults" | "children" | "infants" | "hotel" | "pickup" | "bus_stop" | "private_stay" | "private_zone"
  | "dietary" | "dietary_notes" | "payment_method" | "amount_paid" | "comments" | "office_comments" | "taken_by";

export type SheetColumn = { key: SheetColumnKey; header: string; help: string; width: number; required?: boolean };

export const BOOKING_SHEET_COLUMNS: SheetColumn[] = [
  { key: "show_date", header: "Show date", help: "Day/month/year, e.g. 24/11/2026.", width: 13, required: true },
  { key: "show", header: "Show", help: "Pick from the list (one show per island).", width: 20, required: true },
  { key: "partner", header: "Partner", help: "Pick from the list, exactly as in the Hub.", width: 32, required: true },
  { key: "partner_ref", header: "Partner ticket no.", help: "The partner's voucher / ticket number, if any.", width: 18 },
  { key: "guest_name", header: "Guest name", help: "Lead guest, first name and surname.", width: 24, required: true },
  { key: "mobile", header: "Mobile", help: "With country code, e.g. +44 7700 900123 or +34 600 123 456.", width: 20 },
  { key: "email", header: "Email", help: "Leave blank if the guest has no email.", width: 26 },
  { key: "adults", header: "Adults", help: "Whole number.", width: 8, required: true },
  { key: "children", header: "Children", help: "Whole number, 0 if none.", width: 9 },
  { key: "infants", header: "Infants", help: "Whole number, 0 if none.", width: 8 },
  { key: "hotel", header: "Hotel", help: "Pick from the list, or Private if not a listed hotel.", width: 30, required: true },
  { key: "pickup", header: "Pick-up", help: "Bus, Private or Own way.", width: 10, required: true },
  { key: "bus_stop", header: "Bus stop", help: "Bus only: leave blank to use the hotel's stop, or pick another.", width: 34 },
  { key: "private_stay", header: "Private stay", help: "When Hotel is Private: AirBnB, Villa, Friends & Family, Hotel or Unknown.", width: 16 },
  { key: "private_zone", header: "Private zone", help: "When Hotel is Private or Pick-up is Private: resort code, e.g. PDC, CT, TFS.", width: 12 },
  { key: "dietary", header: "Dietary", help: "Yes or No.", width: 9 },
  { key: "dietary_notes", header: "Dietary details", help: "Required when Dietary is Yes, e.g. 1 vegan, 1 gluten free.", width: 24 },
  { key: "payment_method", header: "Payment", help: "Cash, Card or Direct.", width: 10 },
  { key: "amount_paid", header: "Amount paid €", help: "MHT Reception / Direct / Web partners only: what the guest paid.", width: 13 },
  { key: "comments", header: "Comments", help: "Shows on the lists.", width: 28 },
  { key: "office_comments", header: "Office-only comments", help: "Not printed on the lists.", width: 28 },
  { key: "taken_by", header: "Taken by", help: "Who took the booking.", width: 14 },
];

export const PICKUP_CHOICES = ["Bus", "Private", "Own way"] as const;
export const YES_NO = ["Yes", "No"] as const;
export const PAYMENT_CHOICES = ["Cash", "Card", "Direct"] as const;
export const PRIVATE_STAY_CHOICES = ["AirBnB", "Villa", "Friends & Family", "Hotel", "Unknown"] as const;

export type SheetSupplier = { id: string; name: string; island?: string | null; partner_type?: string | null; active?: boolean | null };
export type SheetProduct = ShowSchedule & { id: string; name: string; island: string | null; transport_available?: boolean | null; active?: boolean | null };
export type SheetHotel = { id: string; name: string; island: string | null; bus_stop_id: string | null; active?: boolean | null };
export type SheetStop = { id: string; island: string | null; resort: string | null; stop_name: string; runs_on: string | null; active?: boolean | null };

export type SheetLookups = {
  suppliers: SheetSupplier[];
  products: SheetProduct[];
  hotels: SheetHotel[];
  stops: SheetStop[];
};

export function stopLabel(s: Pick<SheetStop, "resort" | "stop_name" | "island">): string {
  return [s.island, s.resort, s.stop_name].map((x) => String(x ?? "").trim()).filter(Boolean).join(" · ");
}

const PRIVATE_WORD = "Private";

/** Dropdown values for the Lists sheet: active records only, sorted, de-duplicated. */
export function sheetLists(l: SheetLookups) {
  const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const live = <T extends { active?: boolean | null }>(xs: T[]) => xs.filter((x) => x.active !== false);
  return {
    shows: uniq(live(l.products).map((p) => p.name)),
    partners: uniq(live(l.suppliers).map((s) => s.name)),
    hotels: [PRIVATE_WORD, ...uniq(live(l.hotels).map((h) => h.name)).filter((n) => n.toLowerCase() !== "private")],
    stops: uniq(live(l.stops).map(stopLabel)),
  };
}

/** The blank sheet as .xlsx bytes, with this workspace's partners, shows, hotels and stops as dropdowns. */
export async function buildBookingSheet(l: SheetLookups, opts: { businessName: string; generatedAt?: Date } = { businessName: "Show Ops" }): Promise<Buffer> {
  const lists = sheetLists(l);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Show Ops Hub";
  wb.created = opts.generatedAt ?? new Date();

  const ws = wb.addWorksheet(BOOKING_SHEET_NAME, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = BOOKING_SHEET_COLUMNS.map((c) => ({ header: c.required ? `${c.header} *` : c.header, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7C1D6F" } };
  head.height = 22;
  head.alignment = { vertical: "middle" };
  BOOKING_SHEET_COLUMNS.forEach((c, i) => { head.getCell(i + 1).note = c.help; });

  const listWs = wb.addWorksheet(BOOKING_SHEET_LISTS);
  const listCols: Array<[string, string[]]> = [
    ["Shows", lists.shows], ["Partners", lists.partners], ["Hotels", lists.hotels], ["Bus stops", lists.stops],
    ["Pick-up", [...PICKUP_CHOICES]], ["Yes/No", [...YES_NO]], ["Payment", [...PAYMENT_CHOICES]], ["Private stay", [...PRIVATE_STAY_CHOICES]],
  ];
  const ranges: Record<string, string> = {};
  listCols.forEach(([title, values], i) => {
    const col = listWs.getColumn(i + 1);
    col.width = Math.min(48, Math.max(12, ...values.map((v) => v.length + 2)));
    listWs.getCell(1, i + 1).value = title;
    listWs.getCell(1, i + 1).font = { bold: true };
    values.forEach((v, r) => { listWs.getCell(r + 2, i + 1).value = v; });
    const letter = col.letter;
    ranges[title] = `${BOOKING_SHEET_LISTS}!$${letter}$2:$${letter}$${Math.max(2, values.length + 1)}`;
  });

  const listRule = (range: string, strict: boolean): ExcelJS.DataValidation => ({
    type: "list", allowBlank: true, formulae: [range],
    showErrorMessage: strict, errorStyle: "warning", errorTitle: "Not in the list",
    error: "Pick from the list if you can. If it really is not there, keep what you typed: the Hub will ask about it on upload.",
  });
  const whole: ExcelJS.DataValidation = { type: "whole", operator: "between", allowBlank: true, formulae: [0, 60], showErrorMessage: true, errorTitle: "Number", error: "Type a whole number." };
  const rules: Partial<Record<SheetColumnKey, ExcelJS.DataValidation>> = {
    show_date: { type: "date", operator: "greaterThan", allowBlank: true, formulae: [new Date(Date.UTC(2020, 0, 1))], showErrorMessage: true, errorTitle: "Date", error: "Type a date, e.g. 24/11/2026." },
    show: listRule(ranges.Shows, true),
    partner: listRule(ranges.Partners, true),
    hotel: listRule(ranges.Hotels, true),
    bus_stop: listRule(ranges["Bus stops"], true),
    pickup: listRule(ranges["Pick-up"], true),
    dietary: listRule(ranges["Yes/No"], true),
    payment_method: listRule(ranges.Payment, true),
    private_stay: listRule(ranges["Private stay"], true),
    adults: whole, children: whole, infants: whole,
    amount_paid: { type: "decimal", operator: "greaterThanOrEqual", allowBlank: true, formulae: [0], showErrorMessage: true, errorTitle: "Amount", error: "Type an amount in euros, e.g. 45 or 45.50." },
  };
  for (let r = 2; r <= BOOKING_SHEET_ROWS + 1; r += 1) {
    BOOKING_SHEET_COLUMNS.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      const rule = rules[c.key];
      if (rule) cell.dataValidation = rule;
      if (c.key === "show_date") cell.numFmt = "dd/mm/yyyy";
      if (c.key === "mobile" || c.key === "partner_ref") cell.numFmt = "@";
      if (c.key === "amount_paid") cell.numFmt = "0.00";
    });
  }

  const how = wb.addWorksheet("How to fill in");
  how.getColumn(1).width = 24;
  how.getColumn(2).width = 90;
  const stamp = (opts.generatedAt ?? new Date()).toISOString().slice(0, 16).replace("T", " ");
  const intro = [
    [`${opts.businessName}: paper bookings sheet`, ""],
    ["When to use it", "Only when the Hub is down. One booking per row on the Bookings tab. Keep taking bookings."],
    ["When the Hub is back", "Backups & Plan B page → Paper bookings sheet → drop this file in. The Hub checks every row first and shows you anything it does not understand. Nothing is added until you press Add."],
    ["Columns with *", "Must be filled in."],
    ["Lists", `Partners, shows, hotels and bus stops as they were in the Hub at ${stamp} UTC. Use the dropdowns so names match.`],
    ["Guest tickets", "Not sent automatically on upload. Send them from each booking afterwards if the guest needs one."],
    ["", ""],
    ["Column", "What to type"],
    ...BOOKING_SHEET_COLUMNS.map((c) => [c.required ? `${c.header} *` : c.header, c.help]),
  ];
  intro.forEach((row, i) => {
    how.getCell(i + 1, 1).value = row[0];
    how.getCell(i + 1, 2).value = row[1];
    how.getCell(i + 1, 2).alignment = { wrapText: true, vertical: "top" };
    if (i === 0) how.getCell(1, 1).font = { bold: true, size: 14 };
    else how.getCell(i + 1, 1).font = { bold: true };
  });
  wb.views = [{ activeTab: 0, x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, visibility: "visible" }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------- reading

export type SheetCell = string | number | Date | boolean | null;
export type SheetRawRow = { row: number; values: Partial<Record<SheetColumnKey, SheetCell>> };
export type SheetReadResult = { rows: SheetRawRow[]; problems: string[] };

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/\*/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Header text → column, forgiving of case, stars, punctuation and a few obvious alternatives. */
const HEADER_ALIASES: Record<string, SheetColumnKey> = Object.fromEntries([
  ...BOOKING_SHEET_COLUMNS.map((c) => [norm(c.header), c.key]),
  ["date", "show_date"], ["partner ticket no", "partner_ref"], ["ticket no", "partner_ref"], ["partner ref", "partner_ref"],
  ["name", "guest_name"], ["guest", "guest_name"], ["phone", "mobile"], ["mobile number", "mobile"], ["pickup", "pickup"],
  ["adult", "adults"], ["child", "children"], ["infant", "infants"], ["diet", "dietary"], ["payment method", "payment_method"],
  ["amount paid", "amount_paid"], ["paid", "amount_paid"], ["office only comments", "office_comments"], ["supplier", "partner"],
].map(([k, v]) => [k, v as SheetColumnKey]));

function cellValue(v: unknown): SheetCell {
  if (v == null) return null;
  if (v instanceof Date || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellValue(o.result);
    if (Array.isArray(o.richText)) return (o.richText as Array<{ text: string }>).map((t) => t.text).join("");
    if ("text" in o) return cellValue(o.text);
    if ("hyperlink" in o) return String(o.hyperlink).replace(/^mailto:/i, "");
  }
  return String(v);
}

function blank(v: SheetCell | undefined): boolean {
  return v == null || (typeof v === "string" && !v.trim());
}

function rowsFromGrid(grid: Array<{ row: number; cells: SheetCell[] }>): SheetReadResult {
  const problems: string[] = [];
  const headerIdx = grid.findIndex((r) => r.cells.filter((c) => HEADER_ALIASES[norm(c)]).length >= 3);
  if (headerIdx < 0) return { rows: [], problems: ["Could not find the header row (Show date, Show, Partner, Guest name…). Use the sheet downloaded from the Hub."] };
  const map = new Map<number, SheetColumnKey>();
  grid[headerIdx].cells.forEach((c, i) => {
    const key = HEADER_ALIASES[norm(c)];
    if (key && ![...map.values()].includes(key)) map.set(i, key);
    else if (!blank(c) && !key) problems.push(`Column "${String(c).trim()}" is not one the Hub knows; it was ignored.`);
  });
  for (const c of BOOKING_SHEET_COLUMNS.filter((x) => x.required)) {
    if (![...map.values()].includes(c.key)) problems.push(`The sheet has no "${c.header}" column.`);
  }
  const rows: SheetRawRow[] = [];
  for (const r of grid.slice(headerIdx + 1)) {
    const values: SheetRawRow["values"] = {};
    for (const [i, key] of map) values[key] = r.cells[i] ?? null;
    if (Object.values(values).every(blank)) continue;
    rows.push({ row: r.row, values });
  }
  return { rows, problems };
}

/** .xlsx (the Hub's sheet, or any sheet with the same headers) or .csv (e.g. Google Sheets download). */
export async function readBookingSheet(bytes: Uint8Array, filename: string): Promise<SheetReadResult> {
  if (/\.csv$/i.test(filename) || /\.txt$/i.test(filename)) {
    const text = Buffer.from(bytes).toString("utf8").replace(/^﻿/, "");
    return rowsFromGrid(parseCsv(text).map((cells, i) => ({ row: i + 1, cells })));
  }
  if (!/\.xlsx$/i.test(filename)) {
    return { rows: [], problems: ["Save the sheet as Excel (.xlsx) or CSV and upload that. Old .xls and Numbers files can't be read."] };
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(bytes) as never);
  } catch {
    return { rows: [], problems: ["That file is not a readable Excel (.xlsx) file."] };
  }
  const ws = wb.getWorksheet(BOOKING_SHEET_NAME) ?? wb.worksheets.find((w) => w.name !== BOOKING_SHEET_LISTS && w.name !== "How to fill in") ?? wb.worksheets[0];
  if (!ws) return { rows: [], problems: ["The file has no sheets."] };
  const grid: Array<{ row: number; cells: SheetCell[] }> = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: SheetCell[] = [];
    for (let i = 1; i <= Math.max(row.cellCount, BOOKING_SHEET_COLUMNS.length); i += 1) cells.push(cellValue(row.getCell(i).value));
    grid.push({ row: rowNumber, cells });
  });
  return rowsFromGrid(grid);
}

export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); out.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

// ---------------------------------------------------------------- checking

export type SheetProblem = { column: string; message: string };
export type CheckedRow = {
  row: number;
  ok: boolean;
  problems: SheetProblem[];
  /** Plain-language notes that do not stop the row (e.g. no email). */
  notes: string[];
  summary: { show_date: string | null; guest_name: string; partner: string; show: string; pax: string };
  /** The booking form's fields, ready for createBookingAction. Only meaningful when ok. */
  form: Record<string, string>;
};

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, ene: 1, abr: 4, ago: 8, dic: 12 };

/** A sheet date → ISO. Day comes first (24/11/2026). Anything ambiguous or impossible → null. */
export function parseSheetDate(v: SheetCell | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    // Excel dates arrive as UTC midnight; a few readers shift them by the local offset, so round to the nearest day.
    const d = new Date(v.getTime() + 12 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    if (v < 40000 || v > 60000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  }
  const s = String(v).trim().toLowerCase();
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-]+([a-z]{3})[a-z]*\.?[\s\-,]+(\d{2}|\d{4})$/)) && MONTHS[match[2]]) [d, m, y] = [Number(match[1]), MONTHS[match[2]], Number(match[3])];
  else return null;
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

const text = (v: SheetCell | undefined) => (v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();
const key = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function pax(v: SheetCell | undefined, label: string, problems: SheetProblem[]): number {
  if (blank(v ?? null)) return 0;
  const n = typeof v === "number" ? v : Number(text(v));
  if (!Number.isInteger(n) || n < 0 || n > 60) {
    problems.push({ column: label, message: `"${text(v)}" is not a whole number of guests.` });
    return 0;
  }
  return n;
}

/** Exact match after ignoring case, accents and punctuation. Several matches → ambiguous, never a guess. */
function pick<T>(items: T[], name: string, nameOf: (t: T) => string): { one: T | null; many: boolean } {
  const k = key(name);
  const hits = items.filter((t) => key(nameOf(t)) === k);
  return { one: hits.length === 1 ? hits[0] : null, many: hits.length > 1 };
}

function choice<T extends string>(raw: string, options: Record<string, T>): T | null {
  return options[key(raw)] ?? null;
}

export type ExistingBooking = { booking_ref: string; show_date: string; guest_name: string; supplier_id: string | null };

/**
 * One sheet row → the booking form's fields, or the reasons it can't be added.
 * Mirrors the booking form's own rules (show runs that night, stop runs that
 * night, transport available, dietary details when Yes…) so problems show
 * before anything is saved; the save itself still runs every check again.
 */
export function checkSheetRow(raw: SheetRawRow, l: SheetLookups, existing: ExistingBooking[] = []): CheckedRow {
  const v = raw.values;
  const problems: SheetProblem[] = [];
  const notes: string[] = [];
  const form: Record<string, string> = {};
  const need = (k: SheetColumnKey) => {
    const col = BOOKING_SHEET_COLUMNS.find((c) => c.key === k)!;
    if (blank(v[k] ?? null)) problems.push({ column: col.header, message: "Missing." });
    return text(v[k]);
  };

  // Date
  const dateRaw = v.show_date;
  const showDate = blank(dateRaw ?? null) ? null : parseSheetDate(dateRaw ?? null);
  if (blank(dateRaw ?? null)) problems.push({ column: "Show date", message: "Missing." });
  else if (!showDate) problems.push({ column: "Show date", message: `"${text(dateRaw)}" is not a date the Hub can read. Use day/month/year, e.g. 24/11/2026.` });
  if (showDate) form.show_date = showDate;

  // Show
  const showName = need("show");
  const products = l.products.filter((p) => p.active !== false);
  const prod = showName ? pick(products, showName, (p) => p.name) : { one: null, many: false };
  const product = prod.one;
  if (showName && !product) problems.push({ column: "Show", message: prod.many ? `More than one show is called "${showName}".` : `"${showName}" is not a show in the Hub.` });
  if (product) {
    form.product_id = product.id;
    if (showDate && !showRunsOnDate(product, showDate)) notes.push(`${product.name} is not scheduled on ${showDate}; the Hub will only accept it if that night already has bookings.`);
  }
  const island = product?.island ?? null;

  // Partner
  const partnerName = need("partner");
  const sup = partnerName ? pick(l.suppliers.filter((s) => s.active !== false), partnerName, (s) => s.name) : { one: null, many: false };
  const supplier = sup.one;
  if (partnerName && !supplier) problems.push({ column: "Partner", message: sup.many ? `More than one partner is called "${partnerName}". Add the booking in the Hub by hand.` : `"${partnerName}" is not a partner in the Hub. Pick one from the list.` });
  if (supplier) {
    form.supplier_id = supplier.id;
    if (island && !partnerSellsOnIsland(supplier.island, island)) notes.push(`${supplier.name} is not set up for ${island}.`);
  }

  // Guest
  const guestName = need("guest_name");
  if (guestName) form.guest_name = guestName;
  const email = text(v.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push({ column: "Email", message: `"${email}" is not an email address.` });
  if (email) form.guest_email = email;
  else { form.no_email = "1"; notes.push("No email: saved as \"Guest has no email\"."); }
  const mobileRaw = text(v.mobile);
  if (mobileRaw) {
    const typedCode = /^\s*(\+|00)/.test(mobileRaw);
    const split = splitPhone(mobileRaw, "__");
    if (split.iso === "__" && !typedCode) problems.push({ column: "Mobile", message: `"${mobileRaw}": add the country code, e.g. +44 or +34.` });
    else form.guest_mobile = split.iso === "__" ? mobileRaw.replace(/\s+/g, "") : joinPhone(split.iso, split.rest);
  }
  const partnerRef = text(v.partner_ref);
  if (partnerRef) form.supplier_ticket_number = partnerRef;

  // Pax
  const adults = blank(v.adults ?? null) ? (problems.push({ column: "Adults", message: "Missing (type 0 if only children)." }), 0) : pax(v.adults, "Adults", problems);
  const children = pax(v.children, "Children", problems);
  const infants = pax(v.infants, "Infants", problems);
  if (!blank(v.adults ?? null) && adults + children + infants < 1) problems.push({ column: "Adults", message: "Need at least one guest." });
  form.adults = String(adults);
  form.children = String(children);
  form.infants = String(infants);

  // Pick-up
  const pickupRaw = need("pickup");
  const pickupKind = pickupRaw ? choice(pickupRaw, { bus: "bus", coach: "bus", private: "private", "private transfer": "private", "own way": "own_way", ownway: "own_way", own: "own_way", none: "own_way", no: "own_way" }) : null;
  if (pickupRaw && !pickupKind) problems.push({ column: "Pick-up", message: `"${pickupRaw}" should be Bus, Private or Own way.` });
  if (pickupKind) form.pickup_kind = pickupKind;
  if (pickupKind === "bus") {
    form.transport_required = "1";
    if (product && product.transport_available === false) problems.push({ column: "Pick-up", message: `${product.name} does not include transport.` });
  }

  // Hotel / private stay
  const hotelRaw = need("hotel");
  const zone = text(v.private_zone).replace(/\s+/g, "").toUpperCase();
  const stayRaw = text(v.private_stay);
  const stay = stayRaw ? choice<PrivateAccommodation>(stayRaw, Object.fromEntries(Object.entries(PRIVATE_ACCOMMODATION_LABELS).flatMap(([k, label]) => [[key(label), k as PrivateAccommodation], [key(k), k as PrivateAccommodation]]))) : null;
  if (stayRaw && !stay) problems.push({ column: "Private stay", message: `"${stayRaw}" should be AirBnB, Villa, Friends & Family, Hotel or Unknown.` });
  let hotel: SheetHotel | null = null;
  if (hotelRaw && key(hotelRaw) === "private") {
    form.hotel_id = PRIVATE_HOTEL_OPTION;
    form.private_accommodation = stay ?? "unknown";
    if (!stay) notes.push("Private stay not given: saved as Unknown.");
  } else if (hotelRaw) {
    const live = l.hotels.filter((h) => h.active !== false);
    const onIsland = island ? live.filter((h) => !h.island || h.island === island) : live;
    const found = pick(onIsland, hotelRaw, (h) => h.name);
    hotel = found.one;
    if (!hotel) {
      const elsewhere = island ? pick(live, hotelRaw, (h) => h.name) : { one: null, many: false };
      problems.push({ column: "Hotel", message: found.many ? `More than one hotel called "${hotelRaw}"${island ? ` on ${island}` : ""}. Add the booking in the Hub by hand.` : elsewhere.one || elsewhere.many ? `"${hotelRaw}" is not on ${island}.` : `"${hotelRaw}" is not a hotel in the Hub. Pick one from the list, or Private.` });
    } else form.hotel_id = hotel.id;
  }
  if (pickupKind === "private" || form.hotel_id === PRIVATE_HOTEL_OPTION) {
    if (zone) form.private_zone = zone;
    if (pickupKind === "private" && !form.private_accommodation) form.private_accommodation = stay ?? (hotel ? "hotel" : "unknown");
  }

  // Bus stop
  const stopRaw = text(v.bus_stop);
  if (pickupKind === "bus") {
    let stop: SheetStop | null = null;
    if (stopRaw) {
      const live = l.stops.filter((s) => s.active !== false);
      const found = pick(live, stopRaw, stopLabel);
      const byName = found.one || found.many ? found : pick(live.filter((s) => !island || s.island === island), stopRaw, (s) => `${s.resort ?? ""} ${s.stop_name}`);
      const byStop = byName.one || byName.many ? byName : pick(live.filter((s) => !island || s.island === island), stopRaw, (s) => s.stop_name);
      stop = byStop.one;
      if (!stop) problems.push({ column: "Bus stop", message: byStop.many ? `"${stopRaw}" matches more than one stop. Pick it from the list.` : `"${stopRaw}" is not a bus stop in the Hub. Pick one from the list, or leave it blank to use the hotel's stop.` });
      else form.pickup_stop_id = stop.id;
    } else if (hotel?.bus_stop_id) {
      stop = l.stops.find((s) => s.id === hotel!.bus_stop_id) ?? null;
    } else if (hotel || form.hotel_id === PRIVATE_HOTEL_OPTION) {
      problems.push({ column: "Bus stop", message: "Bus booking with no stop: pick a bus stop (this hotel has none set)." });
    }
    if (stop && showDate && !stopRunsOnDate(stop.runs_on, showDate)) {
      problems.push({ column: "Bus stop", message: `${stopLabel(stop)} has no pick-up on that day (${stop.runs_on}).` });
    }
  } else if (stopRaw) {
    notes.push("Bus stop ignored: pick-up is not Bus.");
  }

  // Dietary
  const dietRaw = text(v.dietary);
  const dietNotes = text(v.dietary_notes);
  const diet = dietRaw ? choice(dietRaw, { yes: "1", y: "1", si: "1", no: "0", n: "0" }) : dietNotes ? "1" : "0";
  if (dietRaw && diet == null) problems.push({ column: "Dietary", message: `"${dietRaw}" should be Yes or No.` });
  if (diet === "1") {
    if (!dietNotes) problems.push({ column: "Dietary details", message: "Dietary is Yes: say what they need." });
    form.dietary_required = "1";
    form.dietary_notes = dietNotes;
  }

  // Money
  const payRaw = text(v.payment_method);
  const pay = payRaw ? choice(payRaw, { cash: "cash", card: "card", direct: "direct", paypal: "direct", stripe: "direct", transfer: "direct" }) : null;
  if (payRaw && !pay) problems.push({ column: "Payment", message: `"${payRaw}" should be Cash, Card or Direct.` });
  if (pay) form.payment_method = pay;
  const paidRaw = v.amount_paid;
  if (!blank(paidRaw ?? null)) {
    const n = typeof paidRaw === "number" ? paidRaw : Number(text(paidRaw).replace(/[€\s]/g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0) problems.push({ column: "Amount paid €", message: `"${text(paidRaw)}" is not an amount.` });
    else if (supplier && !isReceptionPartner(supplier.partner_type)) notes.push(`Amount paid ignored: ${supplier.name} is not an MHT Reception / Direct / Web partner, so the partner's deposit rules apply.`);
    else form.amount_paid = String(Math.round(n * 100) / 100);
  }

  const comments = text(v.comments);
  if (comments) form.office_comments = comments;
  const takenBy = text(v.taken_by);
  const officeOnly = [text(v.office_comments), `Added from paper bookings sheet (row ${raw.row}${takenBy ? `, taken by ${takenBy}` : ""}).`].filter(Boolean).join(" ");
  form.office_only_comments = officeOnly;

  if (showDate && supplier && guestName) {
    const dup = existing.find((b) => b.show_date === showDate && b.supplier_id === supplier.id && key(b.guest_name) === key(guestName));
    if (dup) problems.push({ column: "Guest name", message: `Already in the Hub as ${dup.booking_ref} (same guest, partner and night).` });
  }

  return {
    row: raw.row,
    ok: problems.length === 0,
    problems,
    notes,
    summary: { show_date: showDate, guest_name: guestName, partner: supplier?.name ?? partnerName, show: product?.name ?? showName, pax: `${adults}+${children}+${infants}` },
    form,
  };
}

/** Same guest, partner and night twice in one sheet: the second copy is flagged. */
export function flagSheetDuplicates(rows: CheckedRow[]): CheckedRow[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    if (!r.form.show_date || !r.form.supplier_id || !r.form.guest_name) return r;
    const k = `${r.form.show_date}|${r.form.supplier_id}|${key(r.form.guest_name)}`;
    const first = seen.get(k);
    if (first == null) { seen.set(k, r.row); return r; }
    const problems = [...r.problems, { column: "Guest name", message: `Same guest, partner and night as row ${first}.` }];
    return { ...r, ok: false, problems };
  });
}
