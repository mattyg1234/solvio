/**
 * After-show feedback (Joel, 27 Oct; WhatsApp template 4): about 24 hours after a
 * show, every guest who came gets one WhatsApp asking how it was, with the
 * review button that's set on the template in Meta.
 *
 * Only runs for workspaces whose feedback template is approved (Meta) or has a
 * Twilio SID, so nothing goes out until the template is ready. WhatsApp only,
 * never SMS. Skips cancelled bookings, no-shows, guests with no mobile and
 * guests already sent it (show_bookings.feedback_sent_at).
 */

import { firstName } from "@/lib/show-ops/inbox/logic";
import { fillTemplateWording, templateSpec, templateVariables } from "@/lib/show-ops/inbox/templates";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** The date `days` ago in Canary time, YYYY-MM-DD. */
export function canaryDaysAgo(days: number, now = new Date()): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Canary", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Yesterday's date in Canary time, YYYY-MM-DD. */
export function canaryYesterday(now = new Date()): string {
  return canaryDaysAgo(1, now);
}

/** "Friday 6 November", as the templates read. */
export function feedbackDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).replace(",", "");
}

export function feedbackValues(b: { guest_name: string | null; island: string | null; show_date: string }): string[] {
  return [firstName(b.guest_name ?? ""), String(b.island ?? "").trim() || "MHT", feedbackDate(b.show_date)];
}

export async function runShowOpsAfterShowFeedback(
  now = new Date(),
): Promise<{ date: string; sent: number; skipped: number; failed: number; errors: string[] }> {
  const date = canaryYesterday(now);
  const admin = createSupabaseServiceRoleClient();
  const { loadTwilioConnection, templateRef } = await import("@/lib/show-ops/inbox/connection");
  const { sendBusinessTextToGuest } = await import("@/lib/show-ops/inbox/server");
  const spec = templateSpec("feedback");

  const out = { date, sent: 0, skipped: 0, failed: 0, errors: [] as string[] };
  const { data: businesses, error } = await admin.from("businesses").select("id,name").eq("show_ops_enabled", true);
  if (error) return { ...out, errors: [error.message] };

  for (const biz of businesses ?? []) {
    const conn = await loadTwilioConnection(String(biz.id)).catch(() => null);
    if (!conn || !templateRef(conn, "feedback")) continue;

    const { data: bookings, error: bErr } = await admin
      .from("show_bookings")
      .select("id,guest_name,guest_mobile,island,show_date,no_show,feedback_sent_at,whatsapp_opted_out_at")
      .eq("business_id", biz.id)
      .eq("show_date", date)
      .is("cancelled_at", null)
      .is("feedback_sent_at", null)
      .limit(1000);
    if (bErr) {
      out.errors.push(`${biz.name}: ${bErr.message}`);
      continue;
    }
    for (const b of bookings ?? []) {
      if (b.no_show || !String(b.guest_mobile ?? "").trim() || b.whatsapp_opted_out_at) {
        out.skipped += 1;
        continue;
      }
      const values = feedbackValues(b as { guest_name: string | null; island: string | null; show_date: string });
      const res = await sendBusinessTextToGuest(String(biz.id), {
        phone: String(b.guest_mobile),
        body: fillTemplateWording(spec, values),
        bookingId: String(b.id),
        guestName: b.guest_name,
        template: () => ({ kind: "feedback", variables: templateVariables(values) }),
        whatsappOnly: true,
        source: "template",
      });
      if (res.ok) {
        out.sent += 1;
        await admin.from("show_bookings").update({ feedback_sent_at: new Date().toISOString() }).eq("id", b.id);
      } else {
        out.failed += 1;
        if (out.errors.length < 10) out.errors.push(`${biz.name}: ${res.message}`);
      }
    }
  }
  return out;
}

/** Canary hour (0–23) right now. */
export function canaryHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Atlantic/Canary", hour: "2-digit", hourCycle: "h23" }).format(now));
}

/** Marketing ask goes out 23 hours after the booking was made, but only 09:00–20:59 Canary time. */
export const MARKETING_ASK_AFTER_HOURS = 23;
/** Bookings older than this that were never asked (Hub down, quiet hours, token outage) are left alone. */
export const MARKETING_ASK_GIVE_UP_HOURS = 47;

