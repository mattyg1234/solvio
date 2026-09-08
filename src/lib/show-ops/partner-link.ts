/**
 * Partner booking links. No login: the link carries an unguessable token and every
 * booking made through it is stamped with that partner's supplier id, which is how
 * the office knows who booked what.
 */

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function isPartnerLinkToken(raw: unknown): raw is string {
  return typeof raw === "string" && TOKEN_RE.test(raw);
}

export function partnerLinkPath(token: string): string {
  if (!isPartnerLinkToken(token)) throw new Error("Partner link is not set for this partner yet.");
  return `/p/${token}`;
}

export function partnerLinkUrl(siteUrl: string, token: string): string {
  return new URL(partnerLinkPath(token), siteUrl.replace(/\/$/, "") + "/").toString();
}

/** Booking ref series for a business: the invoice series, else SO. Mirrors show_ops_next_booking_ref. */
export function bookingRefSeries(config: { invoice?: { series?: string | null } }): string {
  const series = String(config.invoice?.series ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return series || "SO";
}

export type RefCounterClient = {
  from(table: "show_bookings"): {
    select(columns: string): {
      eq(column: string, value: string): {
        order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): {
          limit(n: number): PromiseLike<{ data: Array<{ booking_ref_num: number | null }> | null; error: { message: string } | null }>;
        };
      };
    };
  };
};

/**
 * Next ref for a booking created without an app session (the RPC refuses the
 * service role). Concurrency is handled by the caller retrying on the unique
 * (business_id, booking_ref) constraint. Floor of 1000 matches the RPC.
 */
export async function nextBookingRefWithoutSession(client: RefCounterClient, businessId: string, series: string): Promise<string> {
  const { data, error } = await client.from("show_bookings").select("booking_ref_num").eq("business_id", businessId)
    .order("booking_ref_num", { ascending: false, nullsFirst: false }).limit(1);
  if (error) throw new Error("Could not allocate a booking reference. Please retry.");
  const max = Number(data?.[0]?.booking_ref_num ?? 0);
  const n = Math.max(Number.isFinite(max) ? max + 1 : 1, 1000);
  return `${series}-${n}`;
}

export function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "23505" || /duplicate key|unique constraint/i.test(String(error?.message ?? ""));
}
