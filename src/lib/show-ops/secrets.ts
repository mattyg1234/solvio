import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Symmetric encryption for third-party credentials stored per workspace.
 * Key: SHOW_OPS_SECRETS_KEY, 32 bytes base64. Format: v1.<iv>.<tag>.<ciphertext>, all base64url.
 */
const PREFIX = "v1";

export function secretsKeyConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return loadKey(env) !== null;
}

function loadKey(env: NodeJS.ProcessEnv): Buffer | null {
  const raw = env.SHOW_OPS_SECRETS_KEY?.trim();
  if (!raw) return null;
  try {
    const buf = Buffer.from(raw, "base64");
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}

function requireKey(env: NodeJS.ProcessEnv): Buffer {
  const key = loadKey(env);
  if (!key) {
    throw new Error("SHOW_OPS_SECRETS_KEY is missing or not 32 bytes base64. Generate one with: openssl rand -base64 32");
  }
  return key;
}

export function encryptSecret(plain: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = requireKey(env);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(blob: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = requireKey(env);
  const [prefix, ivB64, tagB64, ctB64] = String(blob || "").split(".");
  if (prefix !== PREFIX || !ivB64 || !tagB64 || !ctB64) throw new Error("Stored secret has an unknown format.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
}

/** Last 4 characters only, for showing "connected as …7306" without exposing the token. */
export function secretHint(plain: string): string {
  const s = String(plain || "").trim();
  return s.length > 4 ? `…${s.slice(-4)}` : "…";
}
