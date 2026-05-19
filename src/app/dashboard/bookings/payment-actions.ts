"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { computeTableDepositCentsFromTableRow } from "@/lib/booking-deposit-pricing";
import { createBookingDepositCheckoutSession } from "@/lib/booking-deposit-checkout";
import { parseBookingPublicContext } from "@/lib/booking-public-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function preferredTableFromIntake(extras: unknown): string {
  if (!extras || typeof extras !== "object" || Array.isArray(extras)) return "";
  const o = extras as Record<string, unknown>;
  return typeof o.preferred_table === "string" ? o.preferred_table.trim() : "";
}

async function assertOwnedBusiness(businessId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses")
    .select("id,booking_slug,stripe_connect_account_id,stripe_connect_charges_enabled")
    .eq("id", businessId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!biz) throw new Error("Business not found.");
  return { supabase, biz };
}

/** Merchant sends (or re-sends) a Stripe deposit link for an inbox booking. */
export async function createDepositCheckoutForBookingRequest(params: {
  businessId: string;
  bookingRequestId: string;
  /** Optional override in euro cents; defaults to table guide pricing when available. */
  amountCents?: number;
}): Promise<{ checkoutUrl: string }> {
  const { supabase, biz } = await assertOwnedBusiness(params.businessId);

  const connectId = biz.stripe_connect_account_id?.trim();
  if (!connectId || !biz.stripe_connect_charges_enabled) {
    throw new Error("Connect Stripe and finish onboarding before collecting deposits.");
  }

  const slug = biz.booking_slug?.trim();
  if (!slug) {
    throw new Error("Publish a booking slug first (Dashboard → Bookings → Guest booking link).");
  }

  const { data: req, error: reqErr } = await supabase
    .from("booking_requests")
    .select(
      "id,business_id,customer_name,email,booking_kind,guest_count,intake_extras,payment_status,deposit_amount_cents",
    )
    .eq("id", params.bookingRequestId)
    .eq("business_id", params.businessId)
    .maybeSingle();

  if (reqErr) throw new Error(reqErr.message);
  if (!req) throw new Error("Booking request not found.");

  if (req.payment_status === "paid") {
    throw new Error("This booking is already marked paid.");
  }

  let amountCents = params.amountCents;
  if (amountCents == null || !Number.isFinite(amountCents) || amountCents < 50) {
    const guestCount = typeof req.guest_count === "number" ? req.guest_count : 1;
    const preferredTable = preferredTableFromIntake(req.intake_extras);

    if (req.booking_kind === "table") {
      const { data: ctxRaw } = await supabase.rpc("get_booking_public_context", { p_slug: slug });
      const ctx = parseBookingPublicContext(ctxRaw);
      if (ctx) {
        amountCents = computeTableDepositCentsFromTableRow({
          ctx,
          preferredTableLabel: preferredTable,
          guestCount,
        }) ?? undefined;
      }

      if (amountCents == null) {
        const { data: tables } = await supabase
          .from("floor_plan_tables")
          .select("label,pricing_mode,price_cents,group_pricing")
          .eq("business_id", params.businessId);

        const row = tables?.find((t) => t.label?.trim() === preferredTable) ?? (tables?.length === 1 ? tables[0] : null);
        if (row && row.price_cents > 0) {
          const computed = computeTableDepositCentsFromTableRow({
            pricingMode: String(row.pricing_mode ?? "table"),
            priceCents: row.price_cents,
            groupPricing: row.group_pricing,
            guestCount,
          });
          if (computed != null) amountCents = computed;
        }
      }
    }
  }

  if (amountCents == null || amountCents < 50) {
    throw new Error(
      "Set a deposit amount (minimum €0.50) or configure table pricing under Dashboard → Bookings → Tables.",
    );
  }

  const label =
    req.booking_kind === "table"
      ? preferredTableFromIntake(req.intake_extras) || "Table deposit"
      : `${req.booking_kind ?? "Booking"} deposit`;

  const url = await createBookingDepositCheckoutSession({
    bookingRequestId: req.id,
    businessId: params.businessId,
    connectAccountId: connectId,
    amountCents: Math.round(amountCents),
    guestEmail: req.email,
    description: label,
    slug,
  });

  if (!url) {
    throw new Error("Could not create Stripe Checkout — check STRIPE_SECRET_KEY on this deployment.");
  }

  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard");

  return { checkoutUrl: url };
}
