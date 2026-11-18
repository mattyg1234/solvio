import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";

import {
  BOOKING_SHEET_COLUMNS,
  BOOKING_SHEET_NAME,
  buildBookingSheet,
  checkSheetRow,
  flagSheetDuplicates,
  parseSheetDate,
  readBookingSheet,
  type SheetLookups,
} from "./booking-sheet";

const lookups: SheetLookups = {
  products: [
    { id: "p-lz", name: "MHT LANZAROTE", island: "Lanzarote", transport_available: true, run_weekdays: [1, 2, 3, 4, 5, 6] },
    { id: "p-tf", name: "MHT TENERIFE", island: "Tenerife", transport_available: true },
  ],
  suppliers: [
    { id: "s-tui", name: "TUI Lanzarote", island: "Lanzarote", partner_type: "Tour operator" },
    { id: "s-rec", name: "MHT Reception PDC", island: "Lanzarote", partner_type: "MHT Reception" },
    { id: "s-d1", name: "Twin", island: "ALL" },
    { id: "s-d2", name: "twin", island: "ALL" },
  ],
  hotels: [
    { id: "h-sands", name: "Sands Beach", island: "Lanzarote", bus_stop_id: "st-ct" },
    { id: "h-nostop", name: "Hotel Sin Parada", island: "Lanzarote", bus_stop_id: null },
    { id: "h-tf", name: "Sands Beach", island: "Tenerife", bus_stop_id: null },
  ],
  stops: [
    { id: "st-ct", island: "Lanzarote", resort: "Costa Teguise", stop_name: "Sands Beach", runs_on: null },
    { id: "st-pb", island: "Lanzarote", resort: "Playa Blanca", stop_name: "Bus station", runs_on: "Tue,Fri" },
  ],
};

// 24 Nov 2026 is a Tuesday.
const good = {
  show_date: "24/11/2026", show: "MHT Lanzarote", partner: "tui lanzarote", partner_ref: "TUI-99", guest_name: "Ana García",
  mobile: "07700 900123", email: "ana@example.com", adults: 2, children: 1, infants: 0, hotel: "Sands Beach",
  pickup: "Bus", dietary: "Yes", dietary_notes: "1 vegan", payment_method: "Card", comments: "Birthday", taken_by: "Ruth",
} as const;

test("a complete row becomes the booking form's fields", () => {
  const r = checkSheetRow({ row: 2, values: { ...good } }, lookups);
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
  assert.equal(r.form.show_date, "2026-11-24");
  assert.equal(r.form.product_id, "p-lz");
  assert.equal(r.form.supplier_id, "s-tui");
  assert.equal(r.form.hotel_id, "h-sands"); // the Lanzarote one, not Tenerife's namesake
  assert.equal(r.form.pickup_kind, "bus");
  assert.equal(r.form.guest_mobile, "+447700900123");
  assert.equal(r.form.dietary_required, "1");
  assert.equal(r.form.payment_method, "card");
  assert.equal(r.form.office_comments, "Birthday");
  assert.match(r.form.office_only_comments, /paper bookings sheet \(row 2, taken by Ruth\)/);
  assert.equal(r.form.send_ticket, undefined);
});

test("anything the Hub can't match is named against its column, never guessed", () => {
  const r = checkSheetRow({ row: 5, values: {
    show_date: "31/02/2026", show: "MHT Fuerteventura", partner: "Twin", guest_name: "", mobile: "7700 900123",
    email: "not-an-email", adults: "two", hotel: "Hotel Nowhere", pickup: "Taxi", dietary: "Yes", payment_method: "Bitcoin",
  } }, lookups);
  assert.equal(r.ok, false);
  const cols = r.problems.map((p) => p.column);
  for (const c of ["Show date", "Show", "Partner", "Guest name", "Mobile", "Email", "Adults", "Hotel", "Pick-up", "Dietary details", "Payment"]) {
    assert.ok(cols.includes(c), `expected a problem on ${c}: ${JSON.stringify(r.problems)}`);
  }
  assert.match(r.problems.find((p) => p.column === "Partner")!.message, /More than one partner/);
});

test("bus rules: the hotel's stop is used, a stop must run that day, and a hotel with no stop needs one", () => {
  const thursday = { ...good, show_date: "26/11/2026" };
  assert.equal(checkSheetRow({ row: 2, values: { ...thursday, bus_stop: "Lanzarote · Playa Blanca · Bus station" } }, lookups).problems[0]?.column, "Bus stop");
  assert.equal(checkSheetRow({ row: 2, values: { ...good, bus_stop: "Bus station" } }, lookups).form.pickup_stop_id, "st-pb");
  const noStop = checkSheetRow({ row: 2, values: { ...good, hotel: "Hotel Sin Parada" } }, lookups);
  assert.match(noStop.problems.map((p) => p.message).join(), /pick a bus stop/);
});

