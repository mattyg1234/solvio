import {
  buildDepositSmsBody,
  createBookingFromPhoneCall,
  type CallBookingDetails,
} from "@/lib/booking-from-phone-call";
import { computeTableDepositCentsFromTableRow } from "@/lib/booking-deposit-pricing";
import { formatMoney } from "@/lib/checkout-money";
import { createBookingDepositCheckoutSession } from "@/lib/booking-deposit-checkout";
import { parseBookingPublicContext } from "@/lib/booking-public-context";
import { sendBookingSms } from "@/lib/notifications/booking-sms";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

function preferredTableFromIntake(extras: unknown): string {
  if (!extras || typeof extras !== "object" || Array.isArray(extras)) return "";
  const o = extras as Record<string, unknown>;
  return typeof o.preferred_table === "string" ? o.preferred_table.trim() : "";
}

function formatDepositLabel(cents: number): string {
  return formatMoney(cents);
}

export type SendGuestDepositPaymentLinkResult =
  | {
      ok: true;
      amountCents: number;
      amountLabel: string;
      smsSent: boolean;
      alreadyPaid: boolean;
      checkoutUrl: string;
    }
  | { ok: false; message: string };

type BusinessStripeRow = {
  id: string;
  name: string;
  booking_slug: string | null;
  stripe_connect_account_id: string | null;
  stripe_connect_charges_enabled: boolean | null;
};

type BookingRequestRow = {
  id: string;
  business_id: string;
  customer_name: string;
  email: string;
  phone: string | null;
  booking_kind: string | null;
  guest_count: number | null;
  intake_extras: unknown;
  payment_status: string | null;
  deposit_amount_cents: number | null;
};

async function resolveDepositAmountCents(params: {
  admin: ReturnType<typeof createSupabaseServiceRoleClient>;
  business: BusinessStripeRow;
  req: BookingRequestRow;
  amountCents?: number;
}): Promise<number | null> {
  let amountCents = params.amountCents;
  if (amountCents != null && Number.isFinite(amountCents) && amountCents >= 50) {
    return Math.round(amountCents);
  }

  const slug = params.business.booking_slug?.trim();
  if (!slug) return null;

  const guestCount = typeof params.req.guest_count === "number" ? params.req.guest_count : 1;
  const preferredTable = preferredTableFromIntake(params.req.intake_extras);

  if (params.req.booking_kind === "table") {
    const { data: ctxRaw } = await params.admin.rpc("get_booking_public_context", { p_slug: slug });
    const ctx = parseBookingPublicContext(ctxRaw);
    if (ctx) {
      amountCents =
        computeTableDepositCentsFromTableRow({
          ctx,
          preferredTableLabel: preferredTable,
          guestCount,
        }) ?? undefined;
    }

    if (amountCents == null) {
      const { data: tables } = await params.admin
        .from("floor_plan_tables")
        .select("label,pricing_mode,price_cents,group_pricing")
        .eq("business_id", params.business.id);

      const row =
        tables?.find((t) => t.label?.trim() === preferredTable) ?? (tables?.length === 1 ? tables[0] : null);
      if (row && row.price_cents > 0) {
        amountCents =
          computeTableDepositCentsFromTableRow({
            pricingMode: String(row.pricing_mode ?? "table"),
            priceCents: row.price_cents,
            groupPricing: row.group_pricing,
            guestCount,
          }) ?? undefined;
      }
    }
  }

  if (typeof params.req.deposit_amount_cents === "number" && params.req.deposit_amount_cents >= 50 && amountCents == null) {
    amountCents = params.req.deposit_amount_cents;
  }

  if (amountCents == null || amountCents < 50) return null;
  return Math.round(amountCents);
}

