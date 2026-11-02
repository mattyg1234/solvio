import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The Tipsi tab sits behind a second password on top of the Hub login.
 * Password: TIPSI_TAB_PASSWORD (Vercel), "0000" when unset — Matty's choice.
 * Unlocking sets a signed cookie bound to the user and to the password, so
 * changing the password locks everyone out again.
 */

export const TIPSI_GATE_COOKIE = "solvio_tipsi_unlock";
export const TIPSI_GATE_TTL_SECONDS = 12 * 3600;

export function tipsiTabPassword(): string {
  return process.env.TIPSI_TAB_PASSWORD?.trim() || "0000";
}

function signingKey(): string {
  // Server-only secret mixed with the password; never sent to the browser.
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.TIPSI_SUPABASE_SERVICE_ROLE_KEY?.trim() || "solvio-tipsi";
  return `${base}:${tipsiTabPassword()}`;
}

function sign(userId: string, exp: number): string {
  return createHmac("sha256", signingKey()).update(`${userId}.${exp}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkTipsiPassword(input: string): boolean {
  return safeEqual(String(input ?? "").trim(), tipsiTabPassword());
}

export function makeTipsiUnlockToken(userId: string, nowMs: number = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + TIPSI_GATE_TTL_SECONDS;
  return `${exp}.${sign(userId, exp)}`;
}

export function verifyTipsiUnlockToken(token: string | undefined | null, userId: string, nowMs: number = Date.now()): boolean {
  if (!token) return false;
  const [expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || !sig) return false;
  if (exp * 1000 <= nowMs) return false;
  return safeEqual(sig, sign(userId, exp));
}
