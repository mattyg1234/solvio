/**
 * Upload a logo file for a business and point its logo_url at it.
 * Creates the public `business-logos` bucket if it does not exist yet.
 *
 *   node --env-file=.env.local --import tsx scripts/upload-business-logo.mts <business-id> <path/to/logo.png> [--show-ops]
 *
 * --show-ops also sets show_ops_logo_url (the white-label override used by the Show Ops hub).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { BUSINESS_LOGO_BUCKET, BUSINESS_LOGO_MAX_BYTES, uploadBusinessLogo, validateLogoBytes } from "../src/lib/business-logo";

const [businessId, filePath, ...flags] = process.argv.slice(2);
if (!businessId || !filePath) {
  console.error("usage: upload-business-logo.mts <business-id> <logo.png|jpg> [--show-ops]");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (use --env-file=.env.local).");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: business, error: bizErr } = await admin.from("businesses").select("id,name,logo_url,show_ops_logo_url").eq("id", businessId).maybeSingle();
if (bizErr || !business) throw new Error(`Business ${businessId} not found: ${bizErr?.message ?? "no row"}`);

const { data: buckets, error: listErr } = await admin.storage.listBuckets();
if (listErr) throw new Error(`Could not list buckets: ${listErr.message}`);
if (!buckets.some((b) => b.name === BUSINESS_LOGO_BUCKET)) {
  const { error } = await admin.storage.createBucket(BUSINESS_LOGO_BUCKET, { public: true, fileSizeLimit: BUSINESS_LOGO_MAX_BYTES, allowedMimeTypes: ["image/png", "image/jpeg"] });
  if (error) throw new Error(`Could not create bucket: ${error.message}`);
  console.log(`created public bucket ${BUSINESS_LOGO_BUCKET}`);
}

const logo = validateLogoBytes(new Uint8Array(readFileSync(filePath)));
const { path, publicUrl } = await uploadBusinessLogo(admin.storage, business.id, logo);
const patch: Record<string, string> = { logo_url: publicUrl, updated_at: new Date().toISOString() };
if (flags.includes("--show-ops")) patch.show_ops_logo_url = publicUrl;
const { error: updErr } = await admin.from("businesses").update(patch).eq("id", business.id);
if (updErr) throw new Error(`Uploaded to ${path} but could not update the business: ${updErr.message}`);
console.log(`${business.name}: logo_url -> ${publicUrl}`);
