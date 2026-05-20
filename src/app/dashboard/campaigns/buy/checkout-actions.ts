"use server";

import { redirect } from "next/navigation";

import { getSiteUrl } from "@/lib/site-url";
import { stripeClient } from "@/lib/stripe-client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BundleSize = 100 | 300 | 1000 | 5000;

const BUNDLE_PRICE_IDS: Record<BundleSize, string | undefined> = {
  100: process.env.STRIPE_PRICE_BUNDLE_100?.trim(),
  300: process.env.STRIPE_PRICE_BUNDLE_300?.trim(),
  1000: process.env.STRIPE_PRICE_BUNDLE_1000?.trim(),
  5000: process.env.STRIPE_PRICE_BUNDLE_5000?.trim(),
};

export async function startBundleCheckoutAction(calls: BundleSize) {
  const stripe = stripeClient();
  const priceId = BUNDLE_PRICE_IDS[calls];
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || (await getSiteUrl())).replace(/\/$/, "");
  if (!stripe || !priceId || !biz) {
    redirect(`${siteUrl}/dashboard/campaigns/buy?checkout=needs_setup`);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email ?? undefined,
    line_items: [{ price: priceId, quantity: 1 }],
    payment_intent_data: {
      metadata: {
        solvio_bundle_calls: String(calls),
        solvio_business_id: biz.id,
        solvio_kind: "outbound_call_bundle",
      },
    },
    metadata: {
      solvio_bundle_calls: String(calls),
      solvio_business_id: biz.id,
      solvio_kind: "outbound_call_bundle",
    },
    success_url: `${siteUrl}/dashboard/campaigns?bundle=success&calls=${calls}`,
    cancel_url: `${siteUrl}/dashboard/campaigns/buy?checkout=cancel`,
    allow_promotion_codes: true,
  });

  if (!session.url) redirect(`${siteUrl}/dashboard/campaigns/buy?checkout=error`);
  redirect(session.url);
}

export async function buy100Action() {
  await startBundleCheckoutAction(100);
}
export async function buy300Action() {
  await startBundleCheckoutAction(300);
}
export async function buy1000Action() {
  await startBundleCheckoutAction(1000);
}
export async function buy5000Action() {
  await startBundleCheckoutAction(5000);
}
