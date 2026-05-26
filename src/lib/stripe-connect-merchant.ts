import type Stripe from "stripe";

import { stripeClient } from "@/lib/stripe-client";

export const STRIPE_MERCHANT_ANALYTICS_DAYS = 30;

export type StripeMerchantPaymentRow = {
  id: string;
  amountCents: number;
  platformFeeCents: number;
  netCents: number;
  status: string;
  createdAt: string;
  description: string | null;
  guestEmail: string | null;
};

export type StripeMerchantPayoutRow = {
  id: string;
  amountCents: number;
  status: string;
  arrivalDate: string;
  createdAt: string;
};

export type StripeMerchantDailyVolume = {
  date: string;
  grossCents: number;
  chargeCount: number;
};

export type StripeMerchantDashboardSnapshot = {
  businessId: string;
  businessName: string;
  connectAccountId: string;
  currency: string;
  availableCents: number;
  pendingCents: number;
  periodDays: number;
  periodGrossCents: number;
  periodPlatformFeeCents: number;
  periodNetCents: number;
  periodChargeCount: number;
  periodRefundCents: number;
  dailyVolume: StripeMerchantDailyVolume[];
  recentPayments: StripeMerchantPaymentRow[];
  recentPayouts: StripeMerchantPayoutRow[];
  expressDashboardUrl: string | null;
  fetchedAt: string;
};

export type StripeMerchantDashboardResult =
  | { ok: true; data: StripeMerchantDashboardSnapshot }
  | { ok: false; message: string };

function primaryCurrency(balance: Stripe.Balance): string {
  const fromAvailable = balance.available.find((row) => row.amount > 0)?.currency;
  if (fromAvailable) return fromAvailable.toUpperCase();
  const fromPending = balance.pending.find((row) => row.amount > 0)?.currency;
  if (fromPending) return fromPending.toUpperCase();
  return (balance.available[0]?.currency ?? balance.pending[0]?.currency ?? "eur").toUpperCase();
}

function sumBalanceForCurrency(rows: Stripe.Balance["available"], currency: string): number {
  const code = currency.toLowerCase();
  return rows.filter((row) => row.currency === code).reduce((sum, row) => sum + row.amount, 0);
}

function utcDayKey(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function chargeNetCents(charge: Stripe.Charge): number {
  if (charge.balance_transaction && typeof charge.balance_transaction !== "string") {
    return charge.balance_transaction.net ?? 0;
  }
  const amount = charge.amount ?? 0;
  const platformFee = charge.application_fee_amount ?? 0;
  return Math.max(0, amount - platformFee);
}

export function formatMerchantMoney(cents: number, currency: string, locale = "en-GB"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export async function fetchStripeMerchantDashboard(args: {
  businessId: string;
  businessName: string;
  connectAccountId: string;
  periodDays?: number;
}): Promise<StripeMerchantDashboardResult> {
  const stripe = stripeClient();
  if (!stripe) {
    return { ok: false, message: "Stripe is not configured on this deployment." };
  }

  const connectAccountId = args.connectAccountId.trim();
  if (!connectAccountId) {
    return { ok: false, message: "Stripe Connect is not linked for this venue yet." };
  }

  const periodDays = args.periodDays ?? STRIPE_MERCHANT_ANALYTICS_DAYS;
  const periodStartUnix = Math.floor(Date.now() / 1000) - periodDays * 24 * 60 * 60;

  try {
    const [balance, chargesPage, payoutsPage, loginLink] = await Promise.all([
      stripe.balance.retrieve({}, { stripeAccount: connectAccountId }),
      stripe.charges.list(
        {
          limit: 100,
          created: { gte: periodStartUnix },
          expand: ["data.balance_transaction"],
        },
        { stripeAccount: connectAccountId },
      ),
      stripe.payouts.list({ limit: 8 }, { stripeAccount: connectAccountId }),
      stripe.accounts.createLoginLink(connectAccountId).catch(() => null),
    ]);

    const currency = primaryCurrency(balance);
    const availableCents = sumBalanceForCurrency(balance.available, currency);
    const pendingCents = sumBalanceForCurrency(balance.pending, currency);

    const succeededCharges = chargesPage.data.filter((charge) => charge.status === "succeeded");
    const refundedCharges = chargesPage.data.filter((charge) => (charge.amount_refunded ?? 0) > 0);

    let periodGrossCents = 0;
    let periodPlatformFeeCents = 0;
    let periodNetCents = 0;
    const dailyMap = new Map<string, StripeMerchantDailyVolume>();

    for (const charge of succeededCharges) {
      const gross = charge.amount ?? 0;
      const platformFee = charge.application_fee_amount ?? 0;
      const net = chargeNetCents(charge);
      periodGrossCents += gross;
      periodPlatformFeeCents += platformFee;
      periodNetCents += net;

      const day = utcDayKey(charge.created);
      const existing = dailyMap.get(day) ?? { date: day, grossCents: 0, chargeCount: 0 };
      existing.grossCents += gross;
      existing.chargeCount += 1;
      dailyMap.set(day, existing);
    }

    const periodRefundCents = refundedCharges.reduce((sum, charge) => sum + (charge.amount_refunded ?? 0), 0);

    const dailyVolume = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    const recentPayments: StripeMerchantPaymentRow[] = chargesPage.data.slice(0, 12).map((charge) => ({
      id: charge.id,
      amountCents: charge.amount ?? 0,
      platformFeeCents: charge.application_fee_amount ?? 0,
      netCents: chargeNetCents(charge),
      status: charge.status ?? "unknown",
      createdAt: new Date(charge.created * 1000).toISOString(),
      description: charge.description ?? charge.metadata?.solvio_booking_slug ?? null,
      guestEmail: charge.billing_details?.email ?? charge.receipt_email ?? null,
    }));

    const recentPayouts: StripeMerchantPayoutRow[] = payoutsPage.data.map((payout) => ({
      id: payout.id,
      amountCents: payout.amount ?? 0,
      status: payout.status ?? "unknown",
      arrivalDate: new Date(payout.arrival_date * 1000).toISOString(),
      createdAt: new Date(payout.created * 1000).toISOString(),
    }));

    return {
      ok: true,
      data: {
        businessId: args.businessId,
        businessName: args.businessName,
        connectAccountId,
        currency,
        availableCents,
        pendingCents,
        periodDays,
        periodGrossCents,
        periodPlatformFeeCents,
        periodNetCents,
        periodChargeCount: succeededCharges.length,
        periodRefundCents,
        dailyVolume,
        recentPayments,
        recentPayouts,
        expressDashboardUrl: loginLink?.url ?? null,
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    const message =
      typeof err === "object" && err !== null && "message" in err
        ? String((err as { message?: string }).message)
        : "Could not load Stripe balance data.";
    return { ok: false, message };
  }
}
