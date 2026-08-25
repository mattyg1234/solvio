const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function showOpsTicketPath(token: string): string {
  return `/ticket/${token.trim().toLowerCase()}`;
}

export function showOpsTicketUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}${showOpsTicketPath(token)}`;
}

/** Pull a ticket token from a scanned URL, a raw UUID, or a /ticket/uuid path. */
export function parseTicketTokenFromScan(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    const m = u.pathname.match(/\/ticket\/([0-9a-f-]{36})/i);
    if (m?.[1] && UUID_RE.test(m[1])) return m[1].toLowerCase();
  } catch {
    /* not a full URL */
  }
  const path = s.match(/\/ticket\/([0-9a-f-]{36})/i);
  if (path?.[1] && UUID_RE.test(path[1])) return path[1].toLowerCase();
  if (UUID_RE.test(s)) return s.toLowerCase();
  return null;
}
