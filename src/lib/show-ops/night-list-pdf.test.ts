import assert from "node:assert/strict";
import { test } from "node:test";

import { PDFDocument, StandardFonts } from "pdf-lib";

import { buildNightListPdf, nightListCells, nightListColumns, pdfSafe, type NightListPdfRow } from "./night-list-pdf";

const row = (n: number, extra: Partial<NightListPdfRow> = {}): NightListPdfRow => ({
  booking_ref: `MHT-${319600 + n}`,
  guest_name: n % 3 ? "Collins" : "Silvia Lineas Rodríguez",
  adults: 2, children: 0, infants: n % 7 === 0 ? 1 : 0,
  show_name: "1 MHT ACE",
  supplier_name: n % 2 ? "ACE Get Your Guide" : "ACE Reception",
  hotel_name: n % 2 ? "Lanza Playa" : "Private PDC",
  details: n % 4 === 0 ? ["Bus · Playa Blanca Centro 18:10", "+447860524757"] : ["conf"],
  dietary: n % 5 === 0 ? "1 veggie, 1 gluten free — no nuts" : null,
  total: "196.00", paid: "60.00", owed: "136.00",
  door: n % 6 === 0 ? "20:05" : "",
  ...extra,
});

test("every sheet's columns fill the landscape page exactly", () => {
  for (const view of ["office", "door", "meals"] as const) {
    const w = nightListColumns(view).reduce((s, c) => s + c.w, 0);
    assert.equal(w, 786, `${view} columns sum to ${w}`);
  }
});

test("office details lead with the diet in full; the meals sheet gives diet its own column", () => {
  const r = row(5);
  const office = nightListCells("office", r);
  assert.match(office.details, /^DIET: 1 veggie, 1 gluten free — no nuts · conf$/);
  const meals = nightListCells("meals", r);
  assert.equal(meals.dietary, "1 veggie, 1 gluten free — no nuts");
  assert.equal(meals.details, "conf");
  assert.equal(nightListCells("office", row(1)).details, "conf");
});

test("emoji and odd symbols become ? instead of failing the whole sheet", async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  assert.equal(pdfSafe("veggie 🥗 x2\nno nuts", font), "veggie ? x2 · no nuts");
  assert.equal(pdfSafe("café €98", font), "café €98");
});

test("a 60-booking office list paginates with the header repeated and a totals line", async () => {
  const bytes = await buildNightListPdf({
    view: "office",
    businessName: "Music Hall Tavern",
    date: "2026-09-18",
    island: "Lanzarote",
    showName: "1 MHT ACE",
    printedBy: "joel",
    printedAt: new Date("2026-09-17T15:01:52Z"),
    rows: Array.from({ length: 60 }, (_, i) => row(i)),
  });
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 2, "60 rows need more than one landscape page");
  const { width, height } = doc.getPage(0).getSize();
  assert.ok(width > height, "landscape");
  assert.equal(doc.getTitle(), "Show Office List 2026-09-18 Lanzarote");
});

test("door and meals sheets build too, including an empty list", async () => {
  for (const view of ["door", "meals"] as const) {
    const bytes = await buildNightListPdf({ view, businessName: "MHT", date: "2026-09-18", island: null, showName: null, printedBy: "ruth", rows: [row(0)] });
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
  }
  const empty = await buildNightListPdf({ view: "office", businessName: "MHT", date: "2026-09-18", island: null, showName: null, printedBy: "ruth", rows: [] });
  assert.equal((await PDFDocument.load(empty)).getPageCount(), 1);
});
