/**
 * Business logos: uploaded at signup (required) and from Settings, stored in the
 * public `business-logos` bucket, and embedded in invoice PDFs.
 *
 * Only PNG and JPEG are accepted because those are the formats pdf-lib can embed
 * without a rasteriser. Keep this list in sync with the bucket's allowed MIME types.
 */

export const BUSINESS_LOGO_BUCKET = "business-logos";
export const BUSINESS_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const BUSINESS_LOGO_ACCEPT = "image/png,image/jpeg";

export type LogoKind = "png" | "jpg";
export type ValidatedLogo = { bytes: Uint8Array; kind: LogoKind; mimeType: "image/png" | "image/jpeg" };

/** Sniff the real format from the bytes; browsers and proxies lie about MIME types. */
export function sniffLogoKind(bytes: Uint8Array): LogoKind | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}

export const LOGO_FORMAT_MESSAGE = "Upload your logo as a PNG or JPEG (max 2 MB). It goes on every invoice you send, so use the version you would print.";

export function validateLogoBytes(bytes: Uint8Array): ValidatedLogo {
  if (!bytes.length) throw new Error("Choose a logo file to upload.");
  if (bytes.length > BUSINESS_LOGO_MAX_BYTES) throw new Error("Logo is larger than 2 MB. Export a smaller PNG or JPEG and try again.");
  const kind = sniffLogoKind(bytes);
  if (!kind) throw new Error(LOGO_FORMAT_MESSAGE);
  return { bytes, kind, mimeType: kind === "png" ? "image/png" : "image/jpeg" };
}

export async function validateLogoFile(file: unknown): Promise<ValidatedLogo> {
  if (!(file instanceof File) || !file.size) throw new Error("Choose a logo file to upload.");
  if (file.size > BUSINESS_LOGO_MAX_BYTES) throw new Error("Logo is larger than 2 MB. Export a smaller PNG or JPEG and try again.");
  return validateLogoBytes(new Uint8Array(await file.arrayBuffer()));
}

/** Minimal storage surface so this can be unit-tested without a Supabase client. */
export type LogoStorage = {
  from(bucket: string): {
    upload(path: string, body: Uint8Array, options: { contentType: string; cacheControl: string; upsert: boolean }): Promise<{ error: { message: string } | null }>;
    getPublicUrl(path: string): { data: { publicUrl: string } };
  };
};

/** Uploads under `<businessId>/logo-<uuid>.<ext>` and returns the public URL to store on the business row. */
export async function uploadBusinessLogo(storage: LogoStorage, businessId: string, logo: ValidatedLogo): Promise<{ path: string; publicUrl: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) throw new Error("Business is required before a logo can be stored.");
  const path = `${businessId}/logo-${crypto.randomUUID()}.${logo.kind}`;
  const bucket = storage.from(BUSINESS_LOGO_BUCKET);
  const { error } = await bucket.upload(path, logo.bytes, { contentType: logo.mimeType, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(`Logo upload failed: ${error.message}`);
  return { path, publicUrl: bucket.getPublicUrl(path).data.publicUrl };
}

export type LogoFetchResult = { logo: ValidatedLogo } | { logo: null; warning: string };

/**
 * Fetches a stored logo for PDF embedding. Never throws: an invoice must still go
 * out if a logo is missing or in a format the PDF cannot embed, but the caller is
 * told why so the office can fix it.
 */
export async function fetchLogoForPdf(url: string | null | undefined, fetchImpl: typeof fetch = fetch): Promise<LogoFetchResult> {
  const target = String(url ?? "").trim();
  if (!target) return { logo: null, warning: "No logo uploaded yet. Add one under Settings so it prints on invoices." };
  if (!/^https?:\/\//i.test(target)) return { logo: null, warning: "The stored logo link is not a valid URL. Re-upload the logo under Settings." };
  try {
    const res = await fetchImpl(target, { signal: AbortSignal.timeout(8000), redirect: "follow" });
    if (!res.ok) return { logo: null, warning: `The logo could not be downloaded (HTTP ${res.status}). Re-upload it under Settings.` };
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > BUSINESS_LOGO_MAX_BYTES) return { logo: null, warning: "The logo is larger than 2 MB and was left off the PDF. Upload a smaller PNG or JPEG." };
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > BUSINESS_LOGO_MAX_BYTES) return { logo: null, warning: "The logo is larger than 2 MB and was left off the PDF. Upload a smaller PNG or JPEG." };
    const kind = sniffLogoKind(bytes);
    if (!kind) return { logo: null, warning: "The logo is not a PNG or JPEG, so it cannot be embedded in the PDF. Re-upload it under Settings." };
    return { logo: validateLogoBytes(bytes) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return { logo: null, warning: `The logo could not be downloaded (${reason}). Re-upload it under Settings.` };
  }
}
