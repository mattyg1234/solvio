"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";

import { stripeClient } from "@/lib/stripe-client";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ConnectActionResult<T = void> = T extends void
  ? { ok: true } | { ok: false; message: string }
  : { ok: true; data: T } | { ok: false; message: string };

function isMissingStripeResource(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as Stripe.StripeRawError).code === "resource_missing"
  );
}

function connectErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = String((err as { message?: string }).message ?? "").trim();
    if (message) return message;
  }
  return fallback;
}

async function clearConnectLink(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  businessId: string,
) {
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
}

async function createExpressConnectAccount(
  stripe: Stripe,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  businessId: string,
): Promise<string> {
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

  const { error } = await supabase
    .from("businesses")
    .update({
      stripe_connect_account_id: account.id,
      stripe_connect_charges_enabled: false,
      stripe_connect_details_submitted: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", businessId);

  if (error) throw new Error(error.message);
  return account.id;
}

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

export async function startStripeConnectOnboardingAction(
  businessId: string,
): Promise<ConnectActionResult<{ url: string }>> {
  const stripe = stripeClient();
  if (!stripe) {
    return { ok: false, message: "Stripe is not configured on this deployment (STRIPE_SECRET_KEY)." };
  }

  const { supabase, biz } = await assertOwnedBusiness(businessId);
  const siteUrl = (await getSiteUrl()).replace(/\/$/, "");

  let accountId = biz.stripe_connect_account_id?.trim() || "";

  if (accountId) {
    try {
      await stripe.accounts.retrieve(accountId);
    } catch (err) {
      if (!isMissingStripeResource(err)) {
        return {
          ok: false,
          message: connectErrorMessage(err, "Could not load your Stripe Connect account."),
        };
      }
      await clearConnectLink(supabase, businessId);
      accountId = "";
    }
  }

  if (!accountId) {
    try {
      accountId = await createExpressConnectAccount(stripe, supabase, businessId);
    } catch (err) {
      return {
        ok: false,
        message: connectErrorMessage(err, "Could not create a Stripe Connect account."),
      };
    }
  }

  try {
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${siteUrl}/dashboard/payments?connect=refresh&business=${businessId}`,
      return_url: `${siteUrl}/dashboard/payments?connect=return&business=${businessId}`,
      type: "account_onboarding",
    });

    if (!link.url) {
      return { ok: false, message: "Stripe did not return an onboarding URL." };
    }

    revalidatePath("/dashboard/payments");
    revalidatePath("/dashboard");

    return { ok: true, data: { url: link.url } };
  } catch (err) {
    if (isMissingStripeResource(err)) {
      await clearConnectLink(supabase, businessId);
      return {
        ok: false,
        message:
          "Your previous Stripe link was from an old platform account. Click Connect Stripe again to start fresh.",
      };
    }
    return {
      ok: false,
      message: connectErrorMessage(err, "Could not open Stripe onboarding."),
    };
  }
}

export async function refreshStripeConnectStatusAction(
  businessId: string,
): Promise<
  ConnectActionResult<{
    chargesEnabled: boolean;
    detailsSubmitted: boolean;
  }>
> {
  const stripe = stripeClient();
  if (!stripe) {
    return {
      ok: true,
      data: { chargesEnabled: false, detailsSubmitted: false },
    };
  }

  const { supabase, biz } = await assertOwnedBusiness(businessId);
  const accountId = biz.stripe_connect_account_id?.trim();
  if (!accountId) {
    return {
      ok: true,
      data: { chargesEnabled: false, detailsSubmitted: false },
    };
  }

  let account: Stripe.Account;
  try {
    account = await stripe.accounts.retrieve(accountId);
  } catch (err) {
    if (isMissingStripeResource(err)) {
      await clearConnectLink(supabase, businessId);
      revalidatePath("/dashboard/payments");
      revalidatePath("/dashboard");
      return {
        ok: false,
        message:
          "That Stripe account is no longer on this platform — we cleared the old link. Click Connect Stripe to set up again.",
      };
    }
    return {
      ok: false,
      message: connectErrorMessage(err, "Could not refresh Stripe Connect status."),
    };
  }

  const { error } = await supabase
    .from("businesses")
    .update({
      stripe_connect_charges_enabled: Boolean(account.charges_enabled),
      stripe_connect_details_submitted: Boolean(account.details_submitted),
      updated_at: new Date().toISOString(),
    })
    .eq("id", businessId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/payments");
  revalidatePath("/dashboard");

  return {
    ok: true,
    data: {
      chargesEnabled: Boolean(account.charges_enabled),
      detailsSubmitted: Boolean(account.details_submitted),
    },
  };
}

/** Clears Solvio's link to Stripe — the Connect account stays in Stripe until deleted there. */
export async function disconnectStripeConnectAction(
  businessId: string,
): Promise<ConnectActionResult> {
  const { supabase, biz } = await assertOwnedBusiness(businessId);
  if (!biz.stripe_connect_account_id?.trim()) {
    return { ok: false, message: "This venue is not connected to Stripe." };
  }

  try {
    await clearConnectLink(supabase, businessId);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not disconnect Stripe.",
    };
  }

  revalidatePath("/dashboard/payments");
  revalidatePath("/dashboard");
  return { ok: true };
}
