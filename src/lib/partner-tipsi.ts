import { randomBytes } from "node:crypto";

import { pickUniqueBookingSlug } from "@/lib/booking-slug-server";
import { merchantNotifyPhoneFromDetails } from "@/lib/merchant-notify-phone";
import { getSiteUrl } from "@/lib/site-url";
import { stripeClient } from "@/lib/stripe-client";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type TipsiProvisionInput = {
  tipsiBusinessId: string;
  businessName: string;
  ownerEmail: string;
  ownerName?: string;
  merchantPhone: string;
  tipsiSlug?: string;
  /** Existing Tipsi Stripe Connect account (acct_*) — linked on Solvio without re-onboarding. */
  tipsiStripeAccountId?: string;
};

export type TipsiProvisionResult =
  | {
      ok: true;
      bookingSlug: string;
      bookUrl: string;
      dashboardMagicUrl: string;
      existingAccount: boolean;
    }
  | { ok: false; message: string };

function partnerSecret(): string | null {
  return process.env.SOLVIO_TIPSI_PARTNER_SECRET?.trim() || null;
}

export function isTipsiPartnerConfigured(): boolean {
  return Boolean(partnerSecret());
}

/** Shared secret between Tipsi server and Solvio partner routes. */
export function verifyTipsiPartnerRequest(request: Request): boolean {
  const expected = partnerSecret();
  if (!expected) return false;
  const auth = request.headers.get("authorization")?.trim() ?? "";
  if (auth === `Bearer ${expected}`) return true;
  const header = request.headers.get("x-solvio-tipsi-secret")?.trim();
  return header === expected;
}

function randomPassword(): string {
  return randomBytes(24).toString("base64url") + "Aa1!";
}

function buildMagicConfirmUrl(siteUrl: string, tokenHash: string, nextPath: string): string {
  const next = encodeURIComponent(nextPath);
  return `${siteUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${next}`;
}

async function magicLinkForEmail(email: string, nextPath: string): Promise<string | null> {
  const admin = createSupabaseServiceRoleClient();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || (await getSiteUrl())).replace(/\/$/, "");

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: email.trim().toLowerCase(),
  });

  if (error || !data.properties?.hashed_token) {
    console.error("[partner-tipsi] generateLink:", error?.message ?? "missing token");
    return null;
  }

  return buildMagicConfirmUrl(siteUrl, data.properties.hashed_token, nextPath);
}

function tipsiCapabilities() {
  return {
    appointments: true,
    events: true,
    tables: true,
    ai_receptionist: false,
    lead_generation: false,
    show_ops: false,
  };
}

async function ensureBookingSlug(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  businessId: string,
  businessName: string,
  preferredSlug?: string,
): Promise<string> {
  const { data: row } = await admin.from("businesses").select("booking_slug").eq("id", businessId).maybeSingle();
  if (row?.booking_slug?.trim()) return row.booking_slug.trim();

  let slug = preferredSlug?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (slug) {
    const { data: taken } = await admin.from("businesses").select("id").eq("booking_slug", slug).neq("id", businessId).maybeSingle();
    if (taken?.id) slug = "";
  }
  if (!slug) slug = await pickUniqueBookingSlug(admin, businessName, businessId);

  await admin.from("businesses").update({ booking_slug: slug, updated_at: new Date().toISOString() }).eq("id", businessId);
  return slug;
}