export function marketingAskWindow(now = new Date()): { quiet: boolean; from: string; to: string } {
  const h = canaryHour(now);
  return {
    quiet: h < 9 || h >= 21,
    from: new Date(now.getTime() - MARKETING_ASK_GIVE_UP_HOURS * 3600_000).toISOString(),
    to: new Date(now.getTime() - MARKETING_ASK_AFTER_HOURS * 3600_000).toISOString(),
  };
}

/**
 * Marketing permission (template 5, Matty 18 Nov): about 23 hours after a booking is
 * made, the guest gets one WhatsApp asking if they'd like MHT news. Runs hourly;
 * nothing is sent at night (21:00–08:59 Canary), those wait for the morning run.
 * Asked once per phone number, ever. A YES reply records consent; STOP opts out
 * (see inbox/server.ts).
 */
export async function runShowOpsMarketingAsk(
  now = new Date(),
): Promise<{ date: string; sent: number; skipped: number; failed: number; errors: string[] }> {
  const win = marketingAskWindow(now);
  const date = `${win.from}..${win.to}`;
  if (win.quiet) return { date, sent: 0, skipped: 0, failed: 0, errors: [] };
  const admin = createSupabaseServiceRoleClient();
  const { loadTwilioConnection, templateRef } = await import("@/lib/show-ops/inbox/connection");
  const { sendBusinessTextToGuest } = await import("@/lib/show-ops/inbox/server");
  const { phoneTail } = await import("@/lib/show-ops/inbox/logic");
  const spec = templateSpec("marketing");

  const out = { date, sent: 0, skipped: 0, failed: 0, errors: [] as string[] };
  const { data: businesses, error } = await admin.from("businesses").select("id,name").eq("show_ops_enabled", true);
  if (error) return { ...out, errors: [error.message] };

  for (const biz of businesses ?? []) {
    const conn = await loadTwilioConnection(String(biz.id)).catch(() => null);
    if (!conn || !templateRef(conn, "marketing")) continue;

    const { data: bookings, error: bErr } = await admin
      .from("show_bookings")
      .select("id,guest_name,guest_mobile,no_show,marketing_asked_at,marketing_opt_in_at,whatsapp_opted_out_at")
      .eq("business_id", biz.id)
      .gte("created_at", win.from)
      .lte("created_at", win.to)
      .is("cancelled_at", null)
      .is("marketing_asked_at", null)
      .limit(1000);
    if (bErr) {
      out.errors.push(`${biz.name}: ${bErr.message}`);
      continue;
    }
    const doneTails = new Set<string>();
    for (const b of bookings ?? []) {
      const mobile = String(b.guest_mobile ?? "").trim();
      const tail = phoneTail(mobile);
      if (b.no_show || tail.length < 9 || b.marketing_opt_in_at || b.whatsapp_opted_out_at || doneTails.has(tail)) {
        out.skipped += 1;
        continue;
      }
      doneTails.add(tail);
      // Asked before on another booking (or opted out there)? Then never again.
      const { data: earlier } = await admin
        .from("show_bookings")
        .select("guest_mobile,marketing_asked_at,whatsapp_opted_out_at")
        .eq("business_id", biz.id)
        .neq("id", b.id)
        .ilike("guest_mobile", `%${tail.slice(-3)}%`)
        .or("marketing_asked_at.not.is.null,whatsapp_opted_out_at.not.is.null")
        .limit(200);
      if ((earlier ?? []).some((e) => phoneTail(String(e.guest_mobile ?? "")) === tail)) {
        out.skipped += 1;
        continue;
      }
      const values = [firstName(b.guest_name ?? "")];
      const res = await sendBusinessTextToGuest(String(biz.id), {
        phone: mobile,
        body: fillTemplateWording(spec, values),
        bookingId: String(b.id),
        guestName: b.guest_name,
        template: () => ({ kind: "marketing", variables: templateVariables(values) }),
        whatsappOnly: true,
        source: "template",
      });
      if (res.ok) {
        out.sent += 1;
        await admin.from("show_bookings").update({ marketing_asked_at: new Date().toISOString() }).eq("id", b.id);
      } else {
        out.failed += 1;
        if (out.errors.length < 10) out.errors.push(`${biz.name}: ${res.message}`);
      }
    }
  }
  return out;
}
