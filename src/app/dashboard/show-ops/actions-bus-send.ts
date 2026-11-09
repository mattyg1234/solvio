"use server";
import { requireShowOpsRole } from "@/lib/show-ops/access";
import { hasShowOpsModule } from "@/lib/show-ops/config";
import { canSeeShowOpsPage } from "@/lib/show-ops/nav";
import { parseBusPdfRequest } from "@/lib/show-ops/bus-pdf";
import { loadBusListPdf } from "@/lib/show-ops/bus-pdf-data";
import { deliverBusList } from "@/lib/show-ops/bus-delivery";
import { filterShowOpsOutboundTo, SHOW_OPS_OUTBOUND_HELD } from "@/lib/show-ops/outbound";
import { sendShowOpsHtmlEmail } from "@/lib/notifications/show-ops-emails";
import { sendGuestTicketByBookingId } from "@/lib/notifications/show-ops-guest-ticket";
import { formatShowOpsDate } from "@/lib/show-ops/calc";

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
/**
 * Joel (27 Oct): once the night's transport is finalised, every bus guest gets the
 * day-of confirmation ("See you tonight", WhatsApp template 3) with their stop and
 * time — not only guests whose pick-up changed. Phone only: the email ticket
 * already carries the pick-up. Guests already confirmed are skipped unless
 * `resend` is ticked, so pressing it again after a late booking only reaches the
 * new guests.
 */
export async function confirmTonightsTransportAction(
  form: FormData,
): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireShowOpsRole("office");
    if (!canSeeShowOpsPage(ctx.role, ctx.allowedPages, "lists") || !hasShowOpsModule(ctx.config, ctx.tier, "lists")) {
      throw new Error("Night list access is required.");
    }
    const date = String(form.get("date") ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Bad date.");
    const resend = String(form.get("resend") ?? "") === "1";
    const raw = String(form.get("booking_ids") ?? "[]");
    if (raw.length > 220000) throw new Error("Filter this list by island first.");
    const parsed: unknown = JSON.parse(raw);
    const ids = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string" && UUID_RE.test(id)) : [];
    if (!ids.length) throw new Error("There are no bus guests on this list.");
    if (ids.length > 400) throw new Error("Filter this list by island first.");

    const { data: rows, error } = await ctx.supabase
      .from("show_bookings")
      .select("id,guest_mobile,transport_confirmed_at")
      .eq("business_id", ctx.business.id)
      .eq("show_date", date)
      .eq("transport_required", true)
      .is("cancelled_at", null)
      .in("id", ids);
    if (error) {
      if (/transport_confirmed_at/.test(error.message)) throw new Error("The database needs one small update first (transport_confirmed_at). Ask Matty to run it.");
      throw new Error("Could not load those bookings. Refresh and try again.");
    }

    let sent = 0;
    let already = 0;
    let noMobile = 0;
    let held = 0;
    let failed = 0;
    const failures: string[] = [];
    for (const b of rows ?? []) {
      if (b.transport_confirmed_at && !resend) {
        already += 1;
        continue;
      }
      if (!String(b.guest_mobile ?? "").trim()) {
        noMobile += 1;
        continue;
      }
      const res = await sendGuestTicketByBookingId(String(b.id), { updated: true, channels: { email: false, sms: true } });
      const r = res?.sms;
      if (r?.ok) {
        sent += 1;
        await ctx.supabase
          .from("show_bookings")
          .update({ transport_confirmed_at: new Date().toISOString() })
          .eq("business_id", ctx.business.id)
          .eq("id", String(b.id));
      } else if (r && !r.ok && r.message === SHOW_OPS_OUTBOUND_HELD) {
        held += 1;
      } else {
        failed += 1;
        if (r && !r.ok && failures.length < 2) failures.push(r.message);
      }
    }
    const parts = [`${sent} sent`];
    if (already) parts.push(`${already} already had it`);
    if (noMobile) parts.push(`${noMobile} with no mobile`);
    if (held) parts.push(`${held} held (test mode)`);
    if (failed) parts.push(`${failed} failed${failures.length ? ` (${failures.join("; ")})` : ""}`);
    return { ok: failed === 0, message: `Tonight's transport confirmation: ${parts.join(", ")}.` };
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
            subject: `Bus list · ${formatShowOpsDate(request.date)}`,
            html: "<p>The bus list is attached, including the saved pickup order and guide notes.</p>",
            text: "The bus list is attached, including the saved pickup order and guide notes.",
            attachments: [attachment],
            log: { businessId: ctx.business.id, kind: "bus_list" },
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
