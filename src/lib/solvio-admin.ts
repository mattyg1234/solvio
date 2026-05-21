/**
 * Solvio-internal admin gating. Used to expose platform-level controls
 * (Twilio number provisioning, billing knobs, etc.) to Matty / the team
 * without anyone shipping admin features to merchants by accident.
 *
 * Set SOLVIO_ADMIN_EMAILS on Vercel as a comma-separated allow-list.
 */

export function getSolvioAdminEmails(): string[] {
  const raw = process.env.SOLVIO_ADMIN_EMAILS?.trim() ?? "";
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isSolvioAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = getSolvioAdminEmails();
  if (!allow.length) return false;
  return allow.includes(email.trim().toLowerCase());
}
