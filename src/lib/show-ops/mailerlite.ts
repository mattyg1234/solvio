/**
 * MailerLite (Joel, 2 Nov): guests who said YES to MHT updates (WhatsApp template 5)
 * are added to MHT's MailerLite automatically, so the marketing list builds itself.
 *
 * Only guests with an email and a recorded YES are sent. A guest who later replies
 * STOP is taken out of the Hub's MailerLite groups again (their MailerLite
 * subscription status is left alone, so MailerLite's own unsubscribes always win).
 * Pure helpers and the small API client live here; the runner is runMailerLiteSync.
 */

import { decryptSecret } from "@/lib/show-ops/secrets";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const API = "https://connect.mailerlite.com/api";

export const MAILERLITE_ISLANDS = ["Tenerife", "Lanzarote", "Gran Canaria"] as const;

/** Which MailerLite group(s) the Hub adds guests to: one for everyone, and optionally one per island. */
export type MailerLiteGroups = { all: string; islands: Partial<Record<(typeof MAILERLITE_ISLANDS)[number], string>> };

export type MailerLiteGroup = { id: string; name: string; activeCount: number };

export function parseMailerLiteGroups(meta: unknown): MailerLiteGroups {
  const m = (meta ?? {}) as { groups?: { all?: unknown; islands?: Record<string, unknown> } };
  const islands: MailerLiteGroups["islands"] = {};
  for (const island of MAILERLITE_ISLANDS) {
    const id = m.groups?.islands?.[island];
    if (typeof id === "string" && id.trim()) islands[island] = id.trim();
  }
  return { all: typeof m.groups?.all === "string" ? m.groups.all.trim() : "", islands };
}

/** The island a booking belongs to, matched loosely ("TFS", "tenerife south", "LPA", "Gran Canaria"). */
export function bookingIsland(island: string | null | undefined): (typeof MAILERLITE_ISLANDS)[number] | null {
  const s = String(island ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes("tenerife") || s === "tfs" || s === "tfn") return "Tenerife";
  if (s.includes("lanzarote") || s === "ace") return "Lanzarote";
  if (s.includes("gran canaria") || s === "lpa") return "Gran Canaria";
  return null;
}

/** Group ids for one guest: the main group, plus their island's group when one is set. */
export function groupsForBooking(groups: MailerLiteGroups, island: string | null | undefined): string[] {
  const out = groups.all ? [groups.all] : [];
  const i = bookingIsland(island);
  const extra = i ? groups.islands[i] : undefined;
  if (extra && !out.includes(extra)) out.push(extra);
  return out;
}

const EMAIL = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[a-z]{2,}$/i;

/** A single clean email address, or null (blank, several addresses, or obviously not an email). */
export function cleanGuestEmail(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  return EMAIL.test(s) ? s : null;
}

/** "Sarah Jane Smith" → name "Sarah", last_name "Jane Smith". */
export function splitGuestName(raw: string | null | undefined): { name: string; last_name: string } {
  const parts = String(raw ?? "").trim().split(/\s+/).filter(Boolean);
  return { name: (parts[0] ?? "").slice(0, 60), last_name: parts.slice(1).join(" ").slice(0, 60) };
}

export type MailerLiteBooking = {
  id: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_mobile: string | null;
  island: string | null;
  marketing_opt_in_at: string | null;
  whatsapp_opted_out_at: string | null;
  mailerlite_synced_at: string | null;
};

/** Should this booking's guest be added to MailerLite now? */
export function needsMailerLiteAdd(b: MailerLiteBooking): boolean {
  return Boolean(b.marketing_opt_in_at) && !b.whatsapp_opted_out_at && !b.mailerlite_synced_at && cleanGuestEmail(b.guest_email) !== null;
}

export class MailerLiteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function mailerLiteErrorMessage(err: unknown): string {
  if (err instanceof MailerLiteError) {
    if (err.status === 401) return "MailerLite refused the API token. Make a new one in MailerLite (Integrations → API) and paste it again.";
    if (err.status === 429) return "MailerLite is rate limiting. The Hub will try again on the next run.";
    return `MailerLite said: ${err.message}`;
  }
  return err instanceof Error ? err.message : "MailerLite could not be reached.";
}

