/**
 * After-show feedback (Joel, 27 Oct; WhatsApp template 4): the morning after a
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

/** Yesterday's date in Canary time, YYYY-MM-DD. */
export function canaryYesterday(now = new Date()): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Canary", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
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
