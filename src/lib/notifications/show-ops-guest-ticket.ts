import { bookingExtrasSummary } from "@/lib/show-ops/invoice-supplements";
import { Resend } from "resend";

import type { NotificationSendResult } from "@/lib/notifications/booking-emails";
import { sendBookingSms } from "@/lib/notifications/booking-sms";
import { isTwilioWhatsAppConfigured, sendBookingWhatsApp } from "@/lib/notifications/booking-whatsapp";
import { formatShowOpsMoney, formatShowOpsPax, showOpsDayName } from "@/lib/show-ops/calc";
import { filterShowOpsOutboundTo, showOpsOutboundHeldResult, showOpsOutboundLive } from "@/lib/show-ops/outbound";
import { parsePrivatePickupLabel, pickupKindFromBooking, privateTransferLine } from "@/lib/show-ops/private-pickup";
import type { ShowOpsCurrency } from "@/lib/show-ops/types";

export type GuestTicketInput = {
  merchantName: string;
  bookingRef: string;
  guestName: string;
  guestEmail?: string | null;
  guestMobile?: string | null;
  showName: string;
  extrasSummary?: string;
  showDate: string;
  adults: number;
  children: number;
  infants: number;
  hotelName?: string | null;
  transportRequired: boolean;
  pickupStopName?: string | null;
  pickupTime?: string | null;
  billingMode: string;
  totalCost?: number | null;
  depositAmount?: number | null;
  balanceRemaining?: number | null;
  currency: ShowOpsCurrency;
  dietaryNotes?: string | null;
  /** Public ticket page — QR at the door. */
  ticketUrl?: string | null;
  /** AM / PM show when stored. */
  showTime?: string | null;
  /** Re-send after a pick-up time/stop change — leads with what changed. */
  updated?: boolean;
  /** bus / private / own_way. Older rows without it are read from the pick-up label. */
  pickupKind?: string | null;
  /** Resort zone code (PDC, CT…) for a private transfer. */
  privateZone?: string | null;
};

/** Private transfer? From the kind when stored, else from the "Private PDC · Villa" label. */
function isPrivateTransfer(input: GuestTicketInput): boolean {
  return (
    pickupKindFromBooking({
      pickup_kind: input.pickupKind,
      transport_required: input.transportRequired,
      pickup_stop_name: input.pickupStopName,
    }) === "private"
  );
}

function privateLine(input: GuestTicketInput): string {
  const zone = input.privateZone || parsePrivatePickupLabel(input.pickupStopName)?.zone || null;
  return privateTransferLine(zone);
}

