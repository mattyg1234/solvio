"use server";

import { revalidatePath } from "next/cache";

import { createBookingAction } from "@/app/dashboard/show-ops/actions";
import { EMAIL_BOOKINGS_PATH, loadEmailConnection, saveEmailTokens } from "@/lib/show-ops/email-bookings/connection";
import { findBookingByReference, loadEmail } from "@/lib/show-ops/email-bookings/data";
import { coerceExtracted } from "@/lib/show-ops/email-bookings/extract";
import { describeMailError, mailGate } from "@/lib/show-ops/email-bookings/gate";
import { MailProviderError } from "@/lib/show-ops/email-bookings/gmail";
import { cleanHubSpotToken, hubspotAccount } from "@/lib/show-ops/email-bookings/hubspot";
import { channelFor, channelRefFor, normRef, sellerSource } from "@/lib/show-ops/email-bookings/mapping";
import { cleanSender, customSeller, customSenderKey, SELLERS } from "@/lib/show-ops/email-bookings/sellers";
import type { InboundEmailRow, SellerFound } from "@/lib/show-ops/email-bookings/types";

type Result = { ok: true; message?: string } | { ok: false; message: string };

const MAX_CUSTOM = 30;

async function gateOrThrow(needed: "booker" | "office") {
  const g = await mailGate(needed);
  if ("error" in g) throw new Error(g.error);
  return g.ctx;
}

const fail = (e: unknown): Result => ({ ok: false, message: e instanceof Error ? e.message : "Something went wrong. Try again." });

function channelOf(email: Pick<InboundEmailRow, "seller_key" | "extracted">) {
  return channelFor(sellerSource(email.seller_key, email.extracted), email.seller_key);
}

/* ---------- The inbox and its senders ---------- */

/**
 * Which senders the bookings inbox tracks. Only the tick boxes (and a custom sender's name) come
 * from the browser; counts come from the last scan. The page sends its whole list, so a custom
 * sender left out of it has been removed.
 */
