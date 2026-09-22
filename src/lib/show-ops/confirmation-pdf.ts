import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

import { formatShowOpsMoney, showOpsDayName } from "@/lib/show-ops/calc";
import type { ShowOpsCurrency } from "@/lib/show-ops/types";

/**
 * Ruth's printed guest confirmation (22 Sept 2026, "MHT Confirmation Master
 * Template V7"). Her PDF is the page: logo, welcome, timings, menu, both venue
 * addresses and the sign-off are all hers. We only print the booking into the
 * blank band she left under the header rule.
 *
 * Tenerife and Lanzarote bookings only — the template carries those two venues.
 */
export const CONFIRMATION_ISLANDS = ["Tenerife", "Lanzarote"] as const;

export function confirmationAvailableFor(island: string | null | undefined): boolean {
  return (CONFIRMATION_ISLANDS as readonly string[]).includes(String(island ?? "").trim());
}

export const CONFIRMATION_TEMPLATE_PATH = join(process.cwd(), "src/lib/show-ops/templates/mht-confirmation-v7.pdf");

export async function loadConfirmationTemplate(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(CONFIRMATION_TEMPLATE_PATH));
}

export type GuestConfirmationInput = {
  bookingRef: string;
  guestName: string;
  showName: string;
  /** YYYY-MM-DD */
  showDate: string;
  adults: number;
  children: number;
  infants: number;
  hotelName?: string | null;
  transportRequired: boolean;
  /** bus / private / own_way */
  pickupKind?: string | null;
  pickupStopName?: string | null;
  /** HH:MM */
  pickupTime?: string | null;
  privateZone?: string | null;
  dietaryNotes?: string | null;
  billingMode: string;
  balanceRemaining?: number | null;
  currency: ShowOpsCurrency;
  /** Public ticket page — printed as a QR for the door scan. */
  ticketUrl?: string | null;
  /** Printed small under the details so a reprint is never mistaken for the original. */
  printedAt?: Date;
};

// The band Ruth left blank, in PDF points (origin bottom-left, A4 595 x 842).
// Header rule sits at y≈683; "IT'S ALL ABOUT TIMING" starts at y≈535.
const BAND_TOP = 668;
const BAND_BOTTOM = 548;
const LEFT = 62.4;
const RIGHT = 532.9;
const QR_SIZE = 96;
const INK = rgb(0, 0, 0);
const MUTED = rgb(0.35, 0.35, 0.35);

function paxLine(adults: number, children: number, infants: number): string {
  const parts = [
    adults ? `${adults} adult${adults === 1 ? "" : "s"}` : "",
    children ? `${children} child${children === 1 ? "" : "ren"}` : "",
    infants ? `${infants} infant${infants === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

export function confirmationTransportLine(input: Pick<GuestConfirmationInput, "transportRequired" | "pickupKind" | "pickupStopName" | "pickupTime" | "privateZone">): string {
  if (input.transportRequired) {
    if (!input.pickupStopName) return "Coach pick-up — stop and time to be confirmed by the office";
    const time = input.pickupTime ? String(input.pickupTime).slice(0, 5) : null;
    return time ? `${input.pickupStopName} at ${time} — please be at the stop 5 minutes early` : input.pickupStopName;
  }
  if (input.pickupKind === "private") {
    return `Private transfer${input.privateZone ? ` from ${input.privateZone}` : ""} — arranged separately`;
  }
  return "Making your own way to the venue (see address below)";
}

/** The rows printed on the confirmation, in order. Exported so the test can pin the wording. */
/** "Tuesday 27 October 2026" — how the office reads a date down the phone. */
export function confirmationDateLine(iso: string): string {
  const day = showOpsDayName(iso);
  if (!day) return iso;
  const long = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
  return `${day} ${long}`;
}

export function confirmationRows(input: GuestConfirmationInput): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["Name", input.guestName || "—"],
    ["Booking ref", input.bookingRef],
    ["Show", input.showName],
    ["Date", confirmationDateLine(input.showDate)],
    ["Guests", paxLine(input.adults, input.children, input.infants)],
  ];
  if (input.hotelName) rows.push(["Hotel", input.hotelName]);
  rows.push(["Getting there", confirmationTransportLine(input)]);
  if (input.dietaryNotes?.trim()) rows.push(["Dietary", input.dietaryNotes.trim()]);
  const balance = Number(input.balanceRemaining ?? 0);
  if (input.billingMode === "deposit" && balance > 0) {
    rows.push(["To pay on the night", formatShowOpsMoney(balance, input.currency)]);
  }
  return rows;
}

function fitText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function drawRows(page: PDFPage, rows: Array<[string, string]>, opts: { bold: PDFFont; regular: PDFFont; x: number; top: number; bottom: number; width: number }) {
  const labelW = 88;
  const valueX = opts.x + labelW;
  const valueW = opts.width - labelW;
  const available = opts.top - opts.bottom;
  // Fit every row in the band: shrink the line height before the type.
  const lineH = Math.min(14, available / Math.max(rows.length, 1));
  const size = lineH >= 13 ? 9.5 : lineH >= 11.5 ? 8.8 : 8;
  let y = opts.top - size;
  for (const [label, value] of rows) {
    page.drawText(label.toUpperCase(), { x: opts.x, y, size: size - 2, font: opts.bold, color: MUTED });
    page.drawText(fitText(value, opts.regular, size, valueW), { x: valueX, y, size, font: opts.regular, color: INK });
    y -= lineH;
  }
}

/** Print one booking onto a copy of Ruth's template. Returns the finished PDF bytes. */
export async function buildGuestConfirmationPdf(template: Uint8Array, input: GuestConfirmationInput): Promise<Uint8Array> {
  const doc = await PDFDocument.load(template);
  const page = doc.getPage(0);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  const hasQr = Boolean(input.ticketUrl);
  const textRight = hasQr ? RIGHT - QR_SIZE - 18 : RIGHT;

  page.drawText("YOUR BOOKING", { x: LEFT, y: BAND_TOP - 4, size: 9.5, font: bold, color: INK });
  drawRows(page, confirmationRows(input), {
    bold,
    regular,
    x: LEFT,
    top: BAND_TOP - 20,
    bottom: BAND_BOTTOM + 12,
    width: textRight - LEFT,
  });

  if (input.ticketUrl) {
    const png = await QRCode.toBuffer(input.ticketUrl, { type: "png", margin: 1, width: 384, errorCorrectionLevel: "M" });
    const qr = await doc.embedPng(png);
    const qrX = RIGHT - QR_SIZE;
    const qrY = BAND_TOP - QR_SIZE - 2;
    page.drawImage(qr, { x: qrX, y: qrY, width: QR_SIZE, height: QR_SIZE });
    const caption = "Show this at the door";
    const cw = regular.widthOfTextAtSize(caption, 6.8);
    page.drawText(caption, { x: qrX + (QR_SIZE - cw) / 2, y: qrY - 9, size: 6.8, font: regular, color: MUTED });
  }

  const printed = input.printedAt ?? new Date();
  const stamp = `Printed ${new Intl.DateTimeFormat("en-GB", { timeZone: "Atlantic/Canary", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(printed)}`;
  page.drawText(stamp, { x: LEFT, y: BAND_BOTTOM, size: 6.2, font: regular, color: MUTED });

  doc.setTitle(`Booking confirmation ${input.bookingRef}`);
  return doc.save();
}