async function loadBookingRequestForPayment(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  businessId: string,
  bookingRequestId?: string,
  venueCalendarBookingId?: string,
): Promise<{
  req: BookingRequestRow | null;
  venueBookingId: string | null;
  linkedBookingRequestId: string | null;
}> {
  if (bookingRequestId?.trim()) {
    const { data } = await admin
      .from("booking_requests")
      .select(
        "id,business_id,customer_name,email,phone,booking_kind,guest_count,intake_extras,payment_status,deposit_amount_cents",
      )
      .eq("id", bookingRequestId.trim())
      .eq("business_id", businessId)
      .maybeSingle();
    return {
      req: (data as BookingRequestRow | null) ?? null,
      venueBookingId: venueCalendarBookingId?.trim() || null,
      linkedBookingRequestId: bookingRequestId.trim(),
    };
  }

  if (venueCalendarBookingId?.trim()) {
    const { data: vc } = await admin
      .from("venue_calendar_bookings")
      .select("id,business_id,booking_request_id,guest_name,guest_email,guest_phone,guest_count,booking_kind,title")
      .eq("id", venueCalendarBookingId.trim())
      .eq("business_id", businessId)
      .maybeSingle();

    if (!vc) return { req: null, venueBookingId: null, linkedBookingRequestId: null };

    if (vc.booking_request_id) {
      const { data: req } = await admin
        .from("booking_requests")
        .select(
          "id,business_id,customer_name,email,phone,booking_kind,guest_count,intake_extras,payment_status,deposit_amount_cents",
        )
        .eq("id", vc.booking_request_id)
        .eq("business_id", businessId)
        .maybeSingle();
      return {
        req: (req as BookingRequestRow | null) ?? null,
        venueBookingId: vc.id,
        linkedBookingRequestId: vc.booking_request_id,
      };
    }

    const syntheticReq: BookingRequestRow = {
      id: vc.id,
      business_id: vc.business_id,
      customer_name: vc.guest_name,
      email: vc.guest_email,
      phone: vc.guest_phone,
      booking_kind: vc.booking_kind,
      guest_count: vc.guest_count,
      intake_extras: null,
      payment_status: "none",
      deposit_amount_cents: null,
    };
    return { req: syntheticReq, venueBookingId: vc.id, linkedBookingRequestId: null };
  }

  return { req: null, venueBookingId: null, linkedBookingRequestId: null };
}

/**
 * Create a Stripe Checkout link on the merchant's Connect account and text it to the guest.
 * Used by dashboard deposit links and live AI outbound calls (per-business isolation).
 */
