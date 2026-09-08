// Shared Holded client. Reads HOLDED_API_TOKEN (v2 "pat_…") or HOLDED_API_KEY (v1) from .env.local. Never prints secrets.
import { readFileSync } from "node:fs";
const env = (() => { try { return readFileSync(new URL("../.env.local", import.meta.url), "utf8"); } catch { return ""; } })();
const pick = (name) => (process.env[name] || (env.match(new RegExp(`^${name}=(.+)$`, "m")) || [])[1] || "").trim().replace(/^["']|["']$/g, "");
export const token = pick("HOLDED_API_TOKEN");
export const legacyKey = pick("HOLDED_API_KEY");
export const BASE = "https://api.holded.com/api";
export const authMode = token ? "v2 token" : legacyKey ? "v1 key" : "none";
function headers() {
  const h = { accept: "application/json", "content-type": "application/json" };
  if (token) { h.authorization = `Bearer ${token}`; h.key = token; } // send both; Holded v2 docs vary
  else if (legacyKey) h.key = legacyKey;
  return h;
}
export async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}