test("private stays, own way, no email and reception amounts", () => {
  const r = checkSheetRow({ row: 3, values: { ...good, hotel: "Private", private_stay: "airbnb", private_zone: "pdc", pickup: "own way", email: "", partner: "MHT Reception PDC", amount_paid: "45,50", dietary: "No", dietary_notes: "" } }, lookups);
  assert.deepEqual(r.problems, []);
  assert.equal(r.form.hotel_id, "__private__");
  assert.equal(r.form.private_accommodation, "airbnb");
  assert.equal(r.form.private_zone, "PDC");
  assert.equal(r.form.pickup_kind, "own_way");
  assert.equal(r.form.no_email, "1");
  assert.equal(r.form.amount_paid, "45.5");
  assert.equal(r.form.dietary_required, undefined);
  const tui = checkSheetRow({ row: 3, values: { ...good, amount_paid: 20 } }, lookups);
  assert.equal(tui.form.amount_paid, undefined);
  assert.match(tui.notes.join(), /Amount paid ignored/);
});

test("bookings already in the Hub, or twice in the sheet, are flagged", () => {
  const existing = [{ booking_ref: "MHT-1500", show_date: "2026-11-24", guest_name: "ANA GARCIA", supplier_id: "s-tui" }];
  assert.match(checkSheetRow({ row: 2, values: { ...good } }, lookups, existing).problems[0].message, /MHT-1500/);
  const rows = flagSheetDuplicates([checkSheetRow({ row: 2, values: { ...good } }, lookups), checkSheetRow({ row: 9, values: { ...good } }, lookups)]);
  assert.equal(rows[0].ok, true);
  assert.equal(rows[1].ok, false);
  assert.match(rows[1].problems[0].message, /row 2/);
});

test("dates: day first, Excel dates and serials, impossible dates refused", () => {
  assert.equal(parseSheetDate("5/1/2027"), "2027-01-05");
  assert.equal(parseSheetDate("05-01-27"), "2027-01-05");
  assert.equal(parseSheetDate("2026-11-24"), "2026-11-24");
  assert.equal(parseSheetDate("24 Nov 2026"), "2026-11-24");
  assert.equal(parseSheetDate(new Date(Date.UTC(2026, 10, 24))), "2026-11-24");
  assert.equal(parseSheetDate(46350), "2026-11-24");
  assert.equal(parseSheetDate("31/02/2026"), null);
  assert.equal(parseSheetDate("tomorrow"), null);
});

test("the blank sheet round-trips: dropdown lists, then a filled row reads back", async () => {
  const bytes = await buildBookingSheet(lookups, { businessName: "MHT", generatedAt: new Date("2026-11-18T10:00:00Z") });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as never);
  const ws = wb.getWorksheet(BOOKING_SHEET_NAME)!;
  assert.equal(String(ws.getCell(1, 1).value), "Show date *");
  assert.equal(ws.getCell(2, 3).dataValidation?.type, "list");
  const lists = wb.getWorksheet("Lists")!;
  assert.equal(lists.getCell(2, 3).value, "Private");
  BOOKING_SHEET_COLUMNS.forEach((c, i) => {
    const v = (good as Record<string, unknown>)[c.key];
    if (v != null) ws.getCell(2, i + 1).value = c.key === "show_date" ? new Date(Date.UTC(2026, 10, 24)) : (v as string | number);
  });
  const filled = Buffer.from(await wb.xlsx.writeBuffer());
  const read = await readBookingSheet(filled, "paper.xlsx");
  assert.deepEqual(read.problems, []);
  assert.equal(read.rows.length, 1);
  const r = checkSheetRow(read.rows[0], lookups);
  assert.deepEqual(r.problems, []);
  assert.equal(r.form.show_date, "2026-11-24");
});

test("CSV from Google Sheets reads too, and a sheet with no header row is refused", async () => {
  const csv = "Show date *,Show *,Partner *,Guest name *,Adults *,Hotel *,Pick-up *\n24/11/2026,MHT LANZAROTE,TUI Lanzarote,\"García, Ana\",2,Sands Beach,Own way\n,,,,,,\n";
  const read = await readBookingSheet(new TextEncoder().encode(csv), "paper.csv");
  assert.equal(read.rows.length, 1);
  assert.equal(read.rows[0].values.guest_name, "García, Ana");
  assert.equal(checkSheetRow(read.rows[0], lookups).ok, true);
  const bad = await readBookingSheet(new TextEncoder().encode("a,b\n1,2\n"), "x.csv");
  assert.match(bad.problems[0], /header row/);
  assert.match((await readBookingSheet(new Uint8Array([1, 2]), "x.xls")).problems[0], /\.xlsx/);
});
