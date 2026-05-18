import { headers } from "next/headers";

/** Absolute origin for building public links (booking URLs, emails). Server-only. */
export async function getSiteUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const forwardedProto = h.get("x-forwarded-proto");
  const proto =
    forwardedProto ??
    (host?.includes("localhost") || host?.startsWith("127.") ? "http" : "https");
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (host) {
    return `${proto}://${host}`;
  }
  return env ?? "http://localhost:3000";
}
