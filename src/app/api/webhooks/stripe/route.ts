import { NextResponse } from "next/server";
import Stripe from "stripe";

import { stripeClient } from "@/lib/stripe-client";

export const runtime = "nodejs";

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
    case "checkout.session.completed":
      // Future: persist subscription link to merchant row (stripe_customer_id, etc.)
      break;
    case "customer.subscription.created":
      break;
    case "customer.subscription.deleted":
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true, type: evt.type });
}