export async function sendGuestDepositPaymentLink(params: {
  businessId: string;
  guestPhoneE164: string;
  bookingRequestId?: string;
  venueCalendarBookingId?: string;
  amountCents?: number;
  vapiCallId?: string;
  /** When no booking is linked yet, create one from details collected on the call. */
  callBookingDetails?: CallBookingDetails;
}): Promise<SendGuestDepositPaymentLinkResult> {
  const businessId = params.businessId.trim();
  const guestPhone = params.guestPhoneE164.trim();
  if (!businessId) return { ok: false, message: "Missing business." };
  if (!guestPhone.startsWith("+")) return { ok: false, message: "Guest phone must be E.164 (+447…)." };

  const admin = createSupabaseServiceRoleClient();
  const { data: businessRaw } = await admin
    .from("businesses")
    .select("id,name,booking_slug,stripe_connect_account_id,stripe_connect_charges_enabled")
    .eq("id", businessId)
    .maybeSingle();

  const business = businessRaw as BusinessStripeRow | null;
  if (!business) return { ok: false, message: "Business not found." };

  const connectId = business.stripe_connect_account_id?.trim();
  if (!connectId || !business.stripe_connect_charges_enabled) {
    return {
      ok: false,
      message: `${business.name} hasn't finished Stripe Connect yet — deposits can't be collected on calls.`,
    };
  }

  const slug = business.booking_slug?.trim();
  if (!slug) {
    return { ok: false, message: "Publish a guest booking link first (Dashboard → Bookings)." };
  }

  let bookingRequestId = params.bookingRequestId?.trim() || "";
  let venueCalendarBookingId = params.venueCalendarBookingId?.trim() || "";

  if (!bookingRequestId && !venueCalendarBookingId && params.callBookingDetails) {
    const created = await createBookingFromPhoneCall({
      businessId,
      businessName: business.name,
      guestPhoneE164: guestPhone,
      details: params.callBookingDetails,
      vapiCallId: params.vapiCallId,
    });
    if (!created.ok) return { ok: false, message: created.message };
    bookingRequestId = created.bookingRequestId;
    venueCalendarBookingId = created.venueCalendarBookingId;
  }

  const { req, venueBookingId, linkedBookingRequestId } = await loadBookingRequestForPayment(
    admin,
    businessId,
    bookingRequestId || undefined,
    venueCalendarBookingId || undefined,
  );

  if (!req) {
    return {
      ok: false,
      message:
        "Collect their name, date, time, and party size on the call first, then use the deposit tool again.",
    };
  }

  if (req.payment_status === "paid") {
    return {
      ok: true,
      amountCents: req.deposit_amount_cents ?? 0,
      amountLabel: req.deposit_amount_cents ? formatDepositLabel(req.deposit_amount_cents) : "paid",
      smsSent: false,
      alreadyPaid: true,
      checkoutUrl: "",
    };
  }

  const amountCents = await resolveDepositAmountCents({
    admin,
    business,
    req,
    amountCents: params.amountCents,
  });

  if (amountCents == null) {
    return {
      ok: false,
      message:
        "Set table pricing under Bookings → Tables, or tell the AI an exact deposit amount when placing the call.",
    };
  }

  const label =
    req.booking_kind === "table"
      ? preferredTableFromIntake(req.intake_extras) || `${business.name} deposit`
      : `${business.name} · booking deposit`;

  const checkoutUrl = await createBookingDepositCheckoutSession({
    bookingRequestId: linkedBookingRequestId ?? undefined,
    venueCalendarBookingId: venueBookingId ?? undefined,
    businessId,
    connectAccountId: connectId,
    amountCents,
    guestEmail: req.email,
    description: label,
    slug,
  });

  if (!checkoutUrl) {
    return { ok: false, message: "Could not create Stripe Checkout for this business." };
  }

  const smsBody = buildDepositSmsBody({
    businessName: business.name,
    guestName: req.customer_name,
    amountCents,
    checkoutUrl,
    callDetails: params.callBookingDetails,
  });

  const smsSent = (await sendBookingSms({ phoneE164: guestPhone, body: smsBody })).ok;

  const logBody = `Deposit link (${formatDepositLabel(amountCents)})${smsSent ? " sent by SMS" : " created — SMS not configured on deployment"}.`;

  if (linkedBookingRequestId) {
    await admin.from("booking_messages").insert({
      booking_request_id: linkedBookingRequestId,
      business_id: businessId,
      direction: "outbound",
      channel: "sms",
      body: logBody,
      metadata: {
        delivery: "vapi_deposit_tool",
        checkout_url: checkoutUrl,
        amount_cents: amountCents,
        ...(params.vapiCallId ? { vapi_call_id: params.vapiCallId } : {}),
      },
    });
  }

  if (venueBookingId) {
    await admin.from("venue_calendar_booking_messages").insert({
      venue_calendar_booking_id: venueBookingId,
      business_id: businessId,
      direction: "outbound",
      channel: "sms",
      body: logBody,
      vapi_call_id: params.vapiCallId ?? null,
      metadata: {
        delivery: "vapi_deposit_tool",
        checkout_url: checkoutUrl,
        amount_cents: amountCents,
      },
    });
  }

  return {
    ok: true,
    amountCents,
    amountLabel: formatDepositLabel(amountCents),
    smsSent,
    alreadyPaid: false,
    checkoutUrl,
  };
}

export function buildDepositSmsPreview(businessName: string, amountCents: number, checkoutUrl: string): string {
  return `${businessName} — secure deposit ${formatDepositLabel(amountCents)}. Pay here to confirm your booking: ${checkoutUrl}`;
}
