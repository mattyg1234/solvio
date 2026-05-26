"use server";

import { redirect } from "next/navigation";

import { bookingStripeTrialDays } from "@/lib/solvio-pricing";
import { stripeClient } from "@/lib/stripe-client";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StripePlanTier = "booking" | "pro" | "business" | "scale";

const PRICE_IDS: Record<StripePlanTier, string | undefined> = {
  booking: process.env.STRIPE_PRICE_BOOKING?.trim(),
  pro: (process.env.STRIPE_PRICE_PRO ?? process.env.STRIPE_PRICE_STARTER)?.trim(),
  business: (process.env.STRIPE_PRICE_BUSINESS ?? process.env.STRIPE_PRICE_GROWTH)?.trim(),
  scale: process.env.STRIPE_PRICE_SCALE?.trim(),
};

function checkoutErrorRedirect(siteUrl: string, code: string) {
  redirect(`${siteUrl}/dashboard/pricing?checkout=${encodeURIComponent(code)}`);
}

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

  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/dashboard/pricing")}`);
  }

  if (!stripe || !priceId) {
    checkoutErrorRedirect(siteUrl, "needs_stripe");
  }

  let customerEmail = user.email ?? undefined;
  if (!customerEmail) {
    const envEmail = process.env.STRIPE_CHECKOUT_DEFAULT_EMAIL?.trim();
    customerEmail = envEmail || undefined;
  }

  const sessionMetadata = {
    solvio_plan_tier: plan,
    solvio_auth_user_id: user.id,
  };

  let bookingTrialDays: number | undefined;
  if (plan === "booking") {
    const { data: biz } = await supabase
      .from("businesses")
      .select("subscription_tier, created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const tier = (biz as { subscription_tier?: string } | null)?.subscription_tier;
    const createdAt = (biz as { created_at?: string } | null)?.created_at;
    if (tier === "trial" && createdAt) {
      bookingTrialDays = bookingStripeTrialDays(createdAt);
    }
  }

  let checkoutUrl: string | null = null;
  try {
    const session = await stripe!.checkout.sessions.create({
      mode: "subscription",
      customer_email: customerEmail,
      line_items: [{ price: priceId!, quantity: 1 }],
      metadata: sessionMetadata,
      ...(plan === "booking" && bookingTrialDays
        ? {
            subscription_data: {
              trial_period_days: bookingTrialDays,
              metadata: sessionMetadata,
            },
          }
        : {}),
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
    });

    checkoutUrl = session.url;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[stripe checkout]", plan, message);
    if (/no such price/i.test(message)) {
      checkoutErrorRedirect(siteUrl, "price_mismatch");
    } else {
      checkoutErrorRedirect(siteUrl, "stripe_error");
    }
  }

  if (!checkoutUrl) {
    checkoutErrorRedirect(siteUrl, "error");
  }

  redirect(checkoutUrl!);
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