function resendClient(): Resend | null {
  const apiKey =
    process.env.SOLVIO_RESEND_API_KEY?.trim() || process.env.RESEND_API_KEY?.trim() || process.env.RESEND_API_TOKEN?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function fromAddr(): string {
  return (
    process.env.SOLVIO_MAIL_FROM?.trim() ||
    process.env.RESEND_MAIL_FROM?.trim() ||
    "Solvio Bookings <hello@solviosystems.com>"
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function dateLine(input: GuestTicketInput): string {
  const day = showOpsDayName(input.showDate);
  return day ? `${day} ${input.showDate}` : input.showDate;
}

function pickupLine(input: GuestTicketInput): string {
  if (!input.transportRequired && isPrivateTransfer(input)) return `${privateLine(input)}.`;
  if (!input.transportRequired) return "Making your own way to the venue.";
  const time = input.pickupTime ? String(input.pickupTime).slice(0, 5) : null;
  if (input.pickupStopName && time) return `Bus pick-up: ${input.pickupStopName} at ${time}.`;
  if (input.pickupStopName) return `Bus pick-up: ${input.pickupStopName} — time to be confirmed.`;
  return "Bus pick-up details to be confirmed.";
}

function moneyLine(input: GuestTicketInput): string | null {
  if (input.billingMode !== "deposit" || input.totalCost == null) return null;
  const money = (n: number) => formatShowOpsMoney(n, input.currency);
  const balance = Number(input.balanceRemaining ?? 0);
  if (balance > 0) return `Total ${money(Number(input.totalCost))} · balance to pay ${money(balance)}.`;
  return `Total ${money(Number(input.totalCost))} · paid in full.`;
}

function showTimeLine(input: GuestTicketInput): string | null {
  const raw = (input.showTime || "").trim().toUpperCase();
  if (raw === "AM") return "Morning show";
  if (raw === "PM") return "Evening show";
  return input.showTime?.trim() || null;
}

/** Compact plain-text ticket — shared by SMS and the email text part. */
export function buildGuestTicketText(input: GuestTicketInput): string {
  const showTime = showTimeLine(input);
  const lines = [
    input.updated
      ? `${input.merchantName} — UPDATED pick-up details, booking ${input.bookingRef}`
      : `${input.merchantName} — booking ${input.bookingRef}`,
    `${input.showName} · ${dateLine(input)}${showTime ? ` · ${showTime}` : ""}`,
    `Guests: ${formatShowOpsPax(input.adults, input.children, input.infants)}`,
  ];
  if (input.extrasSummary) lines.push(`Extras: ${input.extrasSummary}`);
  if (input.hotelName) lines.push(`Hotel: ${input.hotelName}`);
  lines.push(pickupLine(input));
  const money = moneyLine(input);
  if (money) lines.push(money);
  if (input.ticketUrl) lines.push(`Your ticket (QR): ${input.ticketUrl}`);
  else lines.push(`Show this message on arrival. Ref ${input.bookingRef}.`);
  return lines.join("\n");
}

export async function sendGuestTicketEmail(input: GuestTicketInput): Promise<NotificationSendResult> {
  const client = resendClient();
  const to = filterShowOpsOutboundTo(input.guestEmail?.trim() ?? "")[0] ?? "";
  if (!to) return showOpsOutboundHeldResult();
  if (!client) return { ok: false, reason: "not_configured", message: "Email is not configured." };
  if (!to.includes("@")) return { ok: false, reason: "invalid_recipient", message: "Guest email is missing." };

  const rows: Array<[string, string]> = [
    ["Show", input.showName],
    ["Date", dateLine(input)],
  ];
  const showTime = showTimeLine(input);
  if (showTime) rows.push(["Show time", showTime]);
  rows.push(["Guests", formatShowOpsPax(input.adults, input.children, input.infants)]);
  if (input.extrasSummary) rows.push(["Extras", input.extrasSummary]);
  if (input.hotelName) rows.push(["Hotel", input.hotelName]);
  rows.push([
    "Transport",
    input.transportRequired
      ? `${input.pickupStopName ?? "Pick-up to be confirmed"}${input.pickupTime ? ` · ${String(input.pickupTime).slice(0, 5)}` : ""}`
      : isPrivateTransfer(input)
        ? privateLine(input)
        : "Own way",
  ]);
  const money = moneyLine(input);
  if (money) rows.push(["Payment", money]);
  if (input.dietaryNotes) rows.push(["Dietary", input.dietaryNotes]);
  const qrSrc = input.ticketUrl ? `${input.ticketUrl.replace(/\/$/, "")}/qr` : "";

  const { data, error } = await client.emails.send({
    from: fromAddr(),
    to,
    subject: input.updated
      ? `Updated pick-up · ${input.showName} · ${input.bookingRef}`
      : `Your ticket · ${input.showName} · ${input.bookingRef}`,
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
        <p style="font-size:16px">Hi ${escapeHtml(input.guestName.split(" ")[0] || input.guestName)},</p>
        <p style="font-size:15px;line-height:1.5">${
          input.updated
            ? `Your pick-up details for <strong>${escapeHtml(input.merchantName)}</strong> have changed — here is your updated ticket:`
            : `You're booked with <strong>${escapeHtml(input.merchantName)}</strong>. Here's your ticket:`
        }</p>
        <p style="font-size:20px;font-weight:700;margin:14px 0 4px">${escapeHtml(input.showName)}</p>
        <p style="font-size:15px;margin:0 0 14px;color:#334155">${escapeHtml(dateLine(input))} · ref <strong>${escapeHtml(input.bookingRef)}</strong></p>
        ${
          qrSrc
            ? `<p style="text-align:center;margin:18px 0"><img src="${escapeHtml(qrSrc)}" width="200" height="200" alt="Ticket QR" style="width:200px;height:200px" /></p>`
            : ""
        }
        ${
          input.ticketUrl
            ? `<p style="text-align:center;margin:0 0 18px"><a href="${escapeHtml(input.ticketUrl)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">View your ticket</a></p>`
            : ""
        }
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          ${rows
            .map(
              ([k, v]) => `
            <tr>
              <td style="padding:7px 10px 7px 0;color:#64748b;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td>
              <td style="padding:7px 0;font-weight:600">${escapeHtml(v)}</td>
            </tr>`,
            )
            .join("")}
        </table>
        <p style="color:#64748b;font-size:13px;margin-top:24px">Show the QR at the door${input.transportRequired ? " and on the bus" : ""}. See you there!</p>
      </div>
    `,
    text: buildGuestTicketText(input),
  });
  if (error) {
    console.error("[guest-ticket-email] Resend error:", error.message);
    return { ok: false, reason: "provider_error", message: error.message };
  }
  return { ok: true, id: data?.id };
}

/**
 * Phone delivery: WhatsApp first (about a third the cost of SMS and far better read
 * rates in Spain/UK), falling back to SMS when WhatsApp is not configured or fails.
 */
export async function sendGuestTicketSms(input: GuestTicketInput): Promise<NotificationSendResult> {
  if (!showOpsOutboundLive()) return showOpsOutboundHeldResult();
  const phone = input.guestMobile?.trim() ?? "";
  if (!phone) return { ok: false, reason: "invalid_recipient", message: "Guest mobile is missing." };
  const body = buildGuestTicketText(input);

  if (isTwilioWhatsAppConfigured()) {
    const wa = await sendBookingWhatsApp({ phoneE164: phone, body });
    if (wa.ok) return wa;
    console.warn("[guest-ticket] WhatsApp failed, falling back to SMS:", wa.message);
  }
  return sendBookingSms({ phoneE164: phone, body });
}

/** Send the ticket to whichever contact details exist. Never throws. */
export async function sendGuestTicket(
  input: GuestTicketInput,
): Promise<{ email: NotificationSendResult | null; sms: NotificationSendResult | null }> {
  const out: { email: NotificationSendResult | null; sms: NotificationSendResult | null } = { email: null, sms: null };
  try {
    if (input.guestEmail?.trim()) out.email = await sendGuestTicketEmail(input);
  } catch (e) {
    console.error("[guest-ticket] email failed:", e);
    out.email = { ok: false, reason: "provider_error", message: "Email send failed." };
  }
  try {
    if (input.guestMobile?.trim()) out.sms = await sendGuestTicketSms(input);
  } catch (e) {
    console.error("[guest-ticket] sms failed:", e);
    out.sms = { ok: false, reason: "provider_error", message: "SMS send failed." };
  }
  return out;
}

/** Stripe webhook / background: load booking + send ticket with QR link. Never throws. */
export async function sendGuestTicketByBookingId(bookingId: string): Promise<void> {
  const { createSupabaseServiceRoleClient } = await import("@/lib/supabase/server");
  const { brandingFromBusiness, parseShowOpsConfig } = await import("@/lib/show-ops/config");
  const { showOpsTicketUrl } = await import("@/lib/show-ops/ticket-token");
  const { getDeploymentSiteUrl } = await import("@/lib/deployment-site-url");

  const admin = createSupabaseServiceRoleClient();
  const { data: booking } = await admin
    .from("show_bookings")
    .select(
      "business_id,booking_ref,guest_name,guest_email,guest_mobile,extras_snapshot,show_name,show_date,ampm,adults,children,infants,hotel_name,transport_required,pickup_kind,private_zone,pickup_stop_name,pickup_time,billing_mode,total_cost,deposit_amount,balance_remaining,dietary_notes,cancelled_at,ticket_token",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking || booking.cancelled_at) return;
  if (!booking.guest_email && !booking.guest_mobile) return;

  const { data: biz } = await admin
    .from("businesses")
    .select("name,show_ops_display_name,show_ops_logo_url,logo_url,show_ops_config")
    .eq("id", booking.business_id)
    .maybeSingle();
  const branding = brandingFromBusiness(biz ?? {});
  const currency = parseShowOpsConfig(biz?.show_ops_config).currency;
  const token = booking.ticket_token ? String(booking.ticket_token) : "";
  await sendGuestTicket({
    merchantName: branding.displayName,
    bookingRef: booking.booking_ref,
    guestName: booking.guest_name,
    guestEmail: booking.guest_email,
    guestMobile: booking.guest_mobile,
    showName: booking.show_name,
    extrasSummary: bookingExtrasSummary(booking.extras_snapshot),
    showDate: booking.show_date,
    adults: Number(booking.adults) || 0,
    children: Number(booking.children) || 0,
    infants: Number(booking.infants) || 0,
    hotelName: booking.hotel_name,
    transportRequired: Boolean(booking.transport_required),
    pickupStopName: booking.pickup_stop_name,
    pickupTime: booking.pickup_time,
    billingMode: String(booking.billing_mode ?? "deposit"),
    totalCost: booking.total_cost == null ? null : Number(booking.total_cost),
    depositAmount: booking.deposit_amount == null ? null : Number(booking.deposit_amount),
    balanceRemaining: booking.balance_remaining == null ? null : Number(booking.balance_remaining),
    currency,
    dietaryNotes: booking.dietary_notes,
    ticketUrl: token ? showOpsTicketUrl(getDeploymentSiteUrl(), token) : null,
    showTime: booking.ampm,
    pickupKind: booking.pickup_kind,
    privateZone: booking.private_zone,
  });
}
