import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchLogoForPdf, sniffLogoKind, uploadBusinessLogo, validateLogoBytes, BUSINESS_LOGO_MAX_BYTES } from "./business-logo";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

test("sniffs PNG and JPEG from bytes and rejects everything else", () => {
  assert.equal(sniffLogoKind(PNG), "png");
  assert.equal(sniffLogoKind(JPG), "jpg");
  assert.equal(sniffLogoKind(new Uint8Array([0x3c, 0x73, 0x76, 0x67])), null); // "<svg"
  assert.equal(sniffLogoKind(new Uint8Array([0x52, 0x49, 0x46, 0x46])), null); // RIFF/webp
  assert.throws(() => validateLogoBytes(new Uint8Array([0x3c, 0x73, 0x76, 0x67])), /PNG or JPEG/);
  assert.throws(() => validateLogoBytes(new Uint8Array(BUSINESS_LOGO_MAX_BYTES + 1)), /2 MB/);
  assert.throws(() => validateLogoBytes(new Uint8Array()), /Choose a logo/);
  assert.equal(validateLogoBytes(JPG).mimeType, "image/jpeg");
});

test("uploads under the business folder and returns the public URL", async () => {
  const calls: Array<{ path: string; contentType: string }> = [];
  const storage = {
    from: (bucket: string) => ({
      upload: async (path: string, _body: Uint8Array, options: { contentType: string }) => {
        calls.push({ path: `${bucket}/${path}`, contentType: options.contentType });
        return { error: null };
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.example/${bucket}/${path}` } }),
    }),
  };
  const businessId = "5a16bfc4-3363-43e1-bd8c-30afcf3d3529";
  const result = await uploadBusinessLogo(storage, businessId, validateLogoBytes(PNG));
  assert.match(result.path, new RegExp(`^${businessId}/logo-[0-9a-f-]{36}\\.png$`));
  assert.equal(result.publicUrl, `https://cdn.example/business-logos/${result.path}`);
  assert.equal(calls[0].contentType, "image/png");
  await assert.rejects(uploadBusinessLogo(storage, "not-a-uuid", validateLogoBytes(PNG)), /Business is required/);
});

test("fetchLogoForPdf returns bytes for a good logo and a warning, never a throw, otherwise", async () => {
  const ok = async () => new Response(PNG, { status: 200, headers: { "content-type": "image/png" } });
  const good = await fetchLogoForPdf("https://cdn.example/logo.png", ok as typeof fetch);
  assert.ok(good.logo && good.logo.kind === "png");

  const missing = await fetchLogoForPdf(null);
  assert.equal(missing.logo, null);
  assert.match(missing.logo === null ? missing.warning : "", /No logo uploaded/);

  const svg = async () => new Response("<svg/>", { status: 200 });
  const bad = await fetchLogoForPdf("https://cdn.example/logo.svg", svg as typeof fetch);
  assert.equal(bad.logo, null);
  assert.match(bad.logo === null ? bad.warning : "", /not a PNG or JPEG/);

  const broken = async () => { throw new Error("socket hang up"); };
  const failed = await fetchLogoForPdf("https://cdn.example/logo.png", broken as unknown as typeof fetch);
  assert.equal(failed.logo, null);
  assert.match(failed.logo === null ? failed.warning : "", /socket hang up/);

  const notFound = async () => new Response("", { status: 404 });
  const gone = await fetchLogoForPdf("https://cdn.example/logo.png", notFound as typeof fetch);
  assert.match(gone.logo === null ? gone.warning : "", /HTTP 404/);
});
