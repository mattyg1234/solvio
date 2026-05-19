import { NextResponse } from "next/server";
import Stripe from "stripe";

import { stripeClient } from "@/lib/stripe-client";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function markBookingPaid(session: Stripe.Checkout.Session) {
  const bookingId = session.metadata?.solvio_booking_request_id?.trim();
  if (!bookingId) return;

  try {
    const admin = createSupabaseServiceRoleClient();
    await admin
      .from("booking_requests")
      .update({ payment_status: "paid" })
      .eq("id", bookingId);
  } catch (e) {
    console.error("[stripe webhook] booking paid update failed", e);
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
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!stripe || !secret) {
    return NextResponse.json({ ok: false, error: "Stripe webhook not configured" }, { status: 501 });
  }

  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ ok: false, error: "Missing signature" }, { status: 400 });
  }

  let evt: Stripe.Event;
  try {
    evt = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 400 });
  }

  switch (evt.type) {
    case "checkout.session.completed": {
      const session = evt.data.object as Stripe.Checkout.Session;
      if (session.metadata?.solvio_booking_request_id) {
        await markBookingPaid(session);
      }
      break;
    }
    case "account.updated": {
      await syncConnectAccount(evt.data.object as Stripe.Account);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.deleted":
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true, type: evt.type });
}