export class MailerLiteClient {
  constructor(
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await this.fetcher(`${API}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as unknown) : {};
    if (!res.ok) {
      const msg = (json as { message?: string }).message || `HTTP ${res.status}`;
      throw new MailerLiteError(String(msg).slice(0, 300), res.status);
    }
    return json as T;
  }

  async listGroups(): Promise<MailerLiteGroup[]> {
    const r = await this.call<{ data?: Array<{ id: string | number; name: string; active_count?: number }> }>("/groups?limit=250&sort=name");
    return (r.data ?? []).map((g) => ({ id: String(g.id), name: String(g.name), activeCount: Number(g.active_count ?? 0) }));
  }

  /**
   * Adds or updates one subscriber and puts them in the groups. Status is not sent, so a new
   * address starts active and anyone who unsubscribed in MailerLite stays unsubscribed.
   */
  async upsertSubscriber(input: { email: string; name: string; last_name: string; phone: string | null; groups: string[] }): Promise<string> {
    const fields: Record<string, string> = { name: input.name, last_name: input.last_name };
    if (input.phone) fields.phone = input.phone;
    const r = await this.call<{ data?: { id: string | number } }>("/subscribers", {
      method: "POST",
      body: { email: input.email, fields, groups: input.groups },
    });
    return String(r.data?.id ?? "");
  }

  async removeFromGroup(subscriberId: string, groupId: string): Promise<void> {
    try {
      await this.call(`/subscribers/${encodeURIComponent(subscriberId)}/groups/${encodeURIComponent(groupId)}`, { method: "DELETE" });
    } catch (err) {
      if (err instanceof MailerLiteError && err.status === 404) return;
      throw err;
    }
  }
}

export type MailerLiteRunResult = { businessId: string; added: number; removed: number; failed: number; error?: string };

const BATCH = 100;

/**
 * Sends waiting opted-in guests to MailerLite and takes STOP repliers back out.
 * Runs from the hourly cron for every connected workspace, or for one workspace from Settings.
 */
export async function runMailerLiteSync(onlyBusinessId?: string): Promise<MailerLiteRunResult[]> {
  const db = createSupabaseServiceRoleClient();
  let q = db.from("show_ops_integrations").select("business_id,secret_ciphertext,meta").eq("provider", "mailerlite").eq("status", "connected");
  if (onlyBusinessId) q = q.eq("business_id", onlyBusinessId);
  const { data: rows } = await q;
  const results: MailerLiteRunResult[] = [];

  for (const row of (rows ?? []) as Array<{ business_id: string; secret_ciphertext: string; meta: unknown }>) {
    const r: MailerLiteRunResult = { businessId: row.business_id, added: 0, removed: 0, failed: 0 };
    results.push(r);
    const groups = parseMailerLiteGroups(row.meta);
    if (!groups.all) {
      r.error = "No MailerLite group chosen yet.";
      continue;
    }
    try {
      const client = new MailerLiteClient(decryptSecret(row.secret_ciphertext));

      const { data: waiting } = await db
        .from("show_bookings")
        .select("id,guest_name,guest_email,guest_mobile,island,marketing_opt_in_at,whatsapp_opted_out_at,mailerlite_synced_at")
        .eq("business_id", row.business_id)
        .not("marketing_opt_in_at", "is", null)
        .is("whatsapp_opted_out_at", null)
        .is("mailerlite_synced_at", null)
        .not("guest_email", "is", null)
        .order("marketing_opt_in_at")
        .limit(BATCH);
      for (const b of (waiting ?? []) as MailerLiteBooking[]) {
        if (!needsMailerLiteAdd(b)) continue;
        try {
          const id = await client.upsertSubscriber({
            email: cleanGuestEmail(b.guest_email)!,
            ...splitGuestName(b.guest_name),
            phone: b.guest_mobile?.trim() || null,
            groups: groupsForBooking(groups, b.island),
          });
          await db
            .from("show_bookings")
            .update({ mailerlite_synced_at: new Date().toISOString(), mailerlite_subscriber_id: id || null, mailerlite_error: null })
            .eq("id", b.id);
          r.added++;
        } catch (err) {
          if (err instanceof MailerLiteError && (err.status === 401 || err.status === 429)) throw err;
          r.failed++;
          await db.from("show_bookings").update({ mailerlite_error: mailerLiteErrorMessage(err).slice(0, 300) }).eq("id", b.id);
        }
      }

      const { data: stopped } = await db
        .from("show_bookings")
        .select("id,island,mailerlite_subscriber_id")
        .eq("business_id", row.business_id)
        .not("mailerlite_subscriber_id", "is", null)
        .not("whatsapp_opted_out_at", "is", null)
        .is("mailerlite_removed_at", null)
        .limit(BATCH);
      for (const b of (stopped ?? []) as Array<{ id: string; island: string | null; mailerlite_subscriber_id: string }>) {
        for (const g of groupsForBooking(groups, b.island)) await client.removeFromGroup(b.mailerlite_subscriber_id, g);
        await db.from("show_bookings").update({ mailerlite_removed_at: new Date().toISOString() }).eq("id", b.id);
        r.removed++;
      }

      await db
        .from("show_ops_integrations")
        .update({ last_checked_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
        .eq("business_id", row.business_id)
        .eq("provider", "mailerlite");
    } catch (err) {
      r.error = mailerLiteErrorMessage(err);
      await db
        .from("show_ops_integrations")
        .update({ status: err instanceof MailerLiteError && err.status === 401 ? "error" : "connected", last_error: r.error, last_checked_at: new Date().toISOString() })
        .eq("business_id", row.business_id)
        .eq("provider", "mailerlite");
    }
  }
  return results;
}