export async function saveEmailSendersAction(choices: { key: string; track: boolean; name?: string }[]): Promise<Result> {
  try {
    const ctx = await gateOrThrow("office");
    if (!Array.isArray(choices) || choices.length > 200) return { ok: false, message: "Send a list of senders." };
    const conn = await loadEmailConnection(ctx.supabase, ctx.business.id);
    if (!conn) return { ok: false, message: "Connect the bookings inbox first." };

    const wanted = new Map<string, { track: boolean; name?: string }>();
    for (const c of choices) {
      if (c && typeof c.key === "string" && typeof c.track === "boolean") wanted.set(c.key, { track: c.track, name: typeof c.name === "string" ? c.name : undefined });
    }
    // Suggestions from a scan that ran after the page loaded are kept; the office's own senders go if left out.
    const byKey = new Map(conn.sellers.filter((s) => !s.custom || s.suggested || wanted.has(s.key)).map((s) => [s.key, s]));
    for (const [key, { track, name }] of wanted) {
      const known = byKey.get(key);
      if (known) {
        const renamed = known.custom && name?.trim() ? name.trim().slice(0, 60) : known.name;
        // Ticked again after being off: its past emails get read again on the next sync.
        const syncedAt = track && known.track ? known.syncedAt : undefined;
        byKey.set(key, { ...known, name: renamed, track, suggested: known.suggested && !track ? true : undefined, syncedAt });
      } else if (key.startsWith("custom:")) {
        const sender = cleanSender(key.slice("custom:".length));
        if (!sender || customSenderKey(sender) !== key) continue;
        if ([...byKey.values()].filter((s) => s.custom && !s.suggested).length >= MAX_CUSTOM) return { ok: false, message: `You can add up to ${MAX_CUSTOM} senders.` };
        byKey.set(key, customSeller(name ?? sender, sender, track));
      } else {
        const catalog = SELLERS.find((s) => s.key === key);
        if (catalog) byKey.set(key, { key, name: catalog.name, domain: catalog.domains[0], found: 0, lastSeen: new Date().toISOString(), track } satisfies SellerFound);
      }
    }
    const sellers = [...byKey.values()];
    const { error } = await ctx.supabase
      .from("show_email_booking_connections")
      .update({ sellers, updated_at: new Date().toISOString() })
      .eq("id", conn.id)
      .eq("business_id", ctx.business.id);
    if (error) return { ok: false, message: "Couldn't save the senders. Try again." };
    revalidatePath(EMAIL_BOOKINGS_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Connects MHT's HubSpot inbox with a private app token pasted by the office. The token is checked
 * against HubSpot, stored encrypted, and never sent back to the browser or written to a log.
 */
export async function connectHubSpotInboxAction(rawToken: string): Promise<Result> {
  try {
    const ctx = await gateOrThrow("office");
    const token = cleanHubSpotToken(rawToken);
    if (!token) return { ok: false, message: "That doesn't look like a HubSpot private app token (it starts pat-…)." };
    let account;
    try {
      account = await hubspotAccount(token);
    } catch (e) {
      console.error(`[show-ops/email-bookings/hubspot-connect] ${describeMailError(e)}`);
      if (e instanceof MailProviderError && e.status === 401) return { ok: false, message: "HubSpot didn't accept that key. Copy it again from the private app's Auth tab." };
      if (e instanceof MailProviderError && e.status === 403) {
        return { ok: false, message: "The key works, but it needs the conversations.read permission. Add it under the private app's Scopes, then paste the key again." };
      }
      return { ok: false, message: "Couldn't reach HubSpot. Try again in a minute." };
    }

    // Reconnecting the same HubSpot inbox keeps its senders and sync position; anything else starts afresh.
    const existing = await loadEmailConnection(ctx.supabase, ctx.business.id);
    const now = new Date().toISOString();
    const same = existing && existing.provider === "hubspot" && existing.address === account.address;
    let connectionId: string;
    if (existing) {
      const patch = same
        ? { updated_at: now, connected_by: ctx.user.id }
        : { provider: "hubspot", address: account.address, sellers: [], skipped: 0, last_scan_at: null, last_sync_at: null, updated_at: now, connected_by: ctx.user.id };
      const { error } = await ctx.supabase.from("show_email_booking_connections").update(patch).eq("id", existing.id).eq("business_id", ctx.business.id);
      if (error) return { ok: false, message: "Couldn't save the connection. Try again." };
      connectionId = existing.id;
    } else {
      const { data, error } = await ctx.supabase
        .from("show_email_booking_connections")
        .insert({ business_id: ctx.business.id, provider: "hubspot", address: account.address, connected_by: ctx.user.id })
        .select("id")
        .single();
      if (error || !data) return { ok: false, message: "Couldn't save the connection. Try again." };
      connectionId = String(data.id);
    }
    await saveEmailTokens(connectionId, ctx.business.id, { accessToken: token, expiresAt: null }, false);
    revalidatePath(EMAIL_BOOKINGS_PATH);
    return { ok: true, message: account.address };
  } catch (e) {
    if (e instanceof Error && /SHOW_OPS_SECRETS_KEY/.test(e.message)) return { ok: false, message: "The server's secrets key (SHOW_OPS_SECRETS_KEY) isn't set, so the key can't be stored." };
    return fail(e);
  }
}

/** Disconnects the inbox and forgets its saved sign-in. Emails and bookings already made stay. */
export async function disconnectEmailInboxAction(): Promise<Result> {
  try {
    const ctx = await gateOrThrow("office");
    const conn = await loadEmailConnection(ctx.supabase, ctx.business.id);
    const { error } = await ctx.supabase.from("show_email_booking_connections").delete().eq("business_id", ctx.business.id);
    if (error) return { ok: false, message: "Couldn't disconnect. Try again." };
    revalidatePath(EMAIL_BOOKINGS_PATH);
    return {
      ok: true,
      message:
        conn?.provider === "hubspot"
          ? "Disconnected and the key was forgotten. The key itself can be removed in HubSpot under Settings → Integrations → Private apps."
          : "Disconnected. The Google permission itself can be removed in the Google account's security settings.",
    };
  } catch (e) {
    return fail(e);
  }
}

/* ---------- One email ---------- */

async function patchEmail(id: string, patch: Record<string, unknown>): Promise<Result> {
  const ctx = await gateOrThrow("booker");
  const email = await loadEmail(ctx.supabase, ctx.business.id, id);
  if (!email) return { ok: false, message: "That email isn't there any more." };
  const { error } = await ctx.supabase
    .from("show_email_bookings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", ctx.business.id);
  if (error) return { ok: false, message: "Couldn't save that. Try again." };
  revalidatePath(EMAIL_BOOKINGS_PATH);
  return { ok: true };
}

/** Corrects what was read from the email before it's added. */
export async function saveEmailFieldsAction(id: string, extracted: unknown): Promise<Result> {
  try {
    const clean = coerceExtracted(extracted);
    return await patchEmail(id, { extracted: clean, reference: normRef(clean.reference) || null });
  } catch (e) {
    return fail(e);
  }
}

export async function saveEmailNotesAction(id: string, notes: string): Promise<Result> {
  try {
    return await patchEmail(id, { notes: String(notes ?? "").trim().slice(0, 2000) || null });
  } catch (e) {
    return fail(e);
  }
}

/** Skip (not a booking for us, or nothing to do) or put it back in To check. */
export async function setEmailStatusAction(id: string, status: "ignored" | "review"): Promise<Result> {
  try {
    const ctx = await gateOrThrow("booker");
    if (status !== "ignored" && status !== "review") return { ok: false, message: "Unknown status." };
    const now = new Date().toISOString();
    return await patchEmail(
      id,
      status === "review" ? { status, handled_by: null, handled_at: null } : { status, handled_by: ctx.user.id, handled_at: now },
    );
  } catch (e) {
    return fail(e);
  }
}

/**
 * The email is about a booking that's already in the Hub (a TUI rep phoned it in, a change or a
 * cancellation): link them. The booking gets the email's reference when it has none yet, so the
 * next copy of the email is recognised on its own.
 */
export async function linkEmailToBookingAction(id: string, bookingId: string, note?: string): Promise<Result> {
  try {
    const ctx = await gateOrThrow("booker");
    const email = await loadEmail(ctx.supabase, ctx.business.id, id);
    if (!email) return { ok: false, message: "That email isn't there any more." };
    const { data: booking } = await ctx.supabase
      .from("show_bookings")
      .select("id,booking_ref,channel,channel_ref")
      .eq("business_id", ctx.business.id)
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) return { ok: false, message: "That booking wasn't found." };

    let stamped = "";
    const channel = channelOf(email);
    const ref = channelRefFor(email.extracted);
    if (ref && !booking.channel_ref) {
      const taken = await findBookingByReference(ctx.supabase, ctx.business.id, channel, ref);
      if (!taken || taken.id === booking.id) {
        const { error } = await ctx.supabase
          .from("show_bookings")
          .update({ channel, channel_ref: ref, updated_at: new Date().toISOString(), updated_by: ctx.user.id })
          .eq("id", booking.id)
          .eq("business_id", ctx.business.id);
        if (!error) stamped = ` Reference ${ref} saved on the booking.`;
      }
    }
    const now = new Date().toISOString();
    const res = await patchEmail(id, {
      status: "added",
      booking_id: booking.id,
      handled_by: ctx.user.id,
      handled_at: now,
      system_note: `Matched to ${booking.booking_ref}.${stamped}`,
      ...(note?.trim() ? { notes: [email.notes, note.trim()].filter(Boolean).join("\n").slice(0, 2000) } : {}),
    });
    return res.ok ? { ok: true, message: `Linked to ${booking.booking_ref}.${stamped}` } : res;
  } catch (e) {
    return fail(e);
  }
}

/** A cancellation or change the office has dealt with on the booking itself. */
export async function markEmailHandledAction(id: string, bookingId: string | null): Promise<Result> {
  try {
    const ctx = await gateOrThrow("booker");
    const email = await loadEmail(ctx.supabase, ctx.business.id, id);
    if (!email) return { ok: false, message: "That email isn't there any more." };
    let bookingRef = "";
    if (bookingId) {
      const { data } = await ctx.supabase.from("show_bookings").select("id,booking_ref").eq("business_id", ctx.business.id).eq("id", bookingId).maybeSingle();
      if (!data) return { ok: false, message: "That booking wasn't found." };
      bookingRef = String(data.booking_ref);
    }
    const what = email.kind === "cancel" ? "Cancellation" : email.kind === "change" ? "Change" : "Email";
    return await patchEmail(id, {
      status: "added",
      booking_id: bookingId,
      handled_by: ctx.user.id,
      handled_at: new Date().toISOString(),
      system_note: bookingRef ? `${what} handled on ${bookingRef}.` : `${what} handled (no booking in the Hub).`,
    });
  } catch (e) {
    return fail(e);
  }
}

/**
 * The new-booking form's action when it was opened from an email (/bookings/new?email=<id>):
 * the normal createBookingAction saves the booking exactly as the office confirmed it, then the
 * booking is stamped with the email's channel + reference and the email is marked done.
 */
export async function createBookingFromEmailAction(
  emailId: string,
  formData: FormData,
): Promise<{ ok: true; id?: string; message?: string } | { ok: false; message: string }> {
  try {
    const ctx = await gateOrThrow("booker");
    const email = await loadEmail(ctx.supabase, ctx.business.id, emailId);
    if (!email) return { ok: false, message: "That email isn't there any more." };
    if (email.status === "added" && email.booking_id) return { ok: false, message: "This email has already been added as a booking." };
    const channel = channelOf(email);
    const ref = channelRefFor(email.extracted);
    const existing = await findBookingByReference(ctx.supabase, ctx.business.id, channel, ref);
    if (existing) {
      return { ok: false, message: `${existing.booking_ref} already has this reference (${ref}). Go back to Email bookings and use Match instead.` };
    }

    const created = await createBookingAction(formData);
    if (!created.ok || !created.id) return created;
    const bookingRef = String(created.message ?? "").split(" ")[0];
    const now = new Date().toISOString();

    let stampNote = "";
    if (ref) {
      const { error } = await ctx.supabase
        .from("show_bookings")
        .update({ channel, channel_ref: ref, updated_at: now, updated_by: ctx.user.id })
        .eq("id", created.id)
        .eq("business_id", ctx.business.id);
      if (error) {
        console.error("[email-bookings] booking saved but reference not stamped", created.id, error.message);
        stampNote = ` The reference ${ref} couldn't be saved on it (${/duplicate|unique/i.test(error.message) ? "another booking has it" : "try Match"}).`;
      }
    }
    await ctx.supabase
      .from("show_email_bookings")
      .update({
        status: "added",
        booking_id: created.id,
        handled_by: ctx.user.id,
        handled_at: now,
        system_note: `Added as ${bookingRef}.${stampNote}`,
        updated_at: now,
      })
      .eq("id", emailId)
      .eq("business_id", ctx.business.id);
    revalidatePath(EMAIL_BOOKINGS_PATH);
    return created;
  } catch (e) {
    return fail(e);
  }
}
