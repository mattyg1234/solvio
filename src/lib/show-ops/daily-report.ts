import { brandingFromBusiness, parseShowOpsConfig } from "@/lib/show-ops/config";
import { addDaysIso, buildDailyDigest, isoDateInTimeZone, type DigestOverdueInvoice } from "@/lib/show-ops/digest";
import { paxTotal } from "@/lib/show-ops/calc";
import { sendShowOpsHtmlEmail } from "@/lib/notifications/show-ops-emails";
import { getDeploymentSiteUrl } from "@/lib/deployment-site-url";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { ShowOpsCurrency } from "@/lib/show-ops/types";

const OFFICE_TZ = "Atlantic/Canary";

/** The business columns the digest needs — same select the cron and the "send me a sample" button use. */
export const DIGEST_BUSINESS_SELECT = "id,name,show_ops_enabled,show_ops_config,show_ops_display_name";

export type DigestBusinessRow = {
  id: string;
  name: string;
  show_ops_enabled: boolean;
  show_ops_config: unknown;
  show_ops_display_name: string | null;
};

export type BuiltShowOpsDigest = {
  reportDate: string;
  today: string;
  displayName: string;
  /** office_report_emails from the workspace config — who the 07:00 run goes to. */
  emails: string[];
  digest: { subject: string; text: string; html: string };
};

/**
 * Build one workspace's morning digest (yesterday's bookings, last night, tonight's
 * buses, overdue invoices) as of `now`. Pure read; sending is the caller's job.
 */
export async function buildShowOpsDigestForBusiness(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  b: DigestBusinessRow,
  now = new Date(),
): Promise<BuiltShowOpsDigest> {
  const today = isoDateInTimeZone(now, OFFICE_TZ);
  const reportDate = addDaysIso(today, -1);
  const takenStart = `${reportDate}T00:00:00`;
  const takenEnd = `${today}T00:00:00`;
  const config = parseShowOpsConfig(b.show_ops_config);
  const branding = brandingFromBusiness(b);
  const siteUrl = getDeploymentSiteUrl();

  const [{ data: taken }, { data: lastNight }, { data: tonightOrders }, { data: tonightBookings }, { data: overdueRows }] =
    await Promise.all([
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
      // Unpaid, not voided, past due as of this morning — the chase list.
      admin
        .from("show_invoices")
        .select("id,supplier_name,invoice_number,verifactu_number,total_amount,currency,due_date")
        .eq("business_id", b.id)
        .eq("paid", false)
        .eq("voided", false)
        .lt("due_date", today)
        .order("due_date"),
    ]);

  const busPax = new Map<string, number>();
  for (const row of tonightBookings ?? []) {
    busPax.set(row.island, (busPax.get(row.island) ?? 0) + paxTotal(row.adults, row.children, row.infants));
  }

  const overdueInvoices: DigestOverdueInvoice[] = (overdueRows ?? [])
    .filter((inv) => Boolean(inv.due_date))
    .map((inv) => ({
      id: String(inv.id),
      supplier_name: String(inv.supplier_name || "Supplier"),
      invoice_number: (inv.invoice_number as string | null) || (inv.verifactu_number as string | null) || null,
      total_amount: Number(inv.total_amount) || 0,
      currency: (inv.currency as ShowOpsCurrency | null) ?? null,
      due_date: String(inv.due_date),
      url: `${siteUrl}/dashboard/show-ops/invoices/${inv.id}`,
    }));

  const digest = buildDailyDigest({
    reportDate,
    today,
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
    overdueInvoices,
  });

  return { reportDate, today, displayName: branding.displayName, emails: config.office_report_emails, digest };
}

export async function runShowOpsDailyDigests(now = new Date()): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const admin = createSupabaseServiceRoleClient();

  const { data: businesses, error } = await admin
    .from("businesses")
    .select(DIGEST_BUSINESS_SELECT)
    .eq("show_ops_enabled", true);
  if (error) return { sent: 0, skipped: 0, errors: [error.message] };

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const b of (businesses ?? []) as DigestBusinessRow[]) {
    const emails = parseShowOpsConfig(b.show_ops_config).office_report_emails;
    if (!emails.length) {
      skipped += 1;
      continue;
    }
    try {
      const built = await buildShowOpsDigestForBusiness(admin, b, now);
      const result = await sendShowOpsHtmlEmail({
        to: built.emails,
        subject: built.digest.subject,
        html: built.digest.html,
        text: built.digest.text,
      });
      if (result.ok) sent += 1;
      else errors.push(`${built.displayName}: ${result.message}`);
    } catch (e) {
      errors.push(`${b.show_ops_display_name || b.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { sent, skipped, errors };
}