async function syncTipsiStripeConnect(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  businessId: string,
  tipsiStripeAccountId?: string,
): Promise<void> {
  const accountId = tipsiStripeAccountId?.trim();
  if (!accountId || !accountId.startsWith("acct_")) return;

  let chargesEnabled = false;
  let detailsSubmitted = false;

  const stripe = stripeClient();
  if (stripe) {
    try {
      const account = await stripe.accounts.retrieve(accountId);
      chargesEnabled = Boolean(account.charges_enabled);
      detailsSubmitted = Boolean(account.details_submitted);
    } catch (err) {
      console.warn("[partner-tipsi] Could not verify Stripe account from Tipsi:", err);
    }
  }

  const { error } = await admin
    .from("businesses")
    .update({
      stripe_connect_account_id: accountId,
      stripe_connect_charges_enabled: chargesEnabled,
      stripe_connect_details_submitted: detailsSubmitted,
      updated_at: new Date().toISOString(),
    })
    .eq("id", businessId);

  if (error) {
    console.warn("[partner-tipsi] Stripe link update failed:", error.message);
  }
}

async function patchPartnerBusiness(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  businessId: string,
  input: TipsiProvisionInput,
): Promise<void> {
  const phone = input.merchantPhone.trim();
  const flowDetails = {
    merchant_onboarding_profile: { phone },
    partner: {
      source: "tipsi",
      tipsi_business_id: input.tipsiBusinessId,
      ...(input.tipsiStripeAccountId?.trim()
        ? { tipsi_stripe_account_id: input.tipsiStripeAccountId.trim() }
        : {}),
    },
  };
  const now = new Date().toISOString();

  const { data: existing } = await admin
    .from("businesses")
    .select("name, subscription_tier, partner_tipsi_business_id")
    .eq("id", businessId)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    partner_tipsi_business_id: input.tipsiBusinessId,
    platform_capabilities: tipsiCapabilities(),
    booking_flow_details: flowDetails,
    updated_at: now,
  };

  // Only set tier/name on first link — never downgrade an existing Solvio workspace
  if (!existing?.partner_tipsi_business_id) {
    patch.subscription_tier = "booking";
    patch.onboarding_completed_at = now;
    if (!existing?.name?.trim()) {
      patch.name = input.businessName.trim();
    }
  }

  await admin.from("businesses").update(patch).eq("id", businessId);
  await syncTipsiStripeConnect(admin, businessId, input.tipsiStripeAccountId);
}

