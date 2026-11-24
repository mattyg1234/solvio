import type { ShowOpsContext } from "@/lib/show-ops/access";

/**
 * Email bookings only keeps the last week of emails. Anything received longer ago than this is
 * removed from the list by the mail cron. Only the email copy goes: a booking already made from it
 * stays in Bookings, and the original email stays in the Gmail inbox.
 */
export const EMAIL_KEEP_DAYS = 7;

const DAY_MS = 86_400_000;

type Supabase = ShowOpsContext["supabase"];

/** The moment before which an email has expired. */
export function emailExpiryCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - EMAIL_KEEP_DAYS * DAY_MS);
}

/** Whole days left before an email received at `receivedAt` is removed (0 = goes on the next run). */
export function daysUntilExpiry(receivedAt: string, now: Date = new Date()): number {
  const left = new Date(receivedAt).getTime() + EMAIL_KEEP_DAYS * DAY_MS - now.getTime();
  return Math.max(0, Math.ceil(left / DAY_MS));
}

/** Deletes one business's emails older than EMAIL_KEEP_DAYS. Returns how many went. */
export async function expireOldEmails(admin: Supabase, businessId: string, now: Date = new Date()): Promise<number> {
  const { data, error } = await admin
    .from("show_email_bookings")
    .delete()
    .eq("business_id", businessId)
    .lt("received_at", emailExpiryCutoff(now).toISOString())
    .select("id");
  if (error) throw new Error(`old emails not removed: ${error.message}`);
  return data?.length ?? 0;
}
