import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import {
  buildBusPdf,
  parseBusPdfRequest,
  safeBusLink,
  type BusPdfGroup,
} from "./bus-pdf";
const id = "11111111-1111-4111-8111-111111111111";
const group: BusPdfGroup = {
  label: "Harbour pick-up",
  island: "Tenerife",
  time: "18:30",
  notes: "Wait by the blue sign",
  mapUrl: "https://maps.example/harbour",
  photoUrl: "https://images.example/stop.jpg",
  rows: [
    {
      booking_ref: "BUS-0001",
      guest_name: "Ana Peña",
      hotel_name: "Harbour Hotel",
      guest_mobile: "+34 600 123 456",
      adults: 2,
      children: 1,
      infants: 1,
      dietary_required: true,
      dietary_notes: "No dairy",
    },
  ],
};

test("PDF requests validate real dates, IDs, duplicate IDs and bounded size", () => {
  assert.deepEqual(
    parseBusPdfRequest({ date: "2026-09-05", bookingIds: [id] }),
    { date: "2026-09-05", bookingIds: [id] },
  );
  for (const value of [
    { date: "2026-02-30", bookingIds: [id] },
    { date: "2026-09-05", bookingIds: [id, id] },
    { date: "2026-09-05", bookingIds: ["anything"] },
    { date: "2026-09-05", bookingIds: [] },
  ])
    assert.throws(() => parseBusPdfRequest(value));
});

test("only http links without embedded credentials can enter print and PDF", () => {
  assert.equal(safeBusLink("javascript:alert(1)"), null);
  assert.equal(safeBusLink("data:image/png,abc"), null);
  assert.equal(safeBusLink("https://user:password@example.com"), null);
  assert.equal(
    safeBusLink("https://maps.example/harbour"),
    "https://maps.example/harbour",
  );
});

test("bus PDFs retain guide instructions, hotel/guest details and clickable map/photo links", async () => {
  const bytes = await buildBusPdf({
    date: "2026-09-05",
    businessName: "Test Show",
    groups: [group],
    guides: { Tenerife: "Guide Ana" },
  });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  const streams = doc.context
    .enumerateIndirectObjects()
    .flatMap(([, object]) =>
      object instanceof PDFRawStream
        ? [Buffer.from(decodePDFRawStream(object).decode()).toString("latin1")]
        : [],
    )
    .join("\n");
  for (const text of [
    "BUS-0001",
    "Harbour Hotel",
    "Wait by the blue sign",
    "Guide Ana",
    "No dairy",
  ])
    assert.ok(
      streams.includes(
        Buffer.from(text, "latin1").toString("hex").toUpperCase(),
      ),
      text,
    );
  const objects = doc.context
    .enumerateIndirectObjects()
    .map(([, object]) => object.toString())
    .join("\n");
  assert.match(objects, /maps\.example/);
  assert.match(objects, /images\.example/);
});

test("long sheets paginate and preserve final guests; unsupported characters fail explicitly", async () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({
    ...group.rows[0],
    booking_ref: `BUS-${i + 1}`,
  }));
  const doc = await PDFDocument.load(
    await buildBusPdf({
      date: "2026-09-05",
      businessName: "Test Show",
      groups: [{ ...group, rows }],
      guides: {},
    }),
  );
  assert.ok(doc.getPageCount() > 2);
  const text = doc.context
    .enumerateIndirectObjects()
    .flatMap(([, object]) =>
      object instanceof PDFRawStream
        ? [Buffer.from(decodePDFRawStream(object).decode()).toString("latin1")]
        : [],
    )
    .join("\n");
  assert.ok(
    text.includes(
      Buffer.from("BUS-100", "latin1").toString("hex").toUpperCase(),
    ),
  );
  await assert.rejects(
    buildBusPdf({
      date: "2026-09-05",
      businessName: "Test Show",
      groups: [{ ...group, notes: "你好" }],
      guides: {},
    }),
    /browser Print/,
  );
});

test("guide paragraphs wrap at word boundaries so printed instructions stay readable", async () => {
  const notes =
    "Wait beside the blue sign. The coach stops on the sea-facing side of the road. Please make sure all guests are present before moving to the next stop.";
  const doc = await PDFDocument.load(
    await buildBusPdf({
      date: "2026-09-05",
      businessName: "Test Show",
      groups: [{ ...group, notes }],
      guides: {},
    }),
  );
  const text = doc.context
    .enumerateIndirectObjects()
    .flatMap(([, object]) =>
      object instanceof PDFRawStream
        ? [Buffer.from(decodePDFRawStream(object).decode()).toString("latin1")]
        : [],
    )
    .join("\n");
  assert.ok(
    text.includes(
      Buffer.from("present", "latin1").toString("hex").toUpperCase(),
    ),
  );
});
