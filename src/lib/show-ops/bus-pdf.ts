import {
  PDFDocument,
  PDFString,
  StandardFonts,
  rgb,
  type PDFFont,
} from "pdf-lib";
import { safeBusLink } from "./bus-links";
export { safeBusLink } from "./bus-links";

export type BusPdfRow = {
  booking_ref: string;
  guest_name: string;
  hotel_name: string | null;
  guest_mobile: string | null;
  adults: number;
  children: number;
  infants: number;
  dietary_required: boolean;
  dietary_notes: string | null;
};
export type BusPdfGroup = {
  label: string;
  island: string;
  time: string;
  notes: string;
  mapUrl: string | null;
  photoUrl: string | null;
  rows: BusPdfRow[];
};
export function parseBusPdfRequest(value: unknown): {
  date: string;
  bookingIds: string[];
} {
  if (!value || typeof value !== "object")
    throw new Error("Choose a bus list to download.");
  const { date, bookingIds } = value as Record<string, unknown>;
  const parsedDate =
    typeof date === "string" ? new Date(`${date}T12:00:00Z`) : null;
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !parsedDate ||
    !Number.isFinite(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  )
    throw new Error("Choose a valid show date.");
  if (
    !Array.isArray(bookingIds) ||
    !bookingIds.length ||
    bookingIds.length > 5000 ||
    new Set(bookingIds).size !== bookingIds.length ||
    bookingIds.some(
      (id) =>
        typeof id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        ),
    )
  )
    throw new Error(
      "Choose up to 5,000 distinct bookings. Filter by island for a smaller list.",
    );
  return { date, bookingIds: bookingIds as string[] };
}

export async function buildBusPdf(input: {
  date: string;
  businessName: string;
  groups: BusPdfGroup[];
  guides: Record<string, string>;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(`Bus list ${input.date}`);
  doc.setAuthor(input.businessName);
  doc.setCreator("Solvio Show Ops");
  const left = 42;
  const width = 511;
  let page = doc.addPage([595.28, 841.89]);
  let y = 792;
  let stopHeading = "";
  const clean = (value: string) => {
    const text = value.replace(/\r\n?/g, "\n").replace(/\t/g, " ");
    if (text.length > 10000)
      throw new Error(
        "Guide notes are too long for this PDF. Use browser Print.",
      );
    try {
      regular.encodeText(text.replace(/\n/g, " "));
    } catch {
      throw new Error(
        "Some characters need browser Print instead of PDF download.",
      );
    }
    return text;
  };
  const wrap = (text: string, font: PDFFont, size: number) => {
    const lines: string[] = [];
    for (const paragraph of clean(text).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        if (!word) continue;
        const joined = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(joined, size) <= width) {
          line = joined;
          continue;
        }
        if (line) {
          lines.push(line);
          line = "";
        }
        // Long map/photo URLs have no spaces, so split only those oversized words.
        for (const char of word) {
          if (font.widthOfTextAtSize(line + char, size) > width) {
            lines.push(line);
            line = "";
          }
          line += char;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  const header = () => {
    const title = clean(`Bus list · ${input.date}`);
    page.drawText(title, {
      x: left,
      y,
      size: 15,
      font: bold,
      color: rgb(0.08, 0.12, 0.19),
    });
    y -= 22;
    for (const text of wrap(input.businessName, regular, 10)) {
      page.drawText(text, { x: left, y, size: 10, font: regular });
      y -= 14;
    }
    if (stopHeading)
      for (const text of wrap(`${stopHeading} (continued)`, bold, 10)) {
        page.drawText(text, { x: left, y, size: 10, font: bold });
        y -= 14;
      }
    y -= 10;
  };
  const ensure = (height: number) => {
    if (y - height < 50) {
      page = doc.addPage([595.28, 841.89]);
      y = 792;
      header();
    }
  };
  const paragraph = (
    text: string,
    strong = false,
    size = 10,
    url?: string | null,
  ) => {
    const font = strong ? bold : regular;
    for (const line of wrap(text, font, size)) {
      ensure(size + 6);
      page.drawText(line, {
        x: left,
        y,
        size,
        font,
        color: url ? rgb(0.08, 0.31, 0.55) : rgb(0.12, 0.16, 0.21),
      });
      if (url && line) {
        const annotation = doc.context.obj({
          Type: "Annot",
          Subtype: "Link",
          Rect: [
            left,
            y - 2,
            left + font.widthOfTextAtSize(line, size),
            y + size,
          ],
          Border: [0, 0, 0],
          A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
        });
        page.node.addAnnot(doc.context.register(annotation));
      }
      y -= size + 5;
    }
  };
  header();
  const rows = input.groups.flatMap((group) => group.rows);
  paragraph(
    `${rows.length} bookings · ${rows.reduce((sum, row) => sum + row.adults + row.children + row.infants, 0)} guests`,
    true,
  );
  paragraph(
    "Internal guide list. Hotel, guest and pick-up details for this run.",
    false,
    9,
  );
  y -= 8;
  for (const [index, group] of input.groups.entries()) {
    stopHeading = "";
    ensure(75);
    stopHeading = `${index + 1}. ${group.time} · ${group.label} · ${group.island}`;
    paragraph(stopHeading, true, 11);
    if (input.guides[group.island])
      paragraph(`Guide: ${input.guides[group.island]}`, true, 9);
    if (group.notes) paragraph(`Guide notes: ${group.notes}`, false, 9);
    const map = safeBusLink(group.mapUrl);
    const photo = safeBusLink(group.photoUrl);
    if (map) paragraph(`Map: ${map}`, false, 8, map);
    if (photo) paragraph(`Pick-up photo: ${photo}`, false, 8, photo);
    y -= 5;
    for (const row of group.rows) {
      ensure(55);
      paragraph(
        `${row.booking_ref} · ${row.guest_name} · ${row.adults} adult / ${row.children} child / ${row.infants} infant`,
        true,
        9,
      );
      paragraph(
        `Hotel: ${row.hotel_name || "Not recorded"}${row.guest_mobile ? ` · Mobile: ${row.guest_mobile}` : ""}`,
        false,
        9,
      );
      if (row.dietary_required)
        paragraph(`Diet: ${row.dietary_notes || "Check with guest"}`, false, 9);
      y -= 7;
    }
    y -= 9;
  }
  const pages = doc.getPages();
  pages.forEach((p, index) =>
    p.drawText(`${index + 1} / ${pages.length}`, {
      x: 512,
      y: 27,
      size: 8,
      font: regular,
    }),
  );
  return doc.save();
}
