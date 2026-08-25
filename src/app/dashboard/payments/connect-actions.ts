"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";

import { stripeClient } from "@/lib/stripe-client";
import { getSiteUrl } from "@/lib/site-url";
import { snapshotFromStripeAccount, describeStripeConnectDisplay } from "@/lib/stripe-connect-status";
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

function formatConnectPlatformError(message: string): string {
  if (/signed up for Connect/i.test(message)) {
    return (
      "Solvio's Stripe platform account needs Connect turned on before venues can link. " +
      "In Stripe (mattygale2023@gmail.com): open Connect → Get started → choose Express accounts for merchants. " +
      "Then return here and click Connect Stripe again."
    );
  }
  return message;
}

function connectErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = String((err as { message?: string }).message ?? "").trim();
    if (message) return formatConnectPlatformError(message);
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
      stripe_connect_payouts_enabled: false,
      stripe_connect_disabled_reason: null,
      stripe_connect_requirements_due: [],
      updated_at: new Date().toISOString(),
    })
    .eq("id", businessId);

  if (error) throw new Error(error.message);
}

async function persistConnectSnapshot(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  businessId: string,
  snap: ReturnType<typeof snapshotFromStripeAccount>,
  accountId?: string,
) {
  const { error } = await supabase
    .from("businesses")
    .update({
      ...(accountId ? { stripe_connect_account_id: accountId } : {}),
      stripe_connect_charges_enabled: snap.chargesEnabled,
      stripe_connect_details_submitted: snap.detailsSubmitted,
      stripe_connect_payouts_enabled: snap.payoutsEnabled,
      stripe_connect_disabled_reason: snap.disabledReason,
      stripe_connect_requirements_due: snap.requirementsDue,
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
      stripe_connect_payouts_enabled: false,
      stripe_connect_disabled_reason: null,
      stripe_connect_requirements_due: [],
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
      refresh_url: `${siteUrl}/dashboard/payments?connect=refresh&business=${businessId}&tab=connection`,
      return_url: `${siteUrl}/dashboard/payments?connect=return&business=${businessId}&tab=connection`,
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
    payoutsEnabled: boolean;
    disabledReason: string | null;
    requirementsDue: string[];
    displayStatus: string;
  }>
> {
  const stripe = stripeClient();
  if (!stripe) {
    return {
      ok: true,
      data: {
        chargesEnabled: false,
        detailsSubmitted: false,
        payoutsEnabled: false,
        disabledReason: null,
        requirementsDue: [],
        displayStatus: "not_connected",
      },
    };
  }

  const { supabase, biz } = await assertOwnedBusiness(businessId);
  const accountId = biz.stripe_connect_account_id?.trim();
  if (!accountId) {
    return {
      ok: true,
      data: {
        chargesEnabled: false,
        detailsSubmitted: false,
        payoutsEnabled: false,
        disabledReason: null,
        requirementsDue: [],
        displayStatus: "not_connected",
      },
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
      revalidatePath("/dashboard/settings");
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

  const snapshot = snapshotFromStripeAccount(account);
  await persistConnectSnapshot(supabase, businessId, snapshot, account.id);

  const display = describeStripeConnectDisplay(account.id, snapshot);

  revalidatePath("/dashboard/payments");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");

  return {
    ok: true,
    data: {
      chargesEnabled: snapshot.chargesEnabled,
      detailsSubmitted: snapshot.detailsSubmitted,
      payoutsEnabled: snapshot.payoutsEnabled,
      disabledReason: snapshot.disabledReason,
      requirementsDue: snapshot.requirementsDue,
      displayStatus: display.status,
    },
  };
}

/** Disconnect then start a fresh Connect onboarding link (same or new Express account). */
export async function reconnectStripeConnectAction(
  businessId: string,
): Promise<ConnectActionResult<{ url: string }>> {
  const { supabase } = await assertOwnedBusiness(businessId);
  await clearConnectLink(supabase, businessId);
  return startStripeConnectOnboardingAction(businessId);
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
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
