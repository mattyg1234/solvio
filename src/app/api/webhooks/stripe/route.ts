import { NextResponse } from "next/server";
import Stripe from "stripe";

import {
  BOOKING_DEMO_AI_MINUTES,
  BOOKING_PLATFORM_FEE_BPS,
  ENTERPRISE_AI_MINUTES,
  ENTERPRISE_PLATFORM_FEE_BPS,
  PRO_AI_MINUTES,
  PRO_PLATFORM_FEE_BPS,
} from "@/lib/solvio-pricing";
import { stripeClient } from "@/lib/stripe-client";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Best-effort parse "7:30pm" / "19:30" / "8 PM" → {hours, minutes}.
 * Returns null if unparseable.
 */
function parsePreferredTime(text: string | null | undefined): { h: number; m: number } | null {
  if (!text?.trim()) return null;
  const m = text.trim().match(/(\d{1,2})\s*[:.\s]?\s*(\d{0,2})\s*(am|pm)?/i);
  if (!m) return null;
  const ampm = m[3]?.toLowerCase();
  let h = parseInt(m[1] ?? "0", 10);
  const mins = m[2] ? parseInt(m[2], 10) : 0;
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (!(Number.isFinite(h) && h >= 0 && h < 24 && Number.isFinite(mins) && mins >= 0 && mins < 60)) {
    return null;
  }
  return { h, m: mins };
}

async function markBookingPaid(session: Stripe.Checkout.Session) {
  const bookingId = session.metadata?.solvio_booking_request_id?.trim();
  const venueBookingId = session.metadata?.solvio_venue_calendar_booking_id?.trim();
  if (!bookingId && !venueBookingId) return;

  try {
    const admin = createSupabaseServiceRoleClient();

    if (venueBookingId) {
      const { data: vc } = await admin
        .from("venue_calendar_bookings")
        .select("id,internal_notes,status")
        .eq("id", venueBookingId)
        .maybeSingle();
      if (vc) {
        const note = "Deposit paid via Stripe — booking confirmed.";
        const prev = vc.internal_notes?.trim();
        await admin
          .from("venue_calendar_bookings")
          .update({
            status: "confirmed",
            internal_notes: prev ? `${prev}\n${note}` : note,
          })
          .eq("id", venueBookingId);
      }
    }

    if (!bookingId) return;

    // 1) Mark request as paid
    await admin
      .from("booking_requests")
      .update({ payment_status: "paid" })
      .eq("id", bookingId);

    // 2) Auto-confirm into the diary if we can resolve a real start time
    //    and there's no existing confirmed entry for this request yet.
    const { data: existing } = await admin
      .from("venue_calendar_bookings")
      .select("id")
      .eq("booking_request_id", bookingId)
      .neq("status", "cancelled")
      .limit(1);
    if (existing && existing.length > 0) return;

    const { data: req } = await admin
      .from("booking_requests")
      .select(
        "id,business_id,customer_name,email,phone,booking_kind,event_title,guest_count,requested_date,preferred_time,intake_extras",
      )
      .eq("id", bookingId)
      .maybeSingle();
    if (!req?.business_id || !req.requested_date) return;

    const time = parsePreferredTime(req.preferred_time) ?? { h: 19, m: 0 };
    const startsLocal = new Date(`${req.requested_date}T${String(time.h).padStart(2, "0")}:${String(time.m).padStart(2, "0")}:00`);
    if (Number.isNaN(startsLocal.getTime())) return;
    const endsLocal = new Date(startsLocal.getTime() + 60 * 60 * 1000);

    // Skip if this start would overlap another confirmed slot
    const { count: overlapCount } = await admin
      .from("venue_calendar_bookings")
      .select("*", { count: "exact", head: true })
      .eq("business_id", req.business_id)
      .neq("status", "cancelled")
      .lt("starts_at", endsLocal.toISOString())
      .gt("ends_at", startsLocal.toISOString());
    if (typeof overlapCount === "number" && overlapCount > 0) return;

    const title =
      req.event_title?.trim() ||
      `${req.customer_name?.trim() || "Guest"} · ${req.booking_kind?.trim() || "booking"}`;

    await admin.from("venue_calendar_bookings").insert({
      business_id: req.business_id,
      booking_request_id: req.id,
      title: title.slice(0, 480),
      booking_kind: req.booking_kind,
      starts_at: startsLocal.toISOString(),
      ends_at: endsLocal.toISOString(),
      guest_name: req.customer_name ?? "Guest",
      guest_email: req.email ?? "",
      guest_phone: req.phone ?? null,
      guest_count: typeof req.guest_count === "number" ? req.guest_count : null,
      status: "confirmed",
      internal_notes: "Auto-confirmed from Stripe payment.",
    });
  } catch (e) {
    console.error("[stripe webhook] booking paid update failed", e);
  }
}

/** Credit an outbound call bundle after one-time Stripe payment. */
async function creditOutboundBundle(session: Stripe.Checkout.Session) {
  const meta = session.metadata ?? {};
  if (meta.solvio_kind !== "outbound_call_bundle") return;
  const businessId = meta.solvio_business_id?.trim();
  const callsRaw = meta.solvio_bundle_calls?.trim();
  const calls = callsRaw ? parseInt(callsRaw, 10) : 0;
  if (!businessId || !Number.isFinite(calls) || calls <= 0) return;

  try {
    const admin = createSupabaseServiceRoleClient();
    // Ensure credits row exists
    await admin
      .from("voice_outbound_credits")
      .upsert({ business_id: businessId }, { onConflict: "business_id", ignoreDuplicates: true });

    const { data: row } = await admin
      .from("voice_outbound_credits")
      .select("bundle_calls_remaining, bundle_calls_purchased_total")
      .eq("business_id", businessId)
      .maybeSingle();
    const prevRemaining = typeof row?.bundle_calls_remaining === "number" ? row.bundle_calls_remaining : 0;
    const prevTotal = typeof row?.bundle_calls_purchased_total === "number" ? row.bundle_calls_purchased_total : 0;

    await admin
      .from("voice_outbound_credits")
      .update({
        bundle_calls_remaining: prevRemaining + calls,
        bundle_calls_purchased_total: prevTotal + calls,
        updated_at: new Date().toISOString(),
      })
      .eq("business_id", businessId);
  } catch (e) {
    console.error("[stripe webhook] bundle credit failed", e);
  }
}

