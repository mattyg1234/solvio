import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";

export type InvoicePhotoStorage = { from(bucket: string): { download(path: string): Promise<{ data: Blob | null; error: unknown }> } };
export type InvoicePhotoBooking = { id: string; business_id: string; supplier_id: string | null; booking_ref: string; guest_name: string; no_show_proof_path: string | null };
export type InvoicePhoto = { bookingId: string; bookingRef: string; guestName: string; path: string; filename: string; mimeType: string; content: string; sha256: string };
export const MAX_INVOICE_DELIVERY_BYTES = 18 * 1024 * 1024;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };

function photoTypeMatches(bytes: Buffer, type: string): boolean {
  if (type === "image/jpeg") return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  if (type === "image/png") return bytes.length > 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/webp") return bytes.length > 20 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" && bytes.readUInt32LE(4) === bytes.length - 8;
  if (type === "image/heic" || type === "image/heif") {
    if (bytes.length < 24 || bytes.toString("ascii", 4, 8) !== "ftyp") return false;
    const size = bytes.readUInt32BE(0);
    if (size < 16 || size > bytes.length || size > 128) return false;
    const brands = [bytes.toString("ascii", 8, 12)];
    for (let offset = 16; offset + 4 <= size; offset += 4) brands.push(bytes.toString("ascii", offset, offset + 4));
    return brands.some((brand) => ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand));
  }
  return false;
}

/** Original paper-ticket images, never an external URL. Validate every association before downloading. */
export async function loadInvoicePhotos(storage: InvoicePhotoStorage, business: string, supplier: string | null, bookings: InvoicePhotoBooking[]): Promise<{ photos: InvoicePhoto[]; missing: InvoicePhotoBooking[]; totalBytes: number }> {
  const prepared = bookings.map((booking) => {
    if (!supplier || booking.business_id !== business || booking.supplier_id !== supplier) {
      throw new Error("Invoice booking does not belong to this business and seller. Review the invoice before sending.");
    }
    const path = booking.no_show_proof_path;
    if (!path) return { booking, path: null, ext: "", mimeType: "" };
    const parts = path.split("/");
    if (parts.length !== 3 || parts[0] !== business || parts[1] !== booking.id || !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(parts[2])) {
      throw new Error("Ticket photo path does not belong to this business and booking.");
    }
    const ext = parts[2].split(".").pop()!.toLowerCase();
    const mimeType = PHOTO_MIME[ext];
    if (!mimeType) throw new Error("Unsupported ticket photo type. Use JPEG, PNG, WebP or HEIC/HEIF.");
    return { booking, path, ext, mimeType };
  });
  if (prepared.filter((p) => p.path).length > 50) throw new Error("More than 50 ticket photos exceed one email's attachment limit. Split the invoice pack.");
  const photos: InvoicePhoto[] = [];
  const missing: InvoicePhotoBooking[] = [];
  let totalBytes = 0;
  for (const { booking, path, ext, mimeType } of prepared) {
    if (!path) { missing.push(booking); continue; }
    const { data, error } = await storage.from("show-ops-proofs").download(path);
    if (error || !data) throw new Error(`Could not download ticket photo for ${booking.booking_ref}. Nothing was sent.`);
    if (!data.size || data.size > MAX_PHOTO_BYTES) throw new Error(`Ticket photo for ${booking.booking_ref} must be between 1 byte and 5 MB.`);
    if (data.type.toLowerCase().split(";")[0] !== mimeType) throw new Error(`Ticket photo type does not match its filename for ${booking.booking_ref}. Replace the photo before sending.`);
    totalBytes += data.size;
    if (totalBytes > MAX_INVOICE_DELIVERY_BYTES) throw new Error("Ticket photos exceed the email attachment limit. Split the invoice pack or reduce the images.");
    const bytes = Buffer.from(await data.arrayBuffer());
    if (!photoTypeMatches(bytes, mimeType)) throw new Error(`Ticket photo is not a valid ${mimeType} image for ${booking.booking_ref}. Replace it before sending.`);
    if (mimeType === "image/png" || mimeType === "image/jpeg") {
      if (mimeType === "image/png" && bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 20_000_000) throw new Error("Ticket photo dimensions are too large. Resize before sending.");
      try {
        const doc = await PDFDocument.create();
        const image = mimeType === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        if (image.width * image.height > 20_000_000) throw new Error("Too many pixels");
      } catch { throw new Error(`Ticket photo could not be read safely for ${booking.booking_ref}. Replace or resize it before sending.`); }
    }
    const safeRef = booking.booking_ref.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40) || "booking";
    const safeId = booking.id.replace(/[^a-zA-Z0-9_-]+/g, "-");
    photos.push({ bookingId: booking.id, bookingRef: booking.booking_ref, guestName: booking.guest_name, path,
      filename: `ticket-${safeRef}-${safeId}.${ext}`, mimeType, content: bytes.toString("base64"), sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  return { photos, missing, totalBytes };
}
