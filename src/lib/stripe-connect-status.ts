import type Stripe from "stripe";

export type StripeConnectDisplayStatus = "not_connected" | "ready" | "onboarding" | "restricted";

export type StripeConnectHealthRow = {
  stripe_connect_account_id: string | null;
  stripe_connect_charges_enabled: boolean | null;
  stripe_connect_details_submitted: boolean | null;
  stripe_connect_payouts_enabled?: boolean | null;
  stripe_connect_disabled_reason?: string | null;
  stripe_connect_requirements_due?: unknown;
};

export type StripeConnectHealthSnapshot = {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  disabledReason: string | null;
  requirementsDue: string[];
  pastDue: string[];
};

export type StripeConnectDisplay = {
  status: StripeConnectDisplayStatus;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  requirementsDue: string[];
};

const DISABLED_REASON_COPY: Record<string, string> = {
  "requirements.past_due": "Stripe blocked payments because required information is overdue.",
  "requirements.pending_verification": "Stripe is reviewing your account — payments may be paused until approval.",
  rejected: "Stripe rejected this account — contact Stripe support or reconnect with a new account.",
  "rejected.fraud": "Stripe restricted this account for fraud review.",
  "rejected.listed": "Stripe restricted this account.",
  "rejected.terms_of_service": "Stripe restricted this account due to terms-of-service issues.",
  "rejected.other": "Stripe restricted this account.",
  listed: "Stripe restricted this account.",
  platform_paused: "Payments are paused on this Connect account.",
  under_review: "Stripe is reviewing this account — guest payments may not work yet.",
};

function requirementList(req: Stripe.Account.Requirements | undefined): {
  currentlyDue: string[];
  pastDue: string[];
} {
  const currentlyDue = [...(req?.currently_due ?? []), ...(req?.eventually_due ?? [])].filter(Boolean);
  const pastDue = [...(req?.past_due ?? [])].filter(Boolean);
  return {
    currentlyDue: [...new Set(currentlyDue)],
    pastDue: [...new Set(pastDue)],
  };
}

export function snapshotFromStripeAccount(account: Stripe.Account): StripeConnectHealthSnapshot {
  const { currentlyDue, pastDue } = requirementList(account.requirements);
  const allDue = [...new Set([...currentlyDue, ...pastDue])];

  return {
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    disabledReason: account.requirements?.disabled_reason ?? null,
    requirementsDue: allDue,
    pastDue,
  };
}

export function snapshotFromBusinessRow(row: StripeConnectHealthRow): StripeConnectHealthSnapshot {
  const dueRaw = row.stripe_connect_requirements_due;
  const requirementsDue = Array.isArray(dueRaw)
    ? dueRaw.filter((x): x is string => typeof x === "string")
    : [];

  return {
    chargesEnabled: Boolean(row.stripe_connect_charges_enabled),
    payoutsEnabled: Boolean(row.stripe_connect_payouts_enabled),
    detailsSubmitted: Boolean(row.stripe_connect_details_submitted),
    disabledReason: row.stripe_connect_disabled_reason?.trim() || null,
    requirementsDue,
    pastDue: requirementsDue,
  };
}

function humanizeRequirement(field: string): string {
  return field
    .replace(/\./g, " → ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function describeStripeConnectDisplay(
  accountId: string | null | undefined,
  snap: StripeConnectHealthSnapshot,
): StripeConnectDisplay {
  const linked = Boolean(accountId?.trim());
  const requirementsDue = snap.requirementsDue.map(humanizeRequirement);

  if (!linked) {
    return {
      status: "not_connected",
      title: "Not connected",
      message: "Connect Stripe to accept guest deposits on your booking page.",
      severity: "info",
      requirementsDue: [],
    };
  }

  if (snap.chargesEnabled) {
    return {
      status: "ready",
      title: "Ready to collect payments",
      message: snap.payoutsEnabled
        ? "Guest payments settle to your Stripe balance."
        : "Charges are enabled; confirm payout settings in Stripe if needed.",
      severity: "info",
      requirementsDue: [],
    };
  }

  const reason = snap.disabledReason;
  const restricted =
    Boolean(reason) ||
    snap.pastDue.length > 0 ||
    (snap.detailsSubmitted && !snap.chargesEnabled);

  if (restricted) {
    const reasonMessage =
      (reason && DISABLED_REASON_COPY[reason]) ||
      (reason ? `Stripe reports: ${reason.replace(/_/g, " ")}.` : null) ||
      (snap.pastDue.length > 0
        ? "Stripe has restricted this account until you complete overdue verification."
        : "Stripe has restricted payments on this account.");

    return {
      status: "restricted",
      title: "Account restricted",
      message: reasonMessage,
      severity: "critical",
      requirementsDue,
    };
  }

  return {
    status: "onboarding",
    title: "Onboarding incomplete",
    message: "Finish Stripe setup so guests can pay deposits at checkout.",
    severity: "warning",
    requirementsDue,
  };
}

export function businessRowNeedsStripeAlert(row: StripeConnectHealthRow): boolean {
  if (!row.stripe_connect_account_id?.trim()) return false;
  const display = describeStripeConnectDisplay(
    row.stripe_connect_account_id,
    snapshotFromBusinessRow(row),
  );
  return display.status === "restricted" || display.status === "onboarding";
}