const TIER_SETTINGS = {
  booking: {
    platform_fee_bps: BOOKING_PLATFORM_FEE_BPS,
    monthly_ai_minutes_included: BOOKING_DEMO_AI_MINUTES,
    included_locations: 1,
  },
  pro: {
    platform_fee_bps: PRO_PLATFORM_FEE_BPS,
    monthly_ai_minutes_included: PRO_AI_MINUTES,
    included_locations: 2,
  },
  business: {
    platform_fee_bps: PRO_PLATFORM_FEE_BPS,
    monthly_ai_minutes_included: PRO_AI_MINUTES,
    included_locations: 3,
  },
  scale: {
    platform_fee_bps: ENTERPRISE_PLATFORM_FEE_BPS,
    monthly_ai_minutes_included: ENTERPRISE_AI_MINUTES,
    included_locations: 999,
  },
} as const;
type PaidTier = keyof typeof TIER_SETTINGS;

function isPaidTier(t: string | undefined): t is PaidTier {
  return !!t && t in TIER_SETTINGS;
}

/** Activate a merchant's paid subscription tier after successful Stripe checkout. */
async function activateSubscriptionTier(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.solvio_auth_user_id?.trim();
  const tier = session.metadata?.solvio_plan_tier?.trim();
  if (!userId || !isPaidTier(tier)) return;

  const settings = TIER_SETTINGS[tier];
  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : (session.customer as Stripe.Customer | null)?.id ?? null;

  try {
    const admin = createSupabaseServiceRoleClient();
    await admin
      .from("businesses")
      .update({
        subscription_tier: tier,
        platform_fee_bps: settings.platform_fee_bps,
        monthly_ai_minutes_included: settings.monthly_ai_minutes_included,
        included_locations: settings.included_locations,
        ...(stripeCustomerId ? { stripe_customer_id: stripeCustomerId } : {}),
      })
      .eq("owner_id", userId);
  } catch (e) {
    console.error("[stripe webhook] subscription tier activation failed", e);
  }
}

/** Downgrade a merchant to trial when their Stripe subscription is cancelled. */
async function cancelSubscription(subscription: Stripe.Subscription) {
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : (subscription.customer as Stripe.Customer | null)?.id;
  if (!stripeCustomerId) return;

  try {
    const admin = createSupabaseServiceRoleClient();
    await admin
      .from("businesses")
      .update({
        subscription_tier: "trial",
        platform_fee_bps: 1000,
        monthly_ai_minutes_included: 50,
        included_locations: 1,
      })
      .eq("stripe_customer_id", stripeCustomerId);
  } catch (e) {
    console.error("[stripe webhook] subscription cancellation failed", e);
  }
}

async function syncConnectAccount(account: Stripe.Account) {
  const businessId = account.metadata?.solvio_business_id?.trim();
  if (!businessId) return;

  try {
    const admin = createSupabaseServiceRoleClient();
    await admin
      .from("businesses")
      .update({
        stripe_connect_account_id: account.id,
        stripe_connect_charges_enabled: Boolean(account.charges_enabled),
        stripe_connect_details_submitted: Boolean(account.details_submitted),
      })
      .eq("id", businessId);
  } catch (e) {
    console.error("[stripe webhook] connect account sync failed", e);
  }
}

export async function POST(req: Request) {
  const stripe = stripeClient();
  const primarySecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const connectSecret = process.env.STRIPE_WEBHOOK_SECRET_CONNECT?.trim();
  const webhookSecrets = [primarySecret, connectSecret].filter(
    (s): s is string => Boolean(s),
  );

  if (!stripe || webhookSecrets.length === 0) {
    return NextResponse.json({ ok: false, error: "Stripe webhook not configured" }, { status: 501 });
  }

  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ ok: false, error: "Missing signature" }, { status: 400 });
  }

  let evt: Stripe.Event | null = null;
  let lastErr: unknown = null;
  for (const secret of webhookSecrets) {
    try {
      evt = stripe.webhooks.constructEvent(raw, sig, secret);
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!evt) {
    console.error("[stripe webhook] signature verification failed", lastErr);
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 400 });
  }

  switch (evt.type) {
    case "checkout.session.completed": {
      const session = evt.data.object as Stripe.Checkout.Session;
      if (session.metadata?.solvio_booking_request_id) {
        await markBookingPaid(session);
      }
      if (session.metadata?.solvio_kind === "outbound_call_bundle") {
        await creditOutboundBundle(session);
      }
      if (session.mode === "subscription" && isPaidTier(session.metadata?.solvio_plan_tier)) {
        await activateSubscriptionTier(session);
      }
      break;
    }
    case "account.updated": {
      await syncConnectAccount(evt.data.object as Stripe.Account);
      break;
    }
    case "customer.subscription.deleted": {
      await cancelSubscription(evt.data.object as Stripe.Subscription);
      break;
    }
    case "customer.subscription.created":
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true, type: evt.type });
}