/** Idempotent: create or refresh Solvio workspace for a Tipsi Pro venue. */
export async function provisionTipsiPartner(input: TipsiProvisionInput): Promise<TipsiProvisionResult> {
  const tipsiId = input.tipsiBusinessId.trim();
  const businessName = input.businessName.trim();
  const email = input.ownerEmail.trim().toLowerCase();
  const phone = input.merchantPhone.trim();

  if (!tipsiId || !businessName || !email.includes("@")) {
    return { ok: false, message: "Missing Tipsi business id, name, or owner email." };
  }
  if (!phone.startsWith("+") || phone.length < 10) {
    return { ok: false, message: "A valid E.164 mobile is required for booking alerts." };
  }

  const admin = createSupabaseServiceRoleClient();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || (await getSiteUrl())).replace(/\/$/, "");

  const { data: linked } = await admin
    .from("businesses")
    .select("id, owner_id, booking_slug")
    .eq("partner_tipsi_business_id", tipsiId)
    .maybeSingle();

  if (linked?.id) {
    await patchPartnerBusiness(admin, linked.id, input);
    const slug = await ensureBookingSlug(admin, linked.id, businessName, input.tipsiSlug);
    const { data: owner } = await admin.from("profiles").select("email").eq("id", linked.owner_id).maybeSingle();
    const ownerEmail = (owner?.email as string | undefined)?.trim().toLowerCase() || email;
    const magic = await magicLinkForEmail(ownerEmail, "/dashboard/setup/bookings");
    if (!magic) return { ok: false, message: "Could not create sign-in link." };
    return {
      ok: true,
      bookingSlug: slug,
      bookUrl: `${siteUrl}/book/${slug}`,
      dashboardMagicUrl: magic,
      existingAccount: true,
    };
  }

  const { data: profileByEmail } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  const existingUserId = profileByEmail?.id ?? null;

  if (existingUserId) {
    const userId = existingUserId;
    const { data: owned } = await admin
      .from("businesses")
      .select("id, partner_tipsi_business_id, booking_slug")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true });

    const solo = owned?.length === 1 && !owned[0].partner_tipsi_business_id ? owned[0] : null;
    let businessId = solo?.id;

    if (!businessId) {
      const { data: inserted, error: insErr } = await admin
        .from("businesses")
        .insert({
          owner_id: userId,
          name: businessName,
          partner_tipsi_business_id: tipsiId,
          subscription_tier: "booking",
          platform_capabilities: tipsiCapabilities(),
          onboarding_completed_at: new Date().toISOString(),
          booking_flow_details: {
            merchant_onboarding_profile: { phone },
            partner: { source: "tipsi", tipsi_business_id: tipsiId },
          },
        })
        .select("id")
        .single();
      if (insErr || !inserted?.id) {
        return { ok: false, message: insErr?.message ?? "Could not create Solvio business." };
      }
      businessId = inserted.id;
    } else {
      await patchPartnerBusiness(admin, businessId, input);
    }

    const slug = await ensureBookingSlug(admin, businessId, businessName, input.tipsiSlug);
    const magic = await magicLinkForEmail(email, "/dashboard/setup/bookings");
    if (!magic) return { ok: false, message: "Could not create sign-in link." };
    return {
      ok: true,
      bookingSlug: slug,
      bookUrl: `${siteUrl}/book/${slug}`,
      dashboardMagicUrl: magic,
      existingAccount: true,
    };
  }

  const password = randomPassword();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      business_name: businessName,
      merchant_phone: phone,
      full_name: input.ownerName?.trim() || "",
      partner_tipsi: tipsiId,
    },
  });

  if (createErr || !created.user?.id) {
    const msg = createErr?.message ?? "Could not create user.";
    if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("registered")) {
      const { data: retryProfile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
      if (retryProfile?.id) {
        return provisionTipsiPartner(input);
      }
    }
    return { ok: false, message: msg };
  }

  await new Promise((r) => setTimeout(r, 400));

  const { data: newBiz } = await admin
    .from("businesses")
    .select("id, booking_slug, booking_flow_details")
    .eq("owner_id", created.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!newBiz?.id) {
    return { ok: false, message: "Account created but business row missing — contact support." };
  }

  await patchPartnerBusiness(admin, newBiz.id, input);
  const slug = await ensureBookingSlug(admin, newBiz.id, businessName, input.tipsiSlug);

  if (!merchantNotifyPhoneFromDetails(newBiz.booking_flow_details)) {
    await admin
      .from("businesses")
      .update({
        booking_flow_details: {
          merchant_onboarding_profile: { phone },
          partner: { source: "tipsi", tipsi_business_id: tipsiId },
        },
      })
      .eq("id", newBiz.id);
  }

  const magic = await magicLinkForEmail(email, "/dashboard/setup/bookings");
  if (!magic) return { ok: false, message: "Account created but sign-in link failed." };

  return {
    ok: true,
    bookingSlug: slug,
    bookUrl: `${siteUrl}/book/${slug}`,
    dashboardMagicUrl: magic,
    existingAccount: false,
  };
}

/** Re-sync Stripe Connect from Tipsi when opening Solvio dashboard (e.g. after Tipsi onboarding). */
export async function syncTipsiStripeForLinkedBusiness(
  tipsiBusinessId: string,
  tipsiStripeAccountId?: string,
): Promise<void> {
  const tipsiId = tipsiBusinessId.trim();
  const accountId = tipsiStripeAccountId?.trim();
  if (!tipsiId || !accountId?.startsWith("acct_")) return;

  const admin = createSupabaseServiceRoleClient();
  const { data: biz } = await admin
    .from("businesses")
    .select("id")
    .eq("partner_tipsi_business_id", tipsiId)
    .maybeSingle();

  if (!biz?.id) return;
  await syncTipsiStripeConnect(admin, biz.id, accountId);
}
