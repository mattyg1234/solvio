import { brandingFromBusiness, parseShowOpsConfig } from "@/lib/show-ops/config";
import { addDaysIso, buildDailyDigest, isoDateInTimeZone } from "@/lib/show-ops/digest";
import { paxTotal } from "@/lib/show-ops/calc";
import { sendShowOpsHtmlEmail } from "@/lib/notifications/show-ops-emails";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const OFFICE_TZ = "Atlantic/Canary";

export async function runShowOpsDailyDigests(now = new Date()): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const admin = createSupabaseServiceRoleClient();
  const reportDate = addDaysIso(isoDateInTimeZone(now, OFFICE_TZ), -1);
  const today = isoDateInTimeZone(now, OFFICE_TZ);
  const takenStart = `${reportDate}T00:00:00`;
  const takenEnd = `${today}T00:00:00`;

  const { data: businesses, error } = await admin
    .from("businesses")
    .select("id,name,show_ops_enabled,show_ops_config,show_ops_display_name")
    .eq("show_ops_enabled", true);
  if (error) return { sent: 0, skipped: 0, errors: [error.message] };

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const b of businesses ?? []) {
    const config = parseShowOpsConfig(b.show_ops_config);
    const emails = config.office_report_emails;
    if (!emails.length) {
      skipped += 1;
      continue;
    }
    const branding = brandingFromBusiness(b);
    const [{ data: taken }, { data: lastNight }, { data: tonightOrders }, { data: tonightBookings }] = await Promise.all([
      admin
        .from("show_bookings")
        .select(
          "booking_ref,guest_name,show_name,show_date,island,supplier_name,adults,children,infants,total_cost,nett_total,billing_mode,payment_status,created_at",
        )
        .eq("business_id", b.id)
        .is("cancelled_at", null)
        .gte("created_at", `${takenStart}+00:00`)
        .lt("created_at", `${takenEnd}+00:00`),
      admin
        .from("show_bookings")
        .select(
          "booking_ref,guest_name,show_name,show_date,island,supplier_name,adults,children,infants,total_cost,nett_total,billing_mode,payment_status,created_at",
        )
        .eq("business_id", b.id)
        .is("cancelled_at", null)
        .eq("show_date", reportDate),
      admin
        .from("show_bus_orders")
        .select("island,seats_ordered,cost_total")
        .eq("business_id", b.id)
        .eq("show_date", today),
      admin
        .from("show_bookings")
        .select("island,adults,children,infants,transport_required")
        .eq("business_id", b.id)
        .eq("show_date", today)
        .eq("transport_required", true)
        .is("cancelled_at", null),
    ]);

    const busPax = new Map<string, number>();
    for (const row of tonightBookings ?? []) {
      busPax.set(row.island, (busPax.get(row.island) ?? 0) + paxTotal(row.adults, row.children, row.infants));
    }
    const digest = buildDailyDigest({
      reportDate,
      currency: config.currency,
      merchantName: branding.displayName,
      takenYesterday: taken ?? [],
      lastNightShows: lastNight ?? [],
      tonightBus: (tonightOrders ?? []).map((o) => ({
        island: o.island,
        seats_ordered: Number(o.seats_ordered) || 0,
        cost_total: Number(o.cost_total) || 0,
        bus_pax: busPax.get(o.island) ?? 0,
      })),
    });
    const result = await sendShowOpsHtmlEmail({
      to: emails,
      subject: digest.subject,
      html: digest.html,
      text: digest.text,
    });
    if (result.ok) sent += 1;
    else errors.push(`${branding.displayName}: ${result.message}`);
  }

  return { sent, skipped, errors };
}
