"use server";
import { requireShowOpsRole } from "@/lib/show-ops/access";
import { hasShowOpsModule } from "@/lib/show-ops/config";
import { canSeeShowOpsPage } from "@/lib/show-ops/nav";
import { parseBusPdfRequest } from "@/lib/show-ops/bus-pdf";
import { loadBusListPdf } from "@/lib/show-ops/bus-pdf-data";
import { deliverBusList } from "@/lib/show-ops/bus-delivery";
import { filterShowOpsOutboundTo } from "@/lib/show-ops/outbound";
import { sendShowOpsHtmlEmail } from "@/lib/notifications/show-ops-emails";
import { sendGuestTicketByBookingId } from "@/lib/notifications/show-ops-guest-ticket";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Joel (17 Sept): from the bus board, send the pick-up details to chosen guests by
 * email or SMS. Each guest gets their own ticket with the stop and time that the
 * board shows now, headed "UPDATED pick-up details".
 */
export async function sendPickupDetailsToGuestsAction(
  form: FormData,
): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireShowOpsRole("office");
    if (!canSeeShowOpsPage(ctx.role, ctx.allowedPages, "lists") || !hasShowOpsModule(ctx.config, ctx.tier, "lists")) {
      throw new Error("Night list access is required.");
    }
    const date = String(form.get("date") ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Bad date.");
    const channel = String(form.get("channel") ?? "both");
    const channels = channel === "email" ? { email: true, sms: false } : channel === "sms" ? { email: false, sms: true } : { email: true, sms: true };
    const raw = String(form.get("booking_ids") ?? "[]");
    if (raw.length > 220000) throw new Error("Choose fewer guests at a time.");
    const parsed: unknown = JSON.parse(raw);
    const ids = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string" && UUID_RE.test(id)) : [];
    if (!ids.length) throw new Error("Tick at least one guest.");
    if (ids.length > 300) throw new Error("Send to 300 guests at a time at most.");

    // Only bookings this office can see, on this night, still travelling by bus.
    const { data: rows, error } = await ctx.supabase
      .from("show_bookings")
      .select("id,guest_email,guest_mobile")
      .eq("business_id", ctx.business.id)
      .eq("show_date", date)
      .eq("transport_required", true)
      .is("cancelled_at", null)
      .in("id", ids);
    if (error) throw new Error("Could not load those bookings. Refresh and try again.");

    let sent = 0;
    let noContact = 0;
    let held = 0;
    let failed = 0;
    for (const b of rows ?? []) {
      const hasEmail = channels.email && Boolean(String(b.guest_email ?? "").trim());
      const hasMobile = channels.sms && Boolean(String(b.guest_mobile ?? "").trim());
      if (!hasEmail && !hasMobile) {
        noContact += 1;
        continue;
      }
      const res = await sendGuestTicketByBookingId(String(b.id), { updated: true, channels });
      const results = [res?.email, res?.sms].filter(Boolean) as Array<{ ok: boolean; reason?: string }>;
      if (results.some((r) => r.ok)) sent += 1;
      else if (results.some((r) => r.reason === "held")) held += 1;
      else failed += 1;
    }
    const parts = [`${sent} sent`];
    if (noContact) parts.push(`${noContact} with no ${channel === "email" ? "email" : channel === "sms" ? "mobile" : "email or mobile"}`);
    if (held) parts.push(`${held} held (email test mode)`);
    if (failed) parts.push(`${failed} failed`);
    return { ok: failed === 0, message: `Pick-up details: ${parts.join(", ")}.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Not sent. Please retry." };
  }
}
export async function sendBusListAction(
  form: FormData,
): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireShowOpsRole("office");
    if (
      !canSeeShowOpsPage(ctx.role, ctx.allowedPages, "lists") ||
      !hasShowOpsModule(ctx.config, ctx.tier, "lists")
    )
      throw new Error("Night list access is required.");
    const raw = String(form.get("booking_ids") ?? "[]");
    if (raw.length > 220000)
      throw new Error("Filter this list by island first.");
    const request = parseBusPdfRequest({
      date: String(form.get("date") ?? ""),
      bookingIds: JSON.parse(raw),
    });
    const recipient = String(form.get("recipient") ?? "")
      .trim()
      .toLowerCase();
    await deliverBusList(
      { ...request, recipient },
      {
        allowed: (email) => filterShowOpsOutboundTo(email).length === 1,
        build: () =>
          loadBusListPdf(
            ctx.supabase,
            ctx.business.id,
            ctx.branding.displayName,
            request,
          ),
        send: (attachment) =>
          sendShowOpsHtmlEmail({
            to: recipient,
            subject: `Bus list · ${request.date}`,
            html: "<p>The bus list is attached, including the saved pickup order and guide notes.</p>",
            text: "The bus list is attached, including the saved pickup order and guide notes.",
            attachments: [attachment],
          }),
      },
    );
    return { ok: true, message: "Bus list submitted to the email provider." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Bus list not sent. Please retry.",
    };
  }
}
