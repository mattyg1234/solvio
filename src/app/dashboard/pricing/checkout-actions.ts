"use server";

import { redirect } from "next/navigation";

import { stripeClient } from "@/lib/stripe-client";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StripePlanTier = "starter" | "growth" | "scale";

const PRICE_IDS: Record<StripePlanTier, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER?.trim(),
  growth: process.env.STRIPE_PRICE_GROWTH?.trim(),
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
  const successUrl = `${siteUrl}/dashboard/pricing?checkout=success`;
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

export async function checkoutStarterAction() {
  await startStripeCheckout("starter");
}

export async function checkoutGrowthAction() {
  await startStripeCheckout("growth");
}

export async function checkoutScaleAction() {
  await startStripeCheckout("scale");
}
