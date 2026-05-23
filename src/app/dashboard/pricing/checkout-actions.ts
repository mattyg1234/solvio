"use server";

import { redirect } from "next/navigation";

import { stripeClient } from "@/lib/stripe-client";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StripePlanTier = "booking" | "pro" | "business" | "scale";

const PRICE_IDS: Record<StripePlanTier, string | undefined> = {
  booking: process.env.STRIPE_PRICE_BOOKING?.trim(),
  // Prefer new env names; fall back to legacy names if not set yet.
  pro: (process.env.STRIPE_PRICE_PRO ?? process.env.STRIPE_PRICE_STARTER)?.trim(),
  business: (process.env.STRIPE_PRICE_BUSINESS ?? process.env.STRIPE_PRICE_GROWTH)?.trim(),
  scale: process.env.STRIPE_PRICE_SCALE?.trim(),
};

export async function startStripeCheckout(plan: StripePlanTier) {
  const stripe = stripeClient();
  const priceId = PRICE_IDS[plan];
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || (await getSiteUrl())).replace(/\/$/, "");
  const successUrl = `${siteUrl}/dashboard/pricing?checkout=success&tier=${plan}`;
  const cancelUrl = `${siteUrl}/dashboard/pricing?checkout=cancel`;

  if (!stripe || !priceId) {
    redirect(`${siteUrl}/dashboard/pricing?checkout=needs_stripe`);
  }

  let customerEmail = user?.email ?? undefined;
  if (!customerEmail) {
    const envEmail = process.env.STRIPE_CHECKOUT_DEFAULT_EMAIL?.trim();
    customerEmail = envEmail || undefined;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: customerEmail,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      solvio_plan_tier: plan,
      ...(user?.id ? { solvio_auth_user_id: user.id } : {}),
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
  });

  if (!session.url) {
    redirect(`${siteUrl}/dashboard/pricing?checkout=error`);
  }

  redirect(session.url);
}

export async function checkoutBookingAction() {
  await startStripeCheckout("booking");
}

export async function checkoutProAction() {
  await startStripeCheckout("pro");
}

export async function checkoutBusinessAction() {
  await startStripeCheckout("business");
}

export async function checkoutScaleAction() {
  await startStripeCheckout("scale");
}
