"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { stripeClient } from "@/lib/stripe-client";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function assertOwnedBusiness(businessId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses")
    .select("id,stripe_connect_account_id")
    .eq("id", businessId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!biz) throw new Error("Business not found.");
  return { supabase, biz };
}

export async function startStripeConnectOnboardingAction(businessId: string): Promise<{ url: string }> {
  const stripe = stripeClient();
  if (!stripe) {
    throw new Error("Stripe is not configured on this deployment (STRIPE_SECRET_KEY).");
  }

  const { supabase, biz } = await assertOwnedBusiness(businessId);
  const siteUrl = (await getSiteUrl()).replace(/\/$/, "");

  let accountId = biz.stripe_connect_account_id?.trim() || "";

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: {
        solvio_business_id: businessId,
      },
    });
    accountId = account.id;

    const { error } = await supabase
      .from("businesses")
      .update({
        stripe_connect_account_id: accountId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", businessId);

    if (error) throw new Error(error.message);
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${siteUrl}/dashboard/payments?connect=refresh&business=${businessId}`,
    return_url: `${siteUrl}/dashboard/payments?connect=return&business=${businessId}`,
    type: "account_onboarding",
  });

  if (!link.url) throw new Error("Stripe did not return an onboarding URL.");

  revalidatePath("/dashboard/payments");
  revalidatePath("/dashboard");

  return { url: link.url };
}

export async function refreshStripeConnectStatusAction(businessId: string): Promise<{
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
}> {
  const stripe = stripeClient();
  if (!stripe) {
    return { chargesEnabled: false, detailsSubmitted: false };
  }

  const { supabase, biz } = await assertOwnedBusiness(businessId);
  const accountId = biz.stripe_connect_account_id?.trim();
  if (!accountId) {
    return { chargesEnabled: false, detailsSubmitted: false };
  }

  const account = await stripe.accounts.retrieve(accountId);

  const { error } = await supabase
    .from("businesses")
    .update({
      stripe_connect_charges_enabled: Boolean(account.charges_enabled),
      stripe_connect_details_submitted: Boolean(account.details_submitted),
      updated_at: new Date().toISOString(),
    })
    .eq("id", businessId);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/payments");
  revalidatePath("/dashboard");

  return {
    chargesEnabled: Boolean(account.charges_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
  };
}

/** Clears Solvio's link to Stripe — the Connect account stays in Stripe until deleted there. */
export async function disconnectStripeConnectAction(businessId: string): Promise<void> {
  const { supabase, biz } = await assertOwnedBusiness(businessId);
  if (!biz.stripe_connect_account_id?.trim()) {
    throw new Error("This venue is not connected to Stripe.");
  }

  const { error } = await supabase
    .from("businesses")
    .update({
      stripe_connect_account_id: null,
      stripe_connect_charges_enabled: false,
      stripe_connect_details_submitted: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", businessId);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/payments");
  revalidatePath("/dashboard");
}
