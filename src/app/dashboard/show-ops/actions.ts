"use server";

import { uploadBusinessLogo, validateLogoFile } from "@/lib/business-logo";
import { bookingRefSeries, isPartnerLinkToken, isUniqueViolation, nextBookingRefWithoutSession, partnerLinkUrl } from "@/lib/show-ops/partner-link";
import { sendShowOpsPartnerLinkEmail } from "@/lib/notifications/show-ops-emails";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { bookingExtrasSummary, invoiceSupplements } from "@/lib/show-ops/invoice-supplements";
import { collectPartnerPages } from "@/lib/show-ops/partner-analytics";
import { redirect } from "next/navigation";

import { cookies } from "next/headers";

import {
  requireShowOpsContext,
  requireShowOpsAction,
  requireGlobalShowOpsAdmin,
  requirePartnerAdmin,
  requireShowOpsRole,
  requireShowOpsSellerContext,
  requireShowOpsStaffOrSeller,
  SHOW_OPS_WORKSPACE_COOKIE,
} from "@/lib/show-ops/access";
import {
  addDaysIso,
  applyNoShowBilling,
  arrivalFlagPatch,
  computeBookingMoney,
  hasPricingSnapshot,
  parsePaxCount,
  paymentStatusAfter,
  paxTotal,
  resolveArrivedPax,
  resolveNoShowCharge,
  formatShowOpsDoorTime,
  round2,
  showOpsAmountDue,
} from "@/lib/show-ops/calc";
import { normalisePartnerIslands } from "@/lib/show-ops/partners";
import { createShowOpsDepositCheckoutSession } from "@/lib/show-ops/deposit-checkout";
import {
  sendShowOpsHtmlEmail,
  sendShowOpsInvoiceEmail,
  sendShowOpsPaymentLinkEmail,
  sendShowOpsSellerInviteEmail,
} from "@/lib/notifications/show-ops-emails";
import { sendGuestTicket } from "@/lib/notifications/show-ops-guest-ticket";
import { getDeploymentSiteUrl } from "@/lib/deployment-site-url";
import { showOpsAllowedPages, SHOW_OPS_PAGE_KEYS } from "@/lib/show-ops/nav";
import { parseTicketTokenFromScan, showOpsTicketUrl } from "@/lib/show-ops/ticket-token";
import { saleBlockedForPartner, type CloseKind } from "@/lib/show-ops/calendar";
import { closeSaleCopy, closeSaleRecipients } from "@/lib/show-ops/close-sale";
import { filterShowOpsOutboundTo } from "@/lib/show-ops/outbound";
import { islandAllowed, parseMemberIslands, isGlobalShowOpsAdmin, assertWorkspaceOnlyStaffAccount } from "@/lib/show-ops/island-access";
import { calculateExtras, parseExtraSelections, sameExtraSelection, type ExtraSnapshot, type ShowExtra } from "@/lib/show-ops/extras";
import { applyTicketType, ticketBookingSnapshotPatch, ticketTransportAvailable, type ShowTicketType } from "@/lib/show-ops/ticket-types";
import { invitePartnerSeller, assertRemovableSeller } from "@/lib/show-ops/partner-invitations";
import { partnerBookingErrorMessage } from "@/lib/show-ops/partner-booking";
import { genericSeedConfig, mhtSeedConfig, showOpsCurrencyFor, slugifyQuestionId, parseShowOpsConfig, brandingFromBusiness } from "@/lib/show-ops/config";
import {
  buildVerifactuPayload,
  formatInvoiceNumber,
  invoiceIsLocked,
  nextInvoiceSequence,
  recalcInvoiceLine,
  sumInvoiceLines,
} from "@/lib/show-ops/invoice";
import { submitVerifactuInvoice } from "@/lib/show-ops/verifactu";
import { paidOnBooking } from "@/lib/show-ops/booking-paid";
import { pushChannelAvailability } from "@/lib/show-ops/gyg-data";
import { scanArrivalPlan, ticketIsForTonight } from "@/lib/show-ops/ticket-scan";
import { masterBulkTargets, masterBulkTickError, masterRowSaveTargets } from "@/lib/show-ops/master-bulk";
import {
  normaliseZone,
  parsePickupKind,
  parsePrivateAccommodation,
  privatePickupLabel,
  type PrivateAccommodation,
} from "@/lib/show-ops/private-pickup";
import { type ShowOpsBillingTier, type ShowOpsMemberRole, parseShowOpsPaymentMethod } from "@/lib/show-ops/types";
import type {
  ShowOpsBookingQuestion,
  ShowOpsBookingQuestionType,
  ShowOpsConfig,
  ShowOpsBillingMode,
  ShowOpsSalesChannel,
} from "@/lib/show-ops/types";

function revalidateShowOps() {
  revalidatePath("/dashboard/show-ops", "layout");
  revalidatePath("/dashboard/show-ops/master");
  revalidatePath("/dashboard/show-ops/calendar");
  revalidatePath("/dashboard/show-ops/outlook");
  revalidatePath("/dashboard/show-ops/door");
  revalidatePath("/partner");
}

function safeShowOpsNext(raw: string): string | null {
  const next = raw.trim();
  if (!next.startsWith("/dashboard/show-ops") && !next.startsWith("/partner")) return null;
  if (next.includes("://") || next.includes("\\") || next.includes("\n")) return null;
  return next;
}

const MASTER_TABS = new Set(["shows", "partners", "rates", "hotels", "stops"]);

function masterTabFromForm(formData: FormData, fallback: string) {
  const tab = String(formData.get("tab") ?? fallback).trim();
  return MASTER_TABS.has(tab) ? tab : fallback;
}

function redirectMaster(
  tab: string,
  opts?: { saved?: "1" | "bulk" | "exists"; created?: string; error?: string },
): never {
  const q = new URLSearchParams();
  q.set("tab", tab);
  if (opts?.saved) q.set("saved", opts.saved);
  if (opts?.created) q.set("created", opts.created);
  if (opts?.error) q.set("error", opts.error.slice(0, 180));
  redirect(`/dashboard/show-ops/master?${q.toString()}`);
}

export async function switchShowOpsWorkspaceAction(businessId: string): Promise<void> {
  const ctx = await requireShowOpsContext();
  const allowed = ctx.workspaces.some((w) => w.businessId === businessId);
  if (!allowed) throw new Error("You do not have access to that workspace.");
  const cookieStore = await cookies();
  cookieStore.set(SHOW_OPS_WORKSPACE_COOKIE, businessId, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidateShowOps();
  revalidatePath("/dashboard");
}

export async function enableShowOpsAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const seedPreset = String(formData.get("seed_preset") ?? "generic");
  const displayName = String(formData.get("display_name") ?? ctx.business.name).trim();
  const locationsRaw = String(formData.get("locations") ?? "");
  const locations = locationsRaw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const config =
    seedPreset === "mht"
      ? mhtSeedConfig()
      : genericSeedConfig(locations.length ? locations : undefined);
  const { data: existing } = await ctx.supabase
    .from("businesses")
    .select("platform_capabilities")
    .eq("id", ctx.business.id)
    .maybeSingle();
  const prev =
    existing?.platform_capabilities && typeof existing.platform_capabilities === "object"
      ? (existing.platform_capabilities as Record<string, boolean>)
      : {};
  const caps = { ...prev, show_ops: true };

  const { error } = await ctx.supabase
    .from("businesses")
    .update({
      show_ops_enabled: true,
      show_ops_billing_tier: "finance",
      show_ops_config: config,
      show_ops_display_name: displayName || ctx.business.name,
      platform_capabilities: caps,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ctx.business.id);

  if (error) throw new Error(error.message);
  revalidateShowOps();
  revalidatePath("/dashboard");
  redirect("/dashboard/show-ops");
}

type GuestTicketRow = Record<string, unknown>;

/** Booking row → guest ticket payload. Shared by create, resend and pick-up-change notifications. */
function guestTicketFromBooking(
  ctx: Awaited<ReturnType<typeof requireShowOpsContext>>,
  f: GuestTicketRow,
  opts?: { updated?: boolean },
) {
  const token = typeof f.ticket_token === "string" ? f.ticket_token : null;
  return {
    merchantName: ctx.branding.displayName,
    bookingRef: String(f.booking_ref ?? ""),
    guestName: String(f.guest_name ?? ""),
    guestEmail: (f.guest_email as string | null) ?? null,
    guestMobile: (f.guest_mobile as string | null) ?? null,
    showName: String(f.show_name ?? ""),
    extrasSummary: bookingExtrasSummary(f.extras_snapshot),
    showDate: String(f.show_date ?? ""),
    adults: Number(f.adults) || 0,
    children: Number(f.children) || 0,
    infants: Number(f.infants) || 0,
    hotelName: (f.hotel_name as string | null) ?? null,
    transportRequired: Boolean(f.transport_required),
    pickupStopName: (f.pickup_stop_name as string | null) ?? null,
    pickupTime: (f.pickup_time as string | null) ?? null,
    billingMode: String(f.billing_mode ?? "deposit"),
    totalCost: f.total_cost == null ? null : Number(f.total_cost),
    depositAmount: f.deposit_amount == null ? null : Number(f.deposit_amount),
    balanceRemaining: f.balance_remaining == null ? null : Number(f.balance_remaining),
    currency: showOpsCurrencyFor(ctx.config, (f as { island?: string | null }).island ?? null),
    dietaryNotes: (f.dietary_notes as string | null) ?? null,
    ticketUrl: token ? showOpsTicketUrl(getDeploymentSiteUrl(), token) : null,
    showTime: (f.ampm as string | null) ?? null,
    pickupKind: (f.pickup_kind as string | null) ?? null,
    privateZone: (f.private_zone as string | null) ?? null,
    updated: opts?.updated ?? false,
  };
}

const TICKET_FIELDS =
  "booking_ref,guest_name,guest_email,guest_mobile,show_name,show_date,ampm,adults,children,infants,hotel_name,transport_required,pickup_kind,private_zone,pickup_stop_name,pickup_time,billing_mode,total_cost,deposit_amount,balance_remaining,dietary_notes,cancelled_at,ticket_token";

/** Send (or re-send) one guest their ticket from the booking record. */
export async function resendGuestTicketAction(
  formData: FormData,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const ctx = await requireShowOpsAction("booker", ["bookings", "door", "lists"]);
  const id = String(formData.get("booking_id") ?? "").trim();
  if (!id) return { ok: false, message: "Missing booking." };

  const { data: booking } = await ctx.supabase
    .from("show_bookings")
    .select(TICKET_FIELDS)
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!booking) return { ok: false, message: "Booking not found." };
  if (booking.cancelled_at) return { ok: false, message: "This booking is cancelled." };
  if (!booking.guest_email && !booking.guest_mobile) {
    return { ok: false, message: "No email or mobile on this booking." };
  }

  const res = await sendGuestTicket(
    guestTicketFromBooking(ctx, booking as GuestTicketRow, { updated: String(formData.get("updated") ?? "") === "1" }),
  );
  const sent = [res.email?.ok ? "email" : null, res.sms?.ok ? "text" : null].filter(Boolean);
  if (!sent.length) {
    return { ok: false, message: res.email?.ok === false ? res.email.message : res.sms?.ok === false ? res.sms.message : "Nothing sent." };
  }
  revalidateShowOps();
  return { ok: true, message: `Ticket sent by ${sent.join(" and ")}.` };
}

export type TicketScanResult = {
  ok: boolean;
  alreadyIn: boolean;
  bookingId?: string;
  bookingRef?: string;
  guestName?: string;
  pax?: string;
  showName?: string;
  outstanding?: number;
  arrivedAt?: string | null;
  showDate?: string;
  island?: string;
  message: string;
};

/** Door scan: mark the whole party arrived. */
export async function checkInShowOpsTicketAction(formData: FormData): Promise<TicketScanResult> {
  const ctx = await requireShowOpsAction("booker", ["door", "lists"]);
  const token = parseTicketTokenFromScan(String(formData.get("scan") ?? ""));
  if (!token) return { ok: false, alreadyIn: false, message: "Not a valid ticket QR." };

  const { data: booking } = await ctx.supabase
    .from("show_bookings")
    .select(
      "id,booking_ref,guest_name,show_name,show_date,island,cancelled_at,arrived_at,arrived_pax,adults,children,infants,total_cost,balance_remaining,billing_mode,supplier_id,invoice_id,no_show_charge",
    )
    .eq("ticket_token", token)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!booking) return { ok: false, alreadyIn: false, message: "Ticket not found for this workspace." };
  if (booking.cancelled_at) {
    return { ok: false, alreadyIn: false, message: `${booking.booking_ref} is cancelled.` };
  }

  const booked = paxTotal(booking.adults, booking.children, booking.infants);
  const pax = `${booked} guest${booked === 1 ? "" : "s"}`;
  const outstanding = Number(booking.balance_remaining || 0);
  const base = {
    bookingId: booking.id,
    bookingRef: booking.booking_ref as string,
    guestName: booking.guest_name as string,
    pax,
    showName: booking.show_name as string,
    outstanding,
    showDate: booking.show_date as string,
    island: booking.island as string,
  };

  // A ticket for another night is not admitted by a scan. The office can still mark the
  // party in by hand from the booking if they genuinely turned up on the wrong night.
  if (!ticketIsForTonight(String(booking.show_date)) && String(formData.get("allow_other_night") ?? "") !== "1") {
    return {
      ok: false,
      alreadyIn: false,
      ...base,
      message: `${booking.guest_name} · ${booking.booking_ref} is for ${booking.show_date}, not tonight. Not admitted.`,
    };
  }

  const plan = scanArrivalPlan({ booked, arrivedAt: booking.arrived_at, arrivedPax: booking.arrived_pax });
  if (plan.kind === "already_in") {
    return {
      ok: true,
      alreadyIn: true,
      ...base,
      arrivedAt: booking.arrived_at,
      message: `${booking.guest_name} · ${booking.booking_ref} already in${booking.arrived_at ? ` · ${formatShowOpsDoorTime(booking.arrived_at)}` : ""}.`,
    };
  }

  const now = new Date().toISOString();
  const flags = arrivalFlagPatch(plan.arrivedPax, booked, now, booking.arrived_at);
  const decision = await arrivalNoShowDecisionPatch(ctx, booking, plan.arrivedPax, booked, now);
  // Conditional write: two phones scanning the same ticket cannot both report "first in".
  let update = ctx.supabase
    .from("show_bookings")
    .update({
      ...flags,
      ...decision,
      updated_at: now,
      updated_by: ctx.user.id,
      list_checked_by: ctx.user.id,
    })
    .eq("id", booking.id)
    .eq("business_id", ctx.business.id);
  update = plan.kind === "first" ? update.is("arrived_at", null) : update.eq("arrived_pax", booking.arrived_pax ?? 0);
  const { data: updated, error } = await update.select("id");
  if (error) return { ok: false, alreadyIn: false, message: error.message };
  if (!updated?.length) {
    // Someone else's scan landed first: report the party as in rather than claiming a second entry.
    const { data: fresh } = await ctx.supabase.from("show_bookings").select("arrived_at").eq("id", booking.id).maybeSingle();
    return {
      ok: true,
      alreadyIn: true,
      ...base,
      arrivedAt: fresh?.arrived_at ?? now,
      message: `${booking.guest_name} · ${booking.booking_ref} already in${fresh?.arrived_at ? ` · ${formatShowOpsDoorTime(fresh.arrived_at)}` : ""}.`,
    };
  }

  revalidateShowOps();
  const payNote =
    booking.billing_mode === "deposit" && outstanding > 0
      ? ` · ${outstanding.toFixed(2)} still outstanding`
      : "";
  const who = plan.kind === "complete_party" ? `remaining ${plan.remaining} guest${plan.remaining === 1 ? "" : "s"}` : pax;
  return {
    ok: true,
    alreadyIn: false,
    ...base,
    arrivedAt: now,
    message: `${booking.guest_name} · ${who} in at ${formatShowOpsDoorTime(now)} · ${booking.booking_ref}${payNote}`,
  };
}

/** The signed-in person's own display name — drives "Welcome back, Joel" and the sidebar card. */
export async function updateShowOpsMyNameAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsContext();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const { error } = await ctx.supabase
    .from("profiles")
    .update({ full_name: fullName || null })
    .eq("id", ctx.user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard", "layout");
  revalidateShowOps();
  return;
}

export async function updateShowOpsBrandingAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  // A new logo file replaces the stored one; no file keeps whatever is there.
  let logoUrl = ctx.business.show_ops_logo_url;
  const logoFile = formData.get("logo");
  if (logoFile instanceof File && logoFile.size > 0) {
    const logo = await validateLogoFile(logoFile);
    // Service role: the admin check above is the authorisation; storage policies are belt-and-braces.
    logoUrl = (await uploadBusinessLogo(createSupabaseServiceRoleClient().storage, ctx.business.id, logo)).publicUrl;
  }
  const { error } = await ctx.supabase
    .from("businesses")
    .update({
      show_ops_display_name: String(formData.get("display_name") ?? "").trim() || null,
      show_ops_logo_url: logoUrl,
      show_ops_primary_color: String(formData.get("primary_color") ?? "").trim() || null,
      show_ops_accent_color: String(formData.get("accent_color") ?? "").trim() || null,
      show_ops_custom_domain: String(formData.get("custom_domain") ?? "").trim().toLowerCase() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ctx.business.id);
  if (error) throw new Error(error.message);
  revalidateShowOps();
  return;
}

function splitLines(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function updateShowOpsIslandsAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const islands = splitLines(String(formData.get("islands") ?? ""));
  const config = { ...ctx.config, islands: islands.length ? islands : ctx.config.islands };
  const { error } = await ctx.supabase
    .from("businesses")
    .update({ show_ops_config: config, updated_at: new Date().toISOString() })
    .eq("id", ctx.business.id);
  if (error) throw new Error(error.message);
  revalidateShowOps();
  return;
}

/** Full ops customisation: labels, channels, dietary, custom booking questions. */
export async function updateShowOpsOpsConfigAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const islands = splitLines(String(formData.get("islands") ?? ""));
  const partner_types = splitLines(String(formData.get("partner_types") ?? ""));
  const sales_channels = splitLines(String(formData.get("sales_channels") ?? ""));
  const dietary_options = splitLines(String(formData.get("dietary_options") ?? ""));
  const dietary_mode = String(formData.get("dietary_mode") ?? "free_text") === "options" ? "options" : "free_text";

  const qLabels = formData.getAll("q_label").map(String);
  const qTypes = formData.getAll("q_type").map(String);
  const qOptions = formData.getAll("q_options").map(String);
  const qIds = formData.getAll("q_id").map(String);
  const booking_questions: ShowOpsBookingQuestion[] = [];
  for (let i = 0; i < qLabels.length; i++) {
    const label = qLabels[i]?.trim();
    if (!label) continue;
    const type = (["text", "textarea", "select", "checkbox", "number"].includes(qTypes[i])
      ? qTypes[i]
      : "text") as ShowOpsBookingQuestionType;
    const id = (qIds[i]?.trim() || slugifyQuestionId(label)).slice(0, 40);
    const options = type === "select" ? splitLines(qOptions[i] || "") : undefined;
    booking_questions.push({
      id,
      label,
      type,
      required: String(formData.get(`q_required_${i}`) ?? "") === "1",
      options,
      show_on_office_list: String(formData.get(`q_office_list_${i}`) ?? "") === "1",
    });
  }

  const config = {
    ...ctx.config,
    islands: islands.length ? islands : ctx.config.islands,
    location_label: String(formData.get("location_label") ?? ctx.config.location_label).trim() || "Region",
    product_label: String(formData.get("product_label") ?? ctx.config.product_label).trim() || "Trip / ticket",
    partner_types: partner_types.length ? partner_types : ctx.config.partner_types,
    sales_channels: sales_channels.length ? sales_channels : ctx.config.sales_channels,
    dietary_mode,
    dietary_options,
    booking_questions,
    currency: (["eur", "gbp", "usd"].includes(String(formData.get("currency")))
      ? String(formData.get("currency"))
      : ctx.config.currency) as ShowOpsConfig["currency"],
    guest_stripe_enabled: String(formData.get("guest_stripe_enabled") ?? "") === "1",
    partner_stripe_enabled: ctx.config.partner_stripe_enabled,
    transport_supplement: (() => {
      const v = Number(formData.get("transport_supplement"));
      return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : ctx.config.transport_supplement;
    })(),
    invoice: {
      series: String(formData.get("invoice_series") ?? ctx.config.invoice.series).trim() || ctx.config.invoice.series,
      defaultVatRate: (() => {
        const v = Number(formData.get("invoice_vat_rate"));
        return Number.isFinite(v) && v >= 0 ? v : ctx.config.invoice.defaultVatRate;
      })(),
      issuerName: String(formData.get("invoice_issuer_name") ?? "").trim(),
      issuerTaxId: String(formData.get("invoice_issuer_tax_id") ?? "").trim(),
      issuerAddress: String(formData.get("invoice_issuer_address") ?? "").trim(),
      taxLabel: String(formData.get("invoice_tax_label") ?? "").trim().slice(0, 12) || ctx.config.invoice.taxLabel,
      footerNote: String(formData.get("invoice_footer_note") ?? "").trim().slice(0, 600),
      thankYouName: String(formData.get("invoice_thank_you_name") ?? "").trim().slice(0, 60),
    },
  };

  const { error } = await ctx.supabase
    .from("businesses")
    .update({ show_ops_config: config, updated_at: new Date().toISOString() })
    .eq("id", ctx.business.id);
  if (error) throw new Error(error.message);
  revalidateShowOps();
  return;
}

async function nextRef(ctx: Awaited<ReturnType<typeof requireShowOpsContext>>): Promise<string> {
  const { data, error } = await ctx.supabase.rpc("show_ops_next_booking_ref", {
    p_business_id: ctx.business.id,
  });
  // Never fall back to a different numbering series: a booking with a made-up reference
  // breaks the MHT sequence Lanzasoft handed over. Fail loudly and let the desk retry.
  if (error || !data) {
    throw new Error(`Could not allocate a booking reference${error ? `: ${error.message}` : ""}. Try again.`);
  }
  return String(data);
}

/** A reference clash between two desks racing for the same number is retried with the next one. */
function isBookingRefClash(error: { code?: string; message?: string; details?: string } | null | undefined): boolean {
  return isUniqueViolation(error) && /booking_ref/i.test(`${error?.message ?? ""} ${error?.details ?? ""}`);
}

export async function upsertSupplierAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("admin", "partners");
  const tab = masterTabFromForm(formData, "partners");
  const id = String(formData.get("id") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
  if (emailRaw && !emailRaw.includes("@")) redirectMaster(tab, { error: "Supplier email looks invalid." });
  const row = {
    business_id: ctx.business.id,
    name: String(formData.get("name") ?? "").trim(),
    partner_type: String(formData.get("partner_type") ?? "agency").trim(),
    island: String(formData.get("island") ?? "").trim() || null,
    billing_mode: String(formData.get("billing_mode") ?? "deposit"),
    can_choose_billing_mode: formData.get("can_choose_billing_mode") === "1",
    deposit_percent: Number(formData.get("deposit_percent") ?? 30),
    invoice_nett_percent: Number(formData.get("invoice_nett_percent") ?? 100),
    email: emailRaw || null,
    tax_id: String(formData.get("tax_id") ?? "").trim() || null,
    legal_name: String(formData.get("legal_name") ?? "").trim() || null,
    invoice_address: String(formData.get("invoice_address") ?? "").trim() || null,
    no_show_policy: resolveNoShowCharge(String(formData.get("no_show_policy") ?? ""), null),
    active: String(formData.get("active") ?? "1") === "1",
    updated_at: new Date().toISOString(),
  };
  if (row.name.length < 2) redirectMaster(tab, { error: "Supplier name required." });
  if (id) {
    const { error } = await ctx.supabase.from("show_suppliers").update(row).eq("id", id).eq("business_id", ctx.business.id);
    if (error) redirectMaster(tab, { error: error.message });
    revalidateShowOps();
    redirectMaster(tab, { saved: "1", created: id });
  }
  const { data: existing } = await ctx.supabase
    .from("show_suppliers")
    .select("id")
    .eq("business_id", ctx.business.id)
    .eq("active", true)
    .ilike("name", row.name)
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    revalidateShowOps();
    redirectMaster(tab, { saved: "exists", created: existing.id });
  }
  const { data, error } = await ctx.supabase.from("show_suppliers").insert(row).select("id").single();
  if (error) redirectMaster(tab, { error: error.message });
  revalidateShowOps();
  redirectMaster(tab, { saved: "1", created: data?.id });
}

export async function upsertProductAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("admin", "shows");
  const tab = masterTabFromForm(formData, "shows");
  const id = String(formData.get("id") ?? "").trim();
  const row = productRowFromForm(formData, ctx.business.id, "");
  if (!row.name || !row.island) redirectMaster(tab, { error: "Show name and island required." });
  if (id) {
    const { error } = await ctx.supabase.from("show_products").update(row).eq("id", id).eq("business_id", ctx.business.id);
    if (error) redirectMaster(tab, { error: error.message });
    revalidateShowOps();
    redirectMaster(tab, { saved: "1", created: id });
  }
  const { data: existing } = await ctx.supabase
    .from("show_products")
    .select("id")
    .eq("business_id", ctx.business.id)
    .eq("active", true)
    .eq("island", row.island)
    .ilike("name", row.name)
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    revalidateShowOps();
    redirectMaster(tab, { saved: "exists", created: existing.id });
  }
  const { data, error } = await ctx.supabase.from("show_products").insert(row).select("id").single();
  if (error) redirectMaster(tab, { error: error.message });
  revalidateShowOps();
  redirectMaster(tab, { saved: "1", created: data?.id });
}

function productRowFromForm(formData: FormData, businessId: string, prefix: string) {
  const g = (k: string) => formData.get(prefix + k);
  const numOrNull = (k: string) => {
    const raw = String(g(k) ?? "").trim();
    return raw ? Number(raw) : null;
  };
  return {
    business_id: businessId,
    name: String(g("name") ?? "").trim(),
    island: String(g("island") ?? "").trim(),
    ticket_type: String(g("ticket_type") ?? "standard").trim(),
    adult_price: Number(g("adult_price") ?? 0),
    child_price: Number(g("child_price") ?? 0),
    infant_price: Number(g("infant_price") ?? 0),
    adult_price_no_transport: null,
    child_price_no_transport: null,
    infant_price_no_transport: null,
    transport_available: String(g("transport_available") ?? (prefix ? "" : "1")) === "1",
    show_time: String(g("show_time") ?? "").trim() || null,
    run_weekdays: (() => {
      const days = formData
        .getAll(prefix + "run_weekday")
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
      return days.length ? [...new Set(days)].sort((a, b) => a - b) : null;
    })(),
    capacity: numOrNull("capacity"),
    active: String(g("active") ?? (prefix ? "" : "1")) === "1",
    updated_at: new Date().toISOString(),
  };
}

export async function applyMasterProductsBulkAction(formData: FormData): Promise<void> {
  formData.set("intent", "bulk");
  return saveMasterProductsAction(formData);
}

export async function saveMasterProductsAllAction(formData: FormData): Promise<void> {
  formData.set("intent", "save_all");
  return saveMasterProductsAction(formData);
}

export async function saveMasterProductOneAction(productId: string, formData: FormData): Promise<void> {
  formData.set("intent", `save:${productId}`);
  return saveMasterProductsAction(formData);
}

export async function repriceUninvoicedBoundAction(productId: string, formData: FormData): Promise<void> {
  formData.set("product_id", productId);
  return repriceUninvoicedForProductAction(formData);
}

export async function saveMasterProductsAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("admin", "shows");
  const intent = String(formData.get("intent") ?? "");
  const ids = formData.getAll("product_ids").map(String).filter(Boolean);
  const ticked = formData.getAll("ticked").map(String).filter(Boolean);
  const tab = String(formData.get("tab") ?? "shows");

  if (intent === "bulk") {
    const target = masterBulkTargets(ticked, ids);
    const tickError = masterBulkTickError(target);
    if (tickError) throw new Error(tickError);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const island = String(formData.get("bulk_island") ?? "").trim();
    if (island) patch.island = island;
    const ticketType = String(formData.get("bulk_ticket_type") ?? "").trim();
    if (ticketType) patch.ticket_type = ticketType;
    for (const key of ["adult_price", "child_price", "infant_price", "capacity"] as const) {
      const raw = String(formData.get(`bulk_${key}`) ?? "").trim();
      if (raw) patch[key] = Number(raw);
    }
    const transport = String(formData.get("bulk_transport") ?? "");
    if (transport === "1" || transport === "0") patch.transport_available = transport === "1";
    const active = String(formData.get("bulk_active") ?? "");
    if (active === "1" || active === "0") patch.active = active === "1";
    if (Object.keys(patch).length <= 1) throw new Error("Fill at least one bulk field to apply.");
    const { error } = await ctx.supabase
      .from("show_products")
      .update(patch)
      .eq("business_id", ctx.business.id)
      .in("id", target);
    if (error) throw new Error(error.message);
    revalidateShowOps();
    redirect(`/dashboard/show-ops/master?tab=${encodeURIComponent(tab)}&saved=bulk`);
  }

  const one = intent.startsWith("save:") ? intent.slice(5) : "";
  if (one && !ids.includes(one)) throw new Error("That show is not on this list.");
  const toSave = masterRowSaveTargets(intent, ids);
  if (!toSave.length) throw new Error("Nothing to save.");
  for (const id of toSave) {
    const row = productRowFromForm(formData, ctx.business.id, `${id}::`);
    if (!row.name || !row.island) throw new Error("Show name and island required.");
    const { error } = await ctx.supabase
      .from("show_products")
      .update(row)
      .eq("id", id)
      .eq("business_id", ctx.business.id);
    if (error) throw new Error(error.message);
  }
  revalidateShowOps();
  redirect(`/dashboard/show-ops/master?tab=${encodeURIComponent(tab)}&saved=1`);
}

export async function applyMasterSuppliersBulkAction(formData: FormData): Promise<void> {
  formData.set("intent", "bulk");
  return saveMasterSuppliersAction(formData);
}

export async function saveMasterSuppliersAllAction(formData: FormData): Promise<void> {
  formData.set("intent", "save_all");
  return saveMasterSuppliersAction(formData);
}

export async function saveMasterSupplierOneAction(supplierId: string, formData: FormData): Promise<void> {
  formData.set("intent", `save:${supplierId}`);
  return saveMasterSuppliersAction(formData);
}

export async function saveMasterSuppliersAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("admin", "partners");
  const intent = String(formData.get("intent") ?? "");
  const ids = formData.getAll("supplier_id").map(String).filter(Boolean);
  const ticked = formData.getAll("ticked").map(String).filter(Boolean);
  const tab = String(formData.get("tab") ?? "partners");

  if (intent === "bulk") {
    const target = masterBulkTargets(ticked, ids);
    const tickError = masterBulkTickError(target);
    if (tickError) throw new Error(tickError);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const billing = String(formData.get("bulk_billing_mode") ?? "").trim();
    if (billing) patch.billing_mode = billing;
    const deposit = String(formData.get("bulk_deposit_percent") ?? "").trim();
    if (deposit) patch.deposit_percent = Number(deposit);
    const nett = String(formData.get("bulk_invoice_nett_percent") ?? "").trim();
    if (nett) patch.invoice_nett_percent = Number(nett);
    const noShow = String(formData.get("bulk_no_show_policy") ?? "").trim();
    if (noShow === "charge" || noShow === "write_off") patch.no_show_policy = noShow;
    const active = String(formData.get("bulk_active") ?? "");
    if (active === "1" || active === "0") patch.active = active === "1";
    const addIsland = String(formData.get("bulk_add_island") ?? "").trim();
    if (Object.keys(patch).length <= 1 && !addIsland) throw new Error("Fill at least one bulk field to apply.");
    if (Object.keys(patch).length > 1) {
      const { error } = await ctx.supabase
        .from("show_suppliers")
        .update(patch)
        .eq("business_id", ctx.business.id)
        .in("id", target);
      if (error) throw new Error(error.message);
    }
    if (addIsland) {
      // Adds the location alongside whatever the partner already sells; a partner on All is left alone.
      const { data: rows, error: readError } = await ctx.supabase
        .from("show_suppliers")
        .select("id,island")
        .eq("business_id", ctx.business.id)
        .in("id", target);
      if (readError) throw new Error(readError.message);
      for (const row of rows ?? []) {
        const current = String(row.island ?? "").split(",").map((x) => x.trim()).filter(Boolean);
        if (current.some((x) => x.toUpperCase() === "ALL") || current.includes(addIsland)) continue;
        const { error } = await ctx.supabase
          .from("show_suppliers")
          .update({ island: normalisePartnerIslands([...current, addIsland]), updated_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("business_id", ctx.business.id);
        if (error) throw new Error(error.message);
      }
    }
    revalidateShowOps();
    redirect(`/dashboard/show-ops/master?tab=${encodeURIComponent(tab)}&saved=bulk`);
  }

  const one = intent.startsWith("save:") ? intent.slice(5) : "";
  if (one && !ids.includes(one)) throw new Error("That partner is not on this list.");
  const toSave = masterRowSaveTargets(intent, ids);
  if (!toSave.length) throw new Error("Nothing to save.");
  for (const id of toSave) {
    const p = `${id}::`;
    const row = {
      name: String(formData.get(p + "name") ?? "").trim(),
      partner_type: String(formData.get(p + "partner_type") ?? "agency").trim(),
      island: normalisePartnerIslands(formData.getAll(p + "island").map(String)),
      can_choose_billing_mode: String(formData.get(p + "can_choose_billing_mode") ?? "") === "1",
      billing_mode: String(formData.get(p + "billing_mode") ?? "deposit"),
      deposit_percent: Number(formData.get(p + "deposit_percent") ?? 30),
      invoice_nett_percent: Number(formData.get(p + "invoice_nett_percent") ?? 100),
      no_show_policy: resolveNoShowCharge(String(formData.get(p + "no_show_policy") ?? ""), null),
      sale_rate_id: String(formData.get(p + "sale_rate_id") ?? "").trim() || null,
      invoice_rate_id: String(formData.get(p + "invoice_rate_id") ?? "").trim() || null,
      email: (() => {
        const raw = String(formData.get(p + "email") ?? "").trim().toLowerCase();
        if (!raw) return null;
        if (raw && !raw.includes("@")) throw new Error("Supplier email looks invalid.");
        return raw || null;
      })(),
      tax_id: String(formData.get(p + "tax_id") ?? "").trim() || null,
      legal_name: String(formData.get(p + "legal_name") ?? "").trim() || null,
      invoice_address: String(formData.get(p + "invoice_address") ?? "").trim() || null,
      active: String(formData.get(p + "active") ?? "") === "1",
      updated_at: new Date().toISOString(),
    };
    if (row.name.length < 2) throw new Error("Supplier name required.");
    const { error } = await ctx.supabase
      .from("show_suppliers")
      .update(row)
      .eq("id", id)
      .eq("business_id", ctx.business.id);
    if (error) throw new Error(error.message);
  }
  revalidateShowOps();
  redirect(`/dashboard/show-ops/master?tab=${encodeURIComponent(tab)}&saved=1`);
}

export type ShowOpsNightLoad = {
  island: string;
  show_name: string;
  seats_ordered: number | null;
  bus_pax: number;
  bus_free: number | null;
  show_pax: number;
  show_adults: number;
  show_children: number;
  show_infants: number;
  capacity: number | null;
  show_free: number | null;
  close_kind: CloseKind | null;
};

/** Live night stats for the booking cockpit: bus load for the island-night + pax vs capacity for the show. */
export async function getNightLoadAction(
  productId: string,
  showDate: string,
): Promise<{ ok: true; load: ShowOpsNightLoad } | { ok: false; message: string }> {
  const ctx = await requireShowOpsStaffOrSeller();
  const date = showDate.trim();
  if (!productId.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: "Pick a show and date." };

  const { createSupabaseServiceRoleClient } = await import("@/lib/supabase/server");
  const db = createSupabaseServiceRoleClient();

  const { data: product } = await ctx.supabase
    .from("show_products")
    .select("id,name,island,capacity")
    .eq("id", productId.trim())
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (product && !islandAllowed(ctx.allowedIslands, product.island)) return { ok: false, message: "You do not have access to this island." };
  if (!product) return { ok: false, message: "Show not found." };

  const [{ data: bookings }, { data: order }, { data: closes }] = await Promise.all([
    collectPartnerPages<{ adults: number; children: number; infants: number; transport_required: boolean; product_id: string | null; island: string }>(async (offset, limit) => {
      const { data, error } = await db.from("show_bookings")
        .select("adults,children,infants,transport_required,product_id,island")
        .eq("business_id", ctx.business.id).eq("show_date", date).is("cancelled_at", null)
        .order("id").range(offset, offset + limit - 1);
      if (error) throw new Error("Could not check current capacity. Please retry.");
      return data ?? [];
    }).then((data) => ({ data })),
    db
      .from("show_bus_orders")
      .select("seats_ordered")
      .eq("business_id", ctx.business.id)
      .eq("show_date", date)
      .eq("island", product.island)
      .maybeSingle(),
    db
      .from("show_night_closes")
      .select("product_id,close_kind")
      .eq("business_id", ctx.business.id)
      .eq("show_date", date)
      .eq("island", product.island),
  ]);

  let busPax = 0;
  let showPax = 0;
  let showAdults = 0;
  let showChildren = 0;
  let showInfants = 0;
  for (const b of bookings ?? []) {
    const pax = paxTotal(b.adults, b.children, b.infants);
    if (b.transport_required && b.island === product.island) busPax += pax;
    if (b.product_id === product.id) {
      showPax += pax;
      showAdults += Number(b.adults) || 0;
      showChildren += Number(b.children) || 0;
      showInfants += Number(b.infants) || 0;
    }
  }
  const seats = order ? Number(order.seats_ordered) : null;
  const capacity = product.capacity == null ? null : Number(product.capacity);
  return {
    ok: true,
    load: {
      island: product.island,
      show_name: product.name,
      seats_ordered: seats,
      bus_pax: busPax,
      bus_free: seats == null ? null : seats - busPax,
      show_pax: showPax,
      show_adults: showAdults,
      show_children: showChildren,
      show_infants: showInfants,
      capacity,
      show_free: capacity == null ? null : capacity - showPax,
      close_kind: saleBlockedForPartner(
        (closes ?? []).map((c) => ({
          show_date: date,
          island: product.island,
          product_id: c.product_id,
          close_kind: c.close_kind as CloseKind,
        })),
        { showDate: date, island: product.island, productId: product.id },
      )
        ? "full"
        : ((closes ?? []).find((c) => c.product_id === product.id || c.product_id == null)?.close_kind as CloseKind | null) ??
          null,
    },
  };
}

export async function repriceUninvoicedForProductAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("admin", "shows");
  const productId = String(formData.get("product_id") ?? "").trim();
  if (!productId) throw new Error("Show required.");

  const { data: product } = await ctx.supabase
    .from("show_products")
    .select("*")
    .eq("id", productId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!product) throw new Error("Show not found.");

  const { data: bookings } = await ctx.supabase
    .from("show_bookings")
    .select(
      "id,legacy_id,ticket_type_id,extras_snapshot,adults,children,infants,supplier_id,transport_required,billing_mode,invoice_id,cancelled_at,total_cost,balance_remaining",
    )
    .eq("business_id", ctx.business.id)
    .eq("product_id", productId)
    .is("invoice_id", null)
    .is("legacy_id", null) // imported Lanzasoft bookings keep the money they were sold at
    .is("cancelled_at", null);

  const supplierIds = [...new Set((bookings ?? []).map((b) => b.supplier_id).filter(Boolean))] as string[];
  const { data: suppliers } = supplierIds.length
    ? await ctx.supabase.from("show_suppliers").select("*").eq("business_id", ctx.business.id).in("id", supplierIds)
    : { data: [] as Array<Record<string, unknown>> };
  const supplierById = new Map((suppliers ?? []).map((s) => [s.id as string, s]));
  const { data: ticketTypes, error: typesError } = await ctx.supabase.from("show_ticket_types").select("*").eq("business_id", ctx.business.id).eq("product_id", productId);
  if (typesError) throw new Error("Could not load ticket prices. Nothing repriced.");
  const byTicketType = new Map((ticketTypes ?? []).map((t) => [t.id, t as ShowTicketType]));
  if ((bookings ?? []).some((b) => b.ticket_type_id && !byTicketType.has(b.ticket_type_id))) throw new Error("A booking has an unavailable ticket type. Review it before repricing.");
  const { data: extrasCatalogue, error: extrasError } = await ctx.supabase.from("show_extras").select("*").eq("business_id", ctx.business.id).eq("product_id", productId);
  if (extrasError) throw new Error("Could not load extras. Nothing repriced.");
  const repricedExtras = new Map((bookings ?? []).map((b) => {
    const supplier = b.supplier_id ? supplierById.get(b.supplier_id) : null;
    return [b.id, calculateExtras((extrasCatalogue ?? []) as ShowExtra[], (b.extras_snapshot ?? []).map((line: ExtraSnapshot) => ({ id: line.id, quantity: line.charge_basis === "quantity" ? line.quantity : 1 })), b.adults + b.children + b.infants, Number(supplier?.invoice_nett_percent ?? 100), { allowArchived: true })];
  }));
  const now = new Date().toISOString();

  for (const b of bookings ?? []) {
    const supplier = b.supplier_id ? supplierById.get(b.supplier_id) ?? null : null;
    const pricedProduct = applyTicketType(product as import("@/lib/show-ops/types").ShowProduct, b.ticket_type_id ? byTicketType.get(b.ticket_type_id)! : null);
    const extras = repricedExtras.get(b.id) ?? [];
    const money = computeBookingMoney({
      extras,
      adults: b.adults,
      children: b.children,
      infants: b.infants,
      product: pricedProduct as never,
      supplier: supplier as never,
      transportRequired: Boolean(b.transport_required),
      transportSupplement: ctx.config.transport_supplement,
    });
    const patch: Record<string, unknown> = {
      show_name: pricedProduct.name,
      ticket_type_name: b.ticket_type_id ? byTicketType.get(b.ticket_type_id)!.name : null,
      pricing_snapshot: { ...money.pricing_snapshot, priced_at: now },
      island: product.island,
      total_cost: money.total_cost,
      deposit_amount: money.deposit_amount,
      nett_total: money.nett_total,
      adult_nett_total: money.adult_nett_total,
      child_nett_total: money.child_nett_total,
      infant_nett_total: money.infant_nett_total,
      extras_snapshot: extras,
      billing_mode: money.billing_mode,
      updated_at: now,
      updated_by: ctx.user.id,
    };
    if (money.billing_mode === "deposit") {
      const paid = await paidOnBooking(ctx.supabase, b);
      const next = paymentStatusAfter(money.total_cost, paid);
      patch.balance_remaining = next.balance;
      patch.payment_status = next.payment_status;
    } else {
      patch.balance_remaining = 0;
      patch.payment_status = "n_a";
    }
    const { error } = await ctx.supabase
      .from("show_bookings")
      .update(patch)
      .eq("id", b.id)
      .eq("business_id", ctx.business.id)
      .is("invoice_id", null);
    if (error) throw new Error(error.message);
  }
  revalidateShowOps();
}

/** http(s) links only; anything else is dropped rather than printed on the run sheet. */
function cleanHttpUrl(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  return /^https?:\/\/\S+$/i.test(v) ? v.slice(0, 2000) : null;
}

export async function upsertBusStopAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("admin", "hotels");
  const id = String(formData.get("id") ?? "").trim();
  const pickup = String(formData.get("pickup_time") ?? "").trim();
  const row = {
    business_id: ctx.business.id,
    island: String(formData.get("island") ?? "").trim(),
    resort: String(formData.get("resort") ?? "").trim(),
    stop_name: String(formData.get("stop_name") ?? "").trim(),
    pickup_time: pickup || null,
    sort_order: Number(formData.get("sort_order") ?? 0),
    guide_notes: String(formData.get("guide_notes") ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  } as {
    business_id: string;
    island: string;
    resort: string;
    stop_name: string;
    pickup_time: string | null;
    sort_order: number;
    guide_notes: string | null;
    active: boolean;
    updated_at: string;
    runs_on?: string | null;
    map_url?: string | null;
    photo_url?: string | null;
  };
  if (formData.has("runs_on")) {
    row.runs_on = String(formData.get("runs_on") ?? "").trim() || null;
  }
  // Map / photo links only move when the form that carries them is the one saving
  // (the bus-board time form does not, so it never wipes them).
  if (formData.has("map_url")) row.map_url = cleanHttpUrl(formData.get("map_url"));
  if (formData.has("photo_url")) row.photo_url = cleanHttpUrl(formData.get("photo_url"));
  const tab = masterTabFromForm(formData, "hotels");
  // The Bus board opens this form in place; send it back there rather than to the master page.
  const nextRaw = String(formData.get("next") ?? "").trim();
  const nextPath = nextRaw.startsWith("/dashboard/show-ops/") && !nextRaw.includes("//") ? nextRaw : null;
  const back = (opts?: { saved?: "1" | "bulk" | "exists"; created?: string; error?: string }): never => {
    if (!nextPath) redirectMaster(tab, opts);
    const url = new URL(nextPath, "http://x");
    if (opts?.saved) url.searchParams.set("saved", opts.saved);
    if (opts?.created) url.searchParams.set("created", opts.created);
    if (opts?.error) url.searchParams.set("error", opts.error.slice(0, 180));
    redirect(`${url.pathname}${url.search}`);
  };
  if (!row.island || !row.resort || !row.stop_name) back({ error: "Island, resort and stop required." });
  row.active = id ? formData.get("active") === "1" : formData.get("active") !== "0";
  if (id) {
    const { data: before } = await ctx.supabase
      .from("show_bus_stops")
      .select("pickup_time")
      .eq("id", id)
      .eq("business_id", ctx.business.id)
      .maybeSingle();
    const timeChanged = (before?.pickup_time ?? null) !== row.pickup_time;

    const { error } = await ctx.supabase.from("show_bus_stops").update(row).eq("id", id).eq("business_id", ctx.business.id);
    if (error) back({ error: error.message });
    const label = `${row.resort} · ${row.stop_name}`;
    await ctx.supabase
      .from("show_bookings")
      .update({ pickup_stop_name: label, pickup_time: row.pickup_time, updated_at: row.updated_at })
      .eq("business_id", ctx.business.id)
      .eq("pickup_stop_id", id);

    // Opt-in: tell guests still to travel that their pick-up moved. Future dates only, never the past.
    if (timeChanged && String(formData.get("notify_guests") ?? "") === "1") {
      const todayIso = new Date().toISOString().slice(0, 10);
      const { data: affected } = await ctx.supabase
        .from("show_bookings")
        .select(TICKET_FIELDS)
        .eq("business_id", ctx.business.id)
        .eq("pickup_stop_id", id)
        .gte("show_date", todayIso)
        .is("cancelled_at", null)
        .limit(300);
      for (const b of affected ?? []) {
        if (!b.guest_email && !b.guest_mobile) continue;
        await sendGuestTicket(guestTicketFromBooking(ctx, b as GuestTicketRow, { updated: true }));
      }
    }
  } else {
    const { data, error } = await ctx.supabase.from("show_bus_stops").insert(row).select("id").single();
    if (error) back({ error: error.message });
    revalidateShowOps();
    back({ saved: "1", created: data?.id });
  }
  revalidateShowOps();
  back({ saved: "1", created: id });
}

export async function nudgeBusStopAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("admin", "hotels");
  const id = String(formData.get("id") ?? "").trim();
  const dir = String(formData.get("dir") ?? "") === "up" ? -1 : 1;
  if (!id) throw new Error("Stop required.");

  const { data: current } = await ctx.supabase
    .from("show_bus_stops")
    .select("id,island,sort_order")
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!current) throw new Error("Stop not found.");

  const { data: siblings } = await ctx.supabase
    .from("show_bus_stops")
    .select("id,sort_order")
    .eq("business_id", ctx.business.id)
    .eq("island", current.island)
    .order("sort_order")
    .order("stop_name");
  const list = siblings ?? [];
  const idx = list.findIndex((s) => s.id === id);
  const swapWith = list[idx + dir];
  if (idx < 0 || !swapWith) {
    revalidateShowOps();
    return;
  }

  const a = Number(current.sort_order);
  const b = Number(swapWith.sort_order);
  const now = new Date().toISOString();
  await ctx.supabase
    .from("show_bus_stops")
    .update({ sort_order: b, updated_at: now })
    .eq("id", current.id)
    .eq("business_id", ctx.business.id);
  await ctx.supabase
    .from("show_bus_stops")
    .update({ sort_order: a, updated_at: now })
    .eq("id", swapWith.id)
    .eq("business_id", ctx.business.id);
  revalidateShowOps();
}

export async function reorderBusStopsAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("admin", "hotels");
  const island = String(formData.get("island") ?? "").trim();
  const ids = String(formData.get("ordered_ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!island || !ids.length) throw new Error("Stop order required.");
  const now = new Date().toISOString();
  await Promise.all(
    ids.map((id, i) =>
      ctx.supabase
        .from("show_bus_stops")
        .update({ sort_order: (i + 1) * 10, updated_at: now })
        .eq("id", id)
        .eq("business_id", ctx.business.id)
        .eq("island", island),
    ),
  );
  revalidateShowOps();
}

export async function setBookingPickupAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("booker", ["bookings", "lists", "buses"]);
  const bookingId = String(formData.get("booking_id") ?? "").trim();
  const stopId = String(formData.get("pickup_stop_id") ?? "").trim();
  if (!bookingId) throw new Error("Booking required.");

  const { data: booking } = await ctx.supabase
    .from("show_bookings")
    .select("id,cancelled_at,transport_required,pickup_kind")
    .eq("id", bookingId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!booking) throw new Error("Booking not found.");
  if (booking.cancelled_at) throw new Error("Cancelled bookings stay off the bus list.");
  // The quick setter moves an existing bus passenger between stops. Putting an own-way or
  // private-pickup guest on a bus changes what they pay, so that goes through Edit booking.
  if (stopId && (!booking.transport_required || (booking.pickup_kind && booking.pickup_kind !== "bus"))) {
    throw new Error("This booking has no bus. Use Edit booking to add transport so the price and supplement update.");
  }

  if (!stopId) {
    await ctx.supabase
      .from("show_bookings")
      .update({
        pickup_stop_id: null,
        pickup_stop_name: null,
        pickup_time: null,
        updated_at: new Date().toISOString(),
        updated_by: ctx.user.id,
      })
      .eq("id", bookingId)
      .eq("business_id", ctx.business.id);
    revalidateShowOps();
    return;
  }

  const { data: stop } = await ctx.supabase
    .from("show_bus_stops")
    .select("id,resort,stop_name,pickup_time")
    .eq("id", stopId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!stop) throw new Error("Stop not found — nothing was deleted.");

  await ctx.supabase
    .from("show_bookings")
    .update({
      pickup_stop_id: stop.id,
      pickup_stop_name: `${stop.resort} · ${stop.stop_name}`,
      pickup_time: stop.pickup_time,
      transport_required: true,
      updated_at: new Date().toISOString(),
      updated_by: ctx.user.id,
    })
    .eq("id", bookingId)
    .eq("business_id", ctx.business.id);
  revalidateShowOps();
}

export async function markListFlagAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("booker", ["door", "lists"]);
  const bookingId = String(formData.get("booking_id") ?? "").trim();
  const flag = String(formData.get("flag") ?? "").trim();
  if (!bookingId) throw new Error("Booking required.");

  const { data: booking } = await ctx.supabase
    .from("show_bookings")
    .select("id,legacy_id,cancelled_at,arrived_at,arrived_pax,door_pay_method,no_show,billing_mode,total_cost,balance_remaining,adults,children,infants,supplier_id,invoice_id,no_show_charge")
    .eq("id", bookingId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!booking) throw new Error("Booking not found.");
  if (booking.cancelled_at) throw new Error("This booking is cancelled.");

  const now = new Date().toISOString();
  const booked = paxTotal(booking.adults, booking.children, booking.infants);
  const patch: Record<string, unknown> = {
    updated_at: now,
    updated_by: ctx.user.id,
    list_checked_by: ctx.user.id,
  };
  if (flag === "arrived") {
    const turningOn = !booking.arrived_at;
    Object.assign(patch, arrivalFlagPatch(turningOn ? booked : null, booked, now, turningOn ? booking.arrived_at : null));
  } else if (flag === "cash" || flag === "card") {
    if (booking.billing_mode === "deposit" && booking.door_pay_method) {
      throw new Error("A recorded payment cannot be undone or relabelled here. Ask finance to reconcile the receipt.");
    }
    const turningOn = booking.door_pay_method !== flag;
    patch.door_pay_method = turningOn ? flag : null;
    if (turningOn && !booking.no_show) patch.arrived_at = booking.arrived_at || now;
    if (turningOn && booking.billing_mode === "deposit") {
      // Ledger plus the imported opening balance — a paid-in-Lanzasoft guest owes the remainder, not the full ticket.
      const paidSum = await paidOnBooking(ctx.supabase, booking);
      const { balance: outstanding } = paymentStatusAfter(Number(booking.total_cost), paidSum);
      if (outstanding <= 0) throw new Error("Nothing due on this booking.");
      if (outstanding > 0) {
        const { error: payErr } = await ctx.supabase.from("show_booking_payments").insert({
          business_id: ctx.business.id,
          booking_id: bookingId,
          amount: outstanding,
          method: flag,
          created_by: ctx.user.id,
          note: flag === "cash" ? "Door · paid cash" : "Door · paid card",
        });
        if (payErr) throw new Error(payErr.message);
        const { error: summaryError } = await ctx.supabase
          .from("show_bookings")
          .update({
            door_pay_method: flag,
            arrived_at: booking.arrived_at || now,
            updated_at: now,
            updated_by: ctx.user.id,
            list_checked_by: ctx.user.id,
          })
          .eq("id", bookingId)
          .eq("business_id", ctx.business.id);
        if (summaryError) throw new Error("Payment recorded, but the door status could not be saved. Refresh before retrying.");
        revalidateShowOps();
        return;
      }
    }
  } else if (flag === "no_show") {
    const turningOn = !booking.no_show;
    Object.assign(patch, arrivalFlagPatch(turningOn ? 0 : null, booked, now, booking.arrived_at));
  } else throw new Error("Unknown list action.");

  const arrivedAfter =
    typeof patch.arrived_pax === "number" || patch.arrived_pax === null
      ? (patch.arrived_pax as number | null)
      : booking.arrived_pax;
  Object.assign(patch, await arrivalNoShowDecisionPatch(ctx, booking, arrivedAfter, booked, now));

  const { error } = await ctx.supabase
    .from("show_bookings")
    .update(patch)
    .eq("id", bookingId)
    .eq("business_id", ctx.business.id);
  if (error) throw new Error(error.message);
  revalidateShowOps();
}

export async function markArrivedPaxAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("booker", ["bookings", "door", "lists"]);
  const bookingId = String(formData.get("booking_id") ?? "").trim();
  const intent = String(formData.get("intent") ?? "count").trim() || "count";
  if (!bookingId) throw new Error("Booking required.");

  const { data: booking } = await ctx.supabase
    .from("show_bookings")
    .select("id,cancelled_at,arrived_at,adults,children,infants,supplier_id,invoice_id,no_show_charge")
    .eq("id", bookingId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!booking) throw new Error("Booking not found.");
  if (booking.cancelled_at) throw new Error("This booking is cancelled.");

  const booked = paxTotal(booking.adults, booking.children, booking.infants);
  let arrived: number | null = null;
  if (intent === "clear") arrived = null;
  else if (intent === "all") arrived = booked;
  else if (intent === "none") arrived = 0;
  else {
    const parsed = parsePaxCount(formData.get("arrived_pax"), "How many showed");
    if (!parsed.ok) throw new Error(parsed.error);
    if (parsed.value > booked) {
      throw new Error(`Only ${booked} people are booked on this ticket.`);
    }
    arrived = parsed.value;
  }

  const now = new Date().toISOString();
  const flags = arrivalFlagPatch(arrived, booked, now, booking.arrived_at);
  const decision = await arrivalNoShowDecisionPatch(ctx, booking, arrived, booked, now);
  const { error } = await ctx.supabase
    .from("show_bookings")
    .update({
      ...flags,
      ...decision,
      updated_at: now,
      updated_by: ctx.user.id,
      list_checked_by: ctx.user.id,
    })
    .eq("id", bookingId)
    .eq("business_id", ctx.business.id);
  if (error) throw new Error(error.message);
  revalidateShowOps();
}

export async function markArrivedPaxAllAction(formData: FormData): Promise<void> {
  formData.set("intent", "all");
  return markArrivedPaxAction(formData);
}

export async function markArrivedPaxNoneAction(formData: FormData): Promise<void> {
  formData.set("intent", "none");
  return markArrivedPaxAction(formData);
}

export async function markArrivedPaxClearAction(formData: FormData): Promise<void> {
  formData.set("intent", "clear");
  return markArrivedPaxAction(formData);
}

export async function markArrivedPaxCountAction(formData: FormData): Promise<void> {
  formData.set("intent", "count");
  return markArrivedPaxAction(formData);
}

async function arrivalNoShowDecisionPatch(
  ctx: Awaited<ReturnType<typeof requireShowOpsContext>>,
  booking: {
    supplier_id?: string | null;
    invoice_id?: string | null;
    no_show_charge?: string | null;
  },
  arrived: number | null,
  booked: number,
  now: string,
): Promise<Record<string, unknown>> {
  if (arrived == null || booked - arrived <= 0) {
    return {
      no_show_charge: null,
      no_show_decided_at: null,
      no_show_decided_by: null,
    };
  }
  if (booking.invoice_id) return {};
  if (booking.no_show_charge === "charge" || booking.no_show_charge === "write_off") return {};
  let policy: string | null = null;
  if (booking.supplier_id) {
    const { data } = await ctx.supabase
      .from("show_suppliers")
      .select("no_show_policy")
      .eq("id", booking.supplier_id)
      .eq("business_id", ctx.business.id)
      .maybeSingle();
    policy = (data as { no_show_policy?: string | null } | null)?.no_show_policy ?? null;
  }
  return {
    no_show_charge: resolveNoShowCharge(null, policy),
    no_show_decided_at: now,
    no_show_decided_by: ctx.user.id,
  };
}

export async function decideNoShowChargeAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("booker", ["bookings", "door", "lists"]);
  const bookingId = String(formData.get("booking_id") ?? "").trim();
  const charge = resolveNoShowCharge(String(formData.get("charge") ?? ""), null);
  if (!bookingId) throw new Error("Booking required.");

  const { data: booking } = await ctx.supabase
    .from("show_bookings")
    .select("id,cancelled_at,invoice_id,adults,children,infants,arrived_pax,arrived_at,no_show")
    .eq("id", bookingId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!booking) throw new Error("Booking not found.");
  if (booking.cancelled_at) throw new Error("This booking is cancelled.");
  if (booking.invoice_id) throw new Error("Void the invoice pack before changing this.");

  const arrival = resolveArrivedPax({
    adults: booking.adults,
    children: booking.children,
    infants: booking.infants,
    arrivedPax: booking.arrived_pax,
    arrivedAt: booking.arrived_at,
    noShow: booking.no_show,
  });
  if (arrival.arrived == null || arrival.arrived >= arrival.booked) {
    throw new Error("Mark who showed first — there is no missing pax to charge or write off.");
  }

  const now = new Date().toISOString();
  const { error } = await ctx.supabase
    .from("show_bookings")
    .update({
      no_show_charge: charge,
      no_show_decided_at: now,
      no_show_decided_by: ctx.user.id,
      updated_at: now,
      updated_by: ctx.user.id,
      list_checked_by: ctx.user.id,
    })
    .eq("id", bookingId)
    .eq("business_id", ctx.business.id);
  if (error) throw new Error(error.message);
  revalidateShowOps();
}

const NO_SHOW_PROOF_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export async function uploadNoShowProofAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("booker", ["bookings", "door", "lists"]);
  const bookingId = String(formData.get("booking_id") ?? "").trim();
  const file = formData.get("proof");
  if (!bookingId) throw new Error("Booking required.");
  if (!(file instanceof File) || file.size < 1) throw new Error("Choose a ticket photo.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Photo must be 5 MB or smaller.");
  const ext = NO_SHOW_PROOF_TYPES[file.type];
  if (!ext) throw new Error("Use a JPEG, PNG, or HEIC photo.");

  const { data: booking } = await ctx.supabase
    .from("show_bookings")
    .select("id,cancelled_at")
    .eq("id", bookingId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!booking) throw new Error("Booking not found.");
  if (booking.cancelled_at) throw new Error("This booking is cancelled.");

  const path = `${ctx.business.id}/${bookingId}/${crypto.randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await ctx.supabase.storage.from("show-ops-proofs").upload(path, buf, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) throw new Error(upErr.message);

  const now = new Date().toISOString();
  const { error } = await ctx.supabase
    .from("show_bookings")
    .update({
      no_show_proof_path: path,
      updated_at: now,
      updated_by: ctx.user.id,
    })
    .eq("id", bookingId)
    .eq("business_id", ctx.business.id);
  if (error) throw new Error(error.message);
  revalidateShowOps();
}

export async function upsertHotelAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("admin", "hotels");
  const tab = masterTabFromForm(formData, "hotels");
  const id = String(formData.get("id") ?? "").trim();
  const row = {
    business_id: ctx.business.id,
    name: String(formData.get("name") ?? "").trim(),
    island: String(formData.get("island") ?? "").trim(),
    bus_stop_id: String(formData.get("bus_stop_id") ?? "").trim() || null,
    active: String(formData.get("active") ?? "1") === "1",
    updated_at: new Date().toISOString(),
  };
  if (!row.name || !row.island) redirectMaster(tab, { error: "Hotel name and island required." });
  if (id) {
    const { error } = await ctx.supabase.from("show_hotels").update(row).eq("id", id).eq("business_id", ctx.business.id);
    if (error) redirectMaster(tab, { error: error.message });
    revalidateShowOps();
    redirectMaster(tab, { saved: "1", created: id });
  }
  const { data, error } = await ctx.supabase.from("show_hotels").insert(row).select("id").single();
  if (error) redirectMaster(tab, { error: error.message });
  revalidateShowOps();
  redirectMaster(tab, { saved: "1", created: data?.id });
}

/**
 * Joel: "delete option" on shows and partners. Only rows that nothing points
 * at can go — a show or partner with bookings, prices or invoices stays and
 * gets switched off instead, so history never loses its labels.
 */
export async function deleteProductAction(productId: string, formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("admin", "shows");
  const tab = masterTabFromForm(formData, "shows");
  const id = productId.trim();
  if (!id) redirectMaster(tab, { error: "Show required." });
  const { count } = await ctx.supabase
    .from("show_bookings")
    .select("id", { count: "exact", head: true })
    .eq("business_id", ctx.business.id)
    .eq("product_id", id);
  if ((count ?? 0) > 0) {
    redirectMaster(tab, { error: `This show has ${count} booking${count === 1 ? "" : "s"} against it — untick Active instead of deleting.` });
  }
  await ctx.supabase.from("show_rate_prices").delete().eq("business_id", ctx.business.id).eq("product_id", id);
  const { error } = await ctx.supabase.from("show_products").delete().eq("business_id", ctx.business.id).eq("id", id);
  if (error) redirectMaster(tab, { error: error.message });
  revalidateShowOps();
  redirectMaster(tab, { saved: "1" });
}

export async function deleteSupplierAction(supplierId: string, formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("admin", "partners");
  const tab = masterTabFromForm(formData, "partners");
  const id = supplierId.trim();
  if (!id) redirectMaster(tab, { error: "Partner required." });
  const [{ count: bookings }, { count: invoices }] = await Promise.all([
    ctx.supabase.from("show_bookings").select("id", { count: "exact", head: true }).eq("business_id", ctx.business.id).eq("supplier_id", id),
    ctx.supabase.from("show_invoices").select("id", { count: "exact", head: true }).eq("business_id", ctx.business.id).eq("supplier_id", id),
  ]);
  if ((bookings ?? 0) > 0 || (invoices ?? 0) > 0) {
    redirectMaster(tab, {
      error: `This partner has ${bookings ?? 0} booking${bookings === 1 ? "" : "s"} and ${invoices ?? 0} invoice${invoices === 1 ? "" : "s"} — untick Active instead of deleting.`,
    });
  }
  await ctx.supabase.from("show_ops_members").update({ supplier_id: null }).eq("business_id", ctx.business.id).eq("supplier_id", id);
  const { error } = await ctx.supabase.from("show_suppliers").delete().eq("business_id", ctx.business.id).eq("id", id);
  if (error) redirectMaster(tab, { error: error.message });
  revalidateShowOps();
  redirectMaster(tab, { saved: "1" });
}

export async function upsertBusOrderAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("office", "buses");
  const tab = masterTabFromForm(formData, "hotels");
  const next = safeShowOpsNext(String(formData.get("next") ?? ""));
  const row = {
    business_id: ctx.business.id,
    show_date: String(formData.get("show_date") ?? "").trim(),
    island: String(formData.get("island") ?? "").trim(),
    seats_ordered: Number(formData.get("seats_ordered") ?? 0),
    // How many coaches, not just seats — LPA runs two on a busy night.
    bus_count: Math.max(1, Math.trunc(Number(formData.get("bus_count") ?? 1) || 1)),
    cost_total: Number(formData.get("cost_total") ?? 0),
    notes: String(formData.get("notes") ?? "").trim() || null,
    updated_at: new Date().toISOString(),
    // Only the bus board sends a guide; other forms must not blank it.
    ...(formData.has("guide_name") ? { guide_name: String(formData.get("guide_name") ?? "").trim() || null } : {}),
  };
  if (!row.show_date || !row.island) {
    if (next) redirect(`${next}${next.includes("?") ? "&" : "?"}error=${encodeURIComponent("Date and island required.")}`);
    redirectMaster(tab, { error: "Date and island required." });
  }
  const { data, error } = await ctx.supabase
    .from("show_bus_orders")
    .upsert(row, {
      onConflict: "business_id,show_date,island",
    })
    .select("id")
    .single();
  if (error) {
    if (next) redirect(`${next}${next.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message.slice(0, 180))}`);
    redirectMaster(tab, { error: error.message });
  }
  revalidateShowOps();
  if (next) {
    const joiner = next.includes("?") ? "&" : "?";
    redirect(`${next}${joiner}saved=1`);
  }
  redirectMaster(tab, { saved: "1", created: data?.id });
}

async function buildBookingFields(
  ctx: Awaited<ReturnType<typeof requireShowOpsContext>>,
  formData: FormData,
  existingTicketTypeId?: string | null,
  existingTransport?: { product_id: string | null; ticket_type_id: string | null; transport_required: boolean; extras_snapshot?: unknown; adults?: number; children?: number; infants?: number; supplier_id?: string | null; billing_mode?: string },
) {
  const supplierId = String(formData.get("supplier_id") ?? "").trim() || null;
  const productId = String(formData.get("product_id") ?? "").trim() || null;
  const ticketTypeId = String(formData.get("ticket_type_id") ?? "").trim() || null;
  const hotelId = String(formData.get("hotel_id") ?? "").trim() || null;
  const adultsParsed = parsePaxCount(formData.get("adults") ?? 0, "Adults");
  const childrenParsed = parsePaxCount(formData.get("children") ?? 0, "Children");
  const infantsParsed = parsePaxCount(formData.get("infants") ?? 0, "Infants");
  if (!adultsParsed.ok) return { ok: false as const, error: adultsParsed.error };
  if (!childrenParsed.ok) return { ok: false as const, error: childrenParsed.error };
  if (!infantsParsed.ok) return { ok: false as const, error: infantsParsed.error };
  const adults = adultsParsed.value;
  const children = childrenParsed.value;
  const infants = infantsParsed.value;
  if (adults + children + infants < 1) {
    return { ok: false as const, error: "Need at least one guest." };
  }
  // Bus / Private / Own way. Old forms only send transport_required — honour that.
  const pickupKind = parsePickupKind(formData.get("pickup_kind"), String(formData.get("transport_required") ?? "") === "1");
  const transport = pickupKind === "bus";
  const dietary = String(formData.get("dietary_required") ?? "") === "1";

  const [{ data: supplier }, { data: baseProduct }, { data: hotel }] = await Promise.all([
    supplierId
      ? ctx.supabase.from("show_suppliers").select("*").eq("id", supplierId).eq("business_id", ctx.business.id).maybeSingle()
      : Promise.resolve({ data: null }),
    productId
      ? ctx.supabase.from("show_products").select("*").eq("id", productId).eq("business_id", ctx.business.id).maybeSingle()
      : Promise.resolve({ data: null }),
    hotelId
      ? ctx.supabase.from("show_hotels").select("*").eq("id", hotelId).eq("business_id", ctx.business.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let ticketType: ShowTicketType | null = null;
  if (ticketTypeId) {
    const { data, error } = await ctx.supabase.from("show_ticket_types").select("*")
      .eq("id", ticketTypeId).eq("business_id", ctx.business.id).eq("product_id", productId ?? "").maybeSingle();
    if (error || !data || (!data.active && ticketTypeId !== existingTicketTypeId)) {
      return { ok: false as const, error: "This ticket type is unavailable for the selected show. Choose an active ticket type." };
    }
    ticketType = data as ShowTicketType;
  }
  const product = baseProduct ? applyTicketType(baseProduct as import("@/lib/show-ops/types").ShowProduct, ticketType) : null;

  const show_date = String(formData.get("show_date") ?? "").trim();
  const guest_name = String(formData.get("guest_name") ?? "").trim();
  if (!show_date || !guest_name) return { ok: false as const, error: "Guest name and show date required." };
  if (!product) return { ok: false as const, error: "Select a show / ticket product." };

  if (transport && !ticketTransportAvailable(product.transport_available, productId, ticketTypeId, existingTransport)) {
    return { ok: false as const, error: "This show does not include transport." };
  }

  let pickup_stop_id: string | null = null;
  let pickup_stop_name: string | null = null;
  let pickup_time: string | null = null;
  if (transport) {
    const overrideStop = String(formData.get("pickup_stop_id") ?? "").trim();
    const stopId = overrideStop || hotel?.bus_stop_id || "";
    if (!stopId) {
      return { ok: false as const, error: "Transport needs a pickup stop — pick one or set it on the hotel." };
    }
    const { data: stop } = await ctx.supabase
      .from("show_bus_stops")
      .select("*")
      .eq("id", stopId)
      .eq("business_id", ctx.business.id)
      .maybeSingle();
    if (!stop) {
      return { ok: false as const, error: "That pickup stop is missing — pick another. The stop list itself is not deleted." };
    }
    pickup_stop_id = stop.id;
    pickup_stop_name = `${stop.resort} · ${stop.stop_name}`;
    pickup_time = stop.pickup_time;
  }

  // Private transfer: no stop, no time. The Office list, Door and desk all print
  // pickup_stop_name, so the "Private PDC · Villa" wording lives in that column.
  let private_accommodation: PrivateAccommodation | null = null;
  let private_zone: string | null = null;
  if (pickupKind === "private") {
    private_accommodation = parsePrivateAccommodation(formData.get("private_accommodation"));
    private_zone = normaliseZone(formData.get("private_zone"));
    pickup_stop_name = privatePickupLabel(private_zone, private_accommodation);
  }

  /*
   * Deposit or invoice. The partner record decides unless the operator has ticked
   * "let the desk pick" on that partner — a form field alone must never be able
   * to move a booking off the billing its partner is set up for.
   */
  const requestedBilling = String(formData.get("billing_mode") ?? "").trim();
  const billingMode =
    supplier?.can_choose_billing_mode && (requestedBilling === "deposit" || requestedBilling === "invoice")
      ? (requestedBilling as ShowOpsBillingMode)
      : undefined;

  let extras: ExtraSnapshot[];
  try {
    const selection = parseExtraSelections(formData.get("extras") ?? "[]");
    const historical = existingTransport?.product_id === productId && Array.isArray(existingTransport.extras_snapshot) ? existingTransport.extras_snapshot as ExtraSnapshot[] : [];
    const historicalSelection = historical.map((line) => ({ id: line.id, quantity: line.charge_basis === "quantity" ? line.quantity : 1 }));
    const preserveExtras = existingTransport
      && existingTransport.product_id === productId && existingTransport.ticket_type_id === ticketTypeId
      && existingTransport.supplier_id === supplierId && existingTransport.adults === adults
      && existingTransport.children === children && existingTransport.infants === infants
      && existingTransport.transport_required === transport
      && existingTransport.billing_mode === (billingMode ?? supplier?.billing_mode ?? "deposit")
      && sameExtraSelection(selection, historicalSelection);
    if (preserveExtras) {
      extras = historical;
    } else {
      const { data: catalogue, error: extrasError } = selection.length
        ? await ctx.supabase.from("show_extras").select("*").eq("business_id", ctx.business.id).eq("product_id", productId ?? "").in("id", selection.map((line) => line.id))
        : { data: [], error: null };
      if (extrasError) throw new Error("Could not load extras. Please retry.");
      extras = calculateExtras((catalogue ?? []) as ShowExtra[], selection, adults + children + infants, Number(supplier?.invoice_nett_percent ?? 100), { allowArchived: true });
      for (const line of extras) {
        if (!(catalogue ?? []).find((item) => item.id === line.id)?.active && !historical.some((old) => old.id === line.id && old.quantity === line.quantity)) throw new Error("An archived extra cannot be newly selected or changed.");
      }
    }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Invalid extras." };
  }

  const money = computeBookingMoney({
    adults,
    children,
    infants,
    extras,
    product: product as never,
    supplier: supplier as never,
    billingMode,
    transportRequired: transport,
    transportSupplement: ctx.config.transport_supplement,
  });

  // Per-attendee rows (name/type/note) — drives special-meal and door lists.
  const attendees: Array<{ name: string; type: string; note: string }> = [];
  for (let i = 0; i < adults + children + infants && i < 20; i += 1) {
    const name = String(formData.get(`attendee_name_${i}`) ?? "").trim();
    const note = String(formData.get(`attendee_note_${i}`) ?? "").trim();
    const type = i < adults ? "adult" : i < adults + children ? "child" : "infant";
    if (name || note) attendees.push({ name, type, note });
  }

  const custom_answers: Record<string, string | boolean | number> = {};
  for (const q of ctx.config.booking_questions) {
    const key = `cq_${q.id}`;
    if (q.type === "checkbox") {
      custom_answers[q.id] = String(formData.get(key) ?? "") === "1";
      if (q.required && !custom_answers[q.id]) {
        return { ok: false as const, error: `${q.label} is required.` };
      }
      continue;
    }
    const raw = String(formData.get(key) ?? "").trim();
    if (q.required && !raw) {
      return { ok: false as const, error: `${q.label} is required.` };
    }
    if (q.type === "number" && raw) {
      custom_answers[q.id] = Number(raw);
    } else if (raw) {
      custom_answers[q.id] = raw;
    }
  }

  const channelRaw = String(formData.get("sales_channel") ?? "direct").trim() || "direct";
  const sales_channel = channelRaw as ShowOpsSalesChannel;

  let dietary_notes: string | null = null;
  if (dietary) {
    if (ctx.config.dietary_mode === "options") {
      const picked = formData.getAll("dietary_option").map(String).filter(Boolean);
      const extra = String(formData.get("dietary_notes") ?? "").trim();
      dietary_notes = [...picked, extra].filter(Boolean).join("; ") || null;
    } else {
      dietary_notes = String(formData.get("dietary_notes") ?? "").trim() || null;
    }
  }

  return {
    ok: true as const,
    fields: {
      show_date,
      guest_name,
      guest_mobile: String(formData.get("guest_mobile") ?? "").trim() || null,
      guest_email: String(formData.get("guest_email") ?? "").trim() || null,
      hotel_id: hotelId,
      hotel_name: (hotel?.name ?? String(formData.get("hotel_name") ?? "").trim()) || null,
      transport_required: transport,
      pickup_kind: pickupKind,
      private_accommodation,
      private_zone,
      pickup_stop_id,
      pickup_stop_name,
      pickup_time,
      dietary_required: dietary,
      dietary_notes,
      supplier_id: supplierId,
      supplier_name: supplier?.name ?? null,
      billing_mode: money.billing_mode,
      product_id: productId,
      ticket_type_id: ticketTypeId,
      ticket_type_name: ticketType?.name ?? null,
      show_name: product.name,
      island: product.island,
      adults,
      children,
      infants,
      total_cost: money.total_cost,
      deposit_amount: money.deposit_amount,
      balance_remaining: money.balance_remaining,
      nett_total: money.nett_total,
      adult_nett_total: money.adult_nett_total,
      child_nett_total: money.child_nett_total,
      supplier_ticket_number: String(formData.get("supplier_ticket_number") ?? "").trim() || null,
      office_comments: String(formData.get("office_comments") ?? "").trim() || null,
      office_only_comments: String(formData.get("office_only_comments") ?? "").trim() || null,
      sales_channel,
      payment_method: parseShowOpsPaymentMethod(formData.get("payment_method")),
      custom_answers,
      attendees: attendees.length ? attendees : null,
      payment_status: money.payment_status,
      // Freeze the rates behind these numbers. Editing a partner nett or a show
      // price later must not move money on a booking already taken.
      extras_snapshot: extras,
      infant_nett_total: money.infant_nett_total,
      pricing_snapshot: { ...money.pricing_snapshot, priced_at: new Date().toISOString() },
      updated_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    },
  };
}

/**
 * The "Send the guest their ticket" box is on the staff, seller and partner-link
 * forms alike; every create path honours it the same way. Never blocks the booking.
 */
async function sendGuestTicketIfRequested(
  formData: FormData,
  ctx: { branding: { displayName: string }; config: ShowOpsConfig },
  f: Record<string, unknown>,
  booking_ref: string,
  token: string | null,
): Promise<void> {
  if (String(formData.get("send_ticket") ?? "") !== "1") return;
  try {
    await sendGuestTicket({
      merchantName: ctx.branding.displayName,
      bookingRef: booking_ref,
      guestName: String(f.guest_name ?? ""),
      guestEmail: (f.guest_email as string | null) ?? null,
      guestMobile: (f.guest_mobile as string | null) ?? null,
      showName: String(f.show_name ?? ""),
      extrasSummary: bookingExtrasSummary(f.extras_snapshot),
      showDate: String(f.show_date ?? ""),
      adults: Number(f.adults) || 0,
      children: Number(f.children) || 0,
      infants: Number(f.infants) || 0,
      hotelName: (f.hotel_name as string | null) ?? null,
      transportRequired: Boolean(f.transport_required),
      pickupStopName: (f.pickup_stop_name as string | null) ?? null,
      pickupTime: (f.pickup_time as string | null) ?? null,
      billingMode: String(f.billing_mode ?? "deposit"),
      totalCost: f.total_cost == null ? null : Number(f.total_cost),
      depositAmount: f.deposit_amount == null ? null : Number(f.deposit_amount),
      balanceRemaining: f.balance_remaining == null ? null : Number(f.balance_remaining),
      currency: showOpsCurrencyFor(ctx.config, (f as { island?: string | null }).island ?? null),
      dietaryNotes: (f.dietary_notes as string | null) ?? null,
      ticketUrl: token ? showOpsTicketUrl(getDeploymentSiteUrl(), token) : null,
      showTime: (f.ampm as string | null) ?? null,
      pickupKind: (f.pickup_kind as string | null) ?? null,
      privateZone: (f.private_zone as string | null) ?? null,
    });
  } catch (err) {
    console.error("[guest-ticket] send failed for", booking_ref, err instanceof Error ? err.message : err);
  }
}

export async function createBookingAction(
  formData: FormData,
): Promise<{ ok: true; id?: string; message?: string } | { ok: false; message: string }> {
  const ctx = await requireShowOpsAction("booker", "bookings");
  const built = await buildBookingFields(ctx, formData);
  if (!built.ok) return { ok: false, message: built.error };

  type CreatedBooking = { id: string; ticket_token: string | null };
  let booking_ref = "";
  let data = null as CreatedBooking | null;
  for (let attempt = 0; attempt < 5; attempt++) {
    booking_ref = await nextRef(ctx);
    const res = await ctx.supabase
      .from("show_bookings")
      .insert({
        ...built.fields,
        business_id: ctx.business.id,
        booking_ref,
        created_by: ctx.user.id,
      })
      .select("id,ticket_token")
      .maybeSingle();
    if (!res.error) {
      data = res.data as CreatedBooking | null;
      break;
    }
    if (isBookingRefClash(res.error) && attempt < 4) continue;
    return { ok: false, message: res.error.message };
  }

  // Guest ticket by email/SMS on save (opt-out checkbox on the form). Never blocks the booking.
  await sendGuestTicketIfRequested(formData, ctx, built.fields as Record<string, unknown>, booking_ref, data?.ticket_token ? String(data.ticket_token) : null);
  await pushChannelAvailability(ctx.business.id, { productId: built.fields.product_id }, [built.fields.show_date]);

  revalidateShowOps();
  return { ok: true, id: data?.id, message: booking_ref };
}

/**
 * One history row per save that changed something. Never blocks the save —
 * a failed audit line is logged, not surfaced to the desk.
 */
export async function updateBookingAction(
  formData: FormData,
): Promise<{ ok: true; id?: string; message?: string } | { ok: false; message: string }> {
  const ctx = await requireShowOpsAction("booker", "bookings");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "Missing booking id." };

  const { data: existing } = await ctx.supabase
    .from("show_bookings")
    .select(
      "id,legacy_id,booking_ref,payment_status,invoice_id,billing_mode,adults,children,infants,product_id,ticket_type_id,ticket_type_name,supplier_id,transport_required,total_cost,deposit_amount,balance_remaining,nett_total,adult_nett_total,child_nett_total,infant_nett_total,extras_snapshot,cancelled_at,arrived_pax,arrived_at,no_show,guest_name,guest_mobile,guest_email,show_name,show_date,hotel_name,pickup_stop_name,pickup_time,pickup_kind,private_accommodation,private_zone,supplier_name,dietary_required,dietary_notes,office_comments,office_only_comments,payment_method,supplier_ticket_number",
    )
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!existing) return { ok: false, message: "Booking not found." };
  if (existing.cancelled_at) return { ok: false, message: "This booking is cancelled." };

  if (!formData.has("ticket_type_id")) formData.set("ticket_type_id", existing.ticket_type_id ?? "");
  if (!formData.has("extras")) formData.set("extras", JSON.stringify((existing.extras_snapshot ?? []).map((line: ExtraSnapshot) => ({ id: line.id, quantity: line.charge_basis === "quantity" ? line.quantity : 1 }))));
  const built = await buildBookingFields(ctx, formData, existing.ticket_type_id, existing);
  if (!built.ok) return { ok: false, message: built.error };

  const moneyTouched =
    existing.billing_mode !== built.fields.billing_mode ||
    !sameExtraSelection(existing.extras_snapshot ?? [], built.fields.extras_snapshot) ||
    existing.adults !== built.fields.adults ||
    existing.children !== built.fields.children ||
    existing.infants !== built.fields.infants ||
    existing.product_id !== built.fields.product_id ||
    existing.ticket_type_id !== built.fields.ticket_type_id ||
    existing.supplier_id !== built.fields.supplier_id ||
    existing.transport_required !== built.fields.transport_required;

  if (existing.invoice_id && moneyTouched) {
    return {
      ok: false,
      message: "This booking is on an invoice pack — void the invoice first to change pax, show, supplier or transport.",
    };
  }

  let payment_status: "unpaid" | "partial" | "paid" | "n_a" = moneyTouched
    ? built.fields.payment_status
    : (existing.payment_status as "unpaid" | "partial" | "paid" | "n_a");
  let balance_remaining = moneyTouched ? built.fields.balance_remaining : Number(existing.balance_remaining);
  const total_cost = moneyTouched ? built.fields.total_cost : Number(existing.total_cost);
  const deposit_amount = moneyTouched ? built.fields.deposit_amount : Number(existing.deposit_amount);
  const nett_total = moneyTouched ? built.fields.nett_total : Number(existing.nett_total);
  const adult_nett_total = moneyTouched ? built.fields.adult_nett_total : Number(existing.adult_nett_total);
  const child_nett_total = moneyTouched ? built.fields.child_nett_total : Number(existing.child_nett_total);

  if (existing.billing_mode === "deposit" || built.fields.billing_mode === "deposit") {
    // Imported bookings recorded their paid amount on the row with no ledger rows;
    // a note-only edit must never turn "paid 70 of 100" back into "owes 100".
    const paid = await paidOnBooking(ctx.supabase, existing);
    if (paid > 0 && built.fields.billing_mode === "invoice") {
      return { ok: false, message: "This booking already has payments — keep it on deposit or refund first." };
    }
    if (built.fields.billing_mode === "deposit") {
      const next = paymentStatusAfter(total_cost, paid);
      balance_remaining = next.balance;
      payment_status = next.payment_status;
    } else {
      payment_status = "n_a";
      balance_remaining = 0;
    }
  }

  const newBooked = paxTotal(built.fields.adults, built.fields.children, built.fields.infants);
  const arrivalClamp =
    existing.arrived_pax != null && Number(existing.arrived_pax) > newBooked
      ? arrivalFlagPatch(newBooked, newBooked, new Date().toISOString(), existing.arrived_at)
      : null;

  // A comment tweak must not restamp the rates. The snapshot only moves when
  // pax / show / partner / transport moved, which is when the money moved too.
  const { pricing_snapshot: freshSnapshot, ...restFields } = built.fields;

  const patch = {
    ...restFields,
    extras_snapshot: moneyTouched ? restFields.extras_snapshot : existing.extras_snapshot ?? [],
    infant_nett_total: moneyTouched ? restFields.infant_nett_total : Number(existing.infant_nett_total ?? 0),
    ...ticketBookingSnapshotPatch(existing, {
      show_name: restFields.show_name,
      ticket_type_name: restFields.ticket_type_name,
      pricing_snapshot: freshSnapshot,
    }, moneyTouched),
    total_cost,
    deposit_amount,
    nett_total,
    adult_nett_total,
    child_nett_total,
    payment_status,
    balance_remaining,
    ...(arrivalClamp ?? {}),
  };
  const { error } = await ctx.supabase
    .from("show_bookings")
    .update(patch)
    .eq("id", id)
    .eq("business_id", ctx.business.id);
  if (error) return { ok: false, message: error.message };
  for (const productId of new Set([existing.product_id, built.fields.product_id])) {
    await pushChannelAvailability(ctx.business.id, { productId }, [existing.show_date, built.fields.show_date]);
  }
  revalidateShowOps();
  return { ok: true, id, message: existing.booking_ref };
}

export async function cancelBookingAction(
  formData: FormData,
): Promise<{ ok: true; id?: string; message?: string } | { ok: false; message: string }> {
  const ctx = await requireShowOpsAction("office", "bookings");
  const id = String(formData.get("id") ?? "").trim();
  const reason = String(formData.get("cancel_reason") ?? "").trim();
  if (!id) return { ok: false, message: "Missing booking id." };
  if (!reason) return { ok: false, message: "Give a cancel reason." };

  const { data: existing } = await ctx.supabase
    .from("show_bookings")
    .select("id,booking_ref,invoice_id,cancelled_at,product_id,show_date")
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!existing) return { ok: false, message: "Booking not found." };
  if (existing.cancelled_at) return { ok: false, message: "Already cancelled." };
  if (existing.invoice_id) {
    return { ok: false, message: "Void the invoice pack first, then cancel." };
  }

  const { error } = await ctx.supabase
    .from("show_bookings")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: ctx.user.id,
      cancel_reason: reason,
      updated_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("business_id", ctx.business.id);
  if (error) return { ok: false, message: error.message };
  await pushChannelAvailability(ctx.business.id, { productId: existing.product_id }, [existing.show_date ? String(existing.show_date) : null]);
  revalidateShowOps();
  return { ok: true, id, message: existing.booking_ref };
}

/** Form wrapper: resend the ticket, then report back on the booking page. */
export async function resendGuestTicketFormAction(formData: FormData): Promise<void> {
  const id = String(formData.get("booking_id") ?? "").trim();
  const res = await resendGuestTicketAction(formData);
  redirect(
    `/dashboard/show-ops/bookings/${id}?ticket=${res.ok ? "sent" : "failed"}&msg=${encodeURIComponent(res.message)}`,
  );
}

export async function cancelBookingFormAction(formData: FormData): Promise<void> {
  const res = await cancelBookingAction(formData);
  if (!res.ok) throw new Error(res.message);
  redirect("/dashboard/show-ops/bookings?cancelled=1");
}

async function provisionAndEmailSeller(opts: {
  businessId: string; supplierId: string; supplierName: string;
  email: string; merchantName: string; invitedBy?: string;
  ctx: import("@/lib/show-ops/access").ShowOpsContext;
  inviteIslands?: string[] | null;
}): Promise<{ userId: string }> {
  const { createSupabaseServiceRoleClient } = await import("@/lib/supabase/server");
  const { getSiteUrl } = await import("@/lib/site-url");
  const admin = createSupabaseServiceRoleClient();
  return invitePartnerSeller({ ...opts, siteUrl: await getSiteUrl() }, {
    deliveryAllowed: () => filterShowOpsOutboundTo(opts.email).length > 0,
    assertAuthorized: async () => {
      const client = opts.ctx.supabase;
      // Fresh authenticated reads deliberately bypass the request-cached context.
      const { data: owner, error: ownerError } = await client.from("businesses").select("owner_id")
        .eq("id", opts.businessId).maybeSingle();
      if (ownerError) throw new Error("Could not verify invitation permission. Please retry.");
      if (owner?.owner_id === opts.ctx.user.id) { opts.ctx.allowedIslands = null; return; }
      const { data: member, error } = await client.from("show_ops_members")
        .select("role,supplier_id,partner_admin,allowed_islands").eq("business_id", opts.businessId)
        .eq("user_id", opts.ctx.user.id).maybeSingle();
      if (error || !member || !( ["office", "finance", "admin"].includes(member.role)
        || (member.role === "seller" && member.partner_admin === true && member.supplier_id === opts.supplierId))) {
        throw new Error("Your invitation permission has changed. Refresh and ask your administrator for access.");
      }
      opts.ctx.allowedIslands = member.allowed_islands;
    },
    findUser: async (email) => {
      for (let page = 1; ; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw new Error("Could not check the invitation account. Please retry.");
        const hit = data.users.find((u) => u.email?.toLowerCase() === email);
        if (hit) return hit.id;
        if (data.users.length < 200) return null;
      }
    },
    memberships: async (userId) => {
      const { data, error } = await admin.from("show_ops_members")
        .select("business_id,supplier_id,role").eq("user_id", userId);
      if (error) throw new Error("Could not verify organisation membership. Please retry.");
      const { data: owned, error: ownedError } = await admin.from("businesses").select("id").eq("owner_id", userId).limit(1);
      if (ownedError) throw new Error("Could not verify account access. Please retry.");
      if (owned?.length) throw new Error("That email already belongs to a business owner account.");
      return data ?? [];
    },
    generateLink: async (email) => {
      const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
      if (error || !data.user || !data.properties?.hashed_token) throw new Error("Could not create a sign-in link. Please retry.");
      const verificationType: string = data.properties.verification_type;
      if (verificationType !== "signup" && verificationType !== "email" && verificationType !== "magiclink") {
        throw new Error("Could not create the expected sign-in link. Please retry.");
      }
      return { userId: data.user.id, tokenHash: data.properties.hashed_token, verificationType };
    },
    addMember: async (userId) => {
      const { error } = await opts.ctx.supabase.from("show_ops_members").insert({
        business_id: opts.businessId, user_id: userId, role: "seller", supplier_id: opts.supplierId, partner_admin: false, allowed_islands: opts.inviteIslands === undefined ? opts.ctx.allowedIslands : opts.inviteIslands,
      });
      if (error) throw new Error("Could not add the seller. Please retry or ask the office to check their existing access.");
    },
    send: (loginUrl) => sendShowOpsSellerInviteEmail({
      to: opts.email, sellerName: opts.supplierName, merchantName: opts.merchantName,
      loginUrl, email: opts.email, invitedBy: opts.invitedBy,
    }),
  });
}

export async function inviteSellerPortalAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsRole("office");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const supplierId = String(formData.get("supplier_id") ?? "").trim();
  if (!email || !email.includes("@")) throw new Error("Seller email required.");
  if (!supplierId) throw new Error("Pick a supplier / partner.");

  const { data: supplier } = await ctx.supabase
    .from("show_suppliers")
    .select("id,name")
    .eq("id", supplierId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!supplier) throw new Error("Supplier not found.");

  try {
    await provisionAndEmailSeller({
      ctx,
      inviteIslands: isGlobalShowOpsAdmin(ctx.role, ctx.allowedIslands) ? parseMemberIslands(formData, ctx.config.islands) : undefined,
      businessId: ctx.business.id, supplierId: supplier.id, supplierName: supplier.name,
      email, merchantName: ctx.branding.displayName,
    });
  } catch (error) {
    redirect(`/dashboard/show-ops/settings?seller_error=${encodeURIComponent(error instanceof Error ? error.message : "Invitation not sent. Please retry.")}`);
  }

  revalidateShowOps();
  redirect("/dashboard/show-ops/settings?seller=sent");
}

/**
 * "Email link" on a partner row: sends the partner's private booking link to their
 * invoice address. No account, no password — the link identifies them. Held in
 * test mode unless the address is on the outbound allowlist.
 */
export async function sendPartnerLinkAction(
  formData: FormData,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  try {
    const ctx = await requireShowOpsRole("office");
    const supplierId = String(formData.get("supplier_id") ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(supplierId)) return { ok: false, message: "Pick a partner first." };
    const { data: supplier, error } = await ctx.supabase
      .from("show_suppliers")
      .select("id,name,email,booking_token")
      .eq("id", supplierId)
      .eq("business_id", ctx.business.id)
      .maybeSingle();
    if (error || !supplier) return { ok: false, message: "Partner not found. Refresh and try again." };
    const email = String(supplier.email ?? "").trim().toLowerCase();
    if (!email.includes("@")) return { ok: false, message: "Add an invoice email to this partner first, then send the link." };
    if (!isPartnerLinkToken(supplier.booking_token)) return { ok: false, message: "This partner has no booking link yet. Save the partner once and try again." };
    if (!filterShowOpsOutboundTo(email).length) {
      return { ok: false, message: `Not sent: Show Ops is in test mode and ${email} is not on the allowlist.` };
    }
    const { getSiteUrl } = await import("@/lib/site-url");
    const sent = await sendShowOpsPartnerLinkEmail({
      to: email, partnerName: supplier.name, merchantName: ctx.branding.displayName,
      linkUrl: partnerLinkUrl(await getSiteUrl(), supplier.booking_token),
    });
    if (!sent.ok) return { ok: false, message: `Not sent: ${sent.message || "email delivery failed."}` };
    return { ok: true, message: `Booking link emailed to ${email}.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Link not sent. Please retry." };
  }
}

/**
 * Context for a booking made through a partner link: the service role stands in
 * for the session, scoped to the partner the token resolves to.
 */
export async function partnerLinkContext(token: unknown) {
  if (!isPartnerLinkToken(token)) return null;
  const { createSupabaseServiceRoleClient } = await import("@/lib/supabase/server");
  const admin = createSupabaseServiceRoleClient();
  const { data: supplier } = await admin.from("show_suppliers").select("*").eq("booking_token", token).eq("active", true).maybeSingle();
  if (!supplier) return null;
  const { data: business } = await admin.from("businesses").select(
    "id,name,owner_id,show_ops_enabled,show_ops_config,show_ops_billing_tier,show_ops_display_name,show_ops_logo_url,show_ops_primary_color,show_ops_accent_color,show_ops_custom_domain,logo_url,stripe_connect_account_id,stripe_connect_charges_enabled",
  ).eq("id", supplier.business_id).maybeSingle();
  if (!business || !business.show_ops_enabled) return null;
  const config = parseShowOpsConfig(business.show_ops_config);
  const ctx = {
    supabase: admin,
    user: { id: "partner-link" },
    business,
    config,
    branding: brandingFromBusiness(business),
    tier: (business.show_ops_billing_tier || "starter") as ShowOpsBillingTier,
    role: "seller" as const,
    isOwner: false,
    allowedPages: null,
    allowedIslands: null,
  } as unknown as Awaited<ReturnType<typeof requireShowOpsContext>>;
  return { ctx, supplier, admin };
}

/** Booking made through a partner link. The token, not a login, decides the partner. */
export async function createPartnerLinkBookingAction(
  formData: FormData,
): Promise<{ ok: true; id?: string; message?: string } | { ok: false; message: string }> {
  const link = await partnerLinkContext(formData.get("partner_token"));
  if (!link) return { ok: false, message: "This booking link is no longer valid. Ask the office for a new one." };
  const { ctx, supplier } = link;
  formData.set("supplier_id", supplier.id);
  formData.set("sales_channel", supplier.partner_type || "partner");
  formData.delete("office_only_comments");
  const built = await buildBookingFields(ctx, formData);
  if (!built.ok) {
    console.error("[partner-link] booking fields rejected:", supplier.id, built.error);
    return { ok: false, message: built.error };
  }
  if (built.fields.supplier_id !== supplier.id) return { ok: false, message: "You can only book as your company." };

  const { data: closes } = await ctx.supabase
    .from("show_night_closes")
    .select("show_date,island,product_id,close_kind")
    .eq("business_id", ctx.business.id)
    .eq("show_date", built.fields.show_date)
    .eq("island", built.fields.island);
  if (saleBlockedForPartner((closes ?? []) as never, { showDate: built.fields.show_date, island: built.fields.island, productId: built.fields.product_id })) {
    return { ok: false, message: "This night is fully closed — ring the office if you still need to add someone." };
  }

  const series = bookingRefSeries(ctx.config);
  const id = crypto.randomUUID();
  for (let attempt = 0; attempt < 5; attempt++) {
    const booking_ref = await nextBookingRefWithoutSession(ctx.supabase as never, ctx.business.id, series);
    const { error } = await ctx.supabase.rpc("show_ops_create_partner_link_booking", {
      p_token: String(formData.get("partner_token")),
      p_booking: {
        ...built.fields,
        id,
        business_id: ctx.business.id,
        booking_ref,
        created_by: null,
        updated_by: null,
      },
    });
    if (!error) {
      const { data: created } = await ctx.supabase.from("show_bookings").select("ticket_token").eq("id", id).maybeSingle();
      await sendGuestTicketIfRequested(formData, ctx, built.fields as Record<string, unknown>, booking_ref, created?.ticket_token ? String(created.ticket_token) : null);
      await pushChannelAvailability(ctx.business.id, { productId: built.fields.product_id }, [built.fields.show_date]);
      revalidatePath(`/p/${String(formData.get("partner_token"))}`);
      revalidateShowOps();
      return { ok: true, id, message: booking_ref };
    }
    if (!isUniqueViolation(error)) {
      console.error("[partner-link] booking insert failed:", supplier.id, booking_ref, error.code, error.message, error.details ?? "");
      return { ok: false, message: partnerBookingErrorMessage(error) };
    }
  }
  console.error("[partner-link] booking ref contention after 5 attempts:", supplier.id);
  return { ok: false, message: "The desk is busy right now — please try again in a moment." };
}

export async function inviteSellerColleagueAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const ctx = await requirePartnerAdmin();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Type a valid email." };
    if (email === ctx.user.email?.toLowerCase()) return { ok: false, message: "That is already your login." };
    await provisionAndEmailSeller({
      ctx,
      businessId: ctx.business.id, supplierId: ctx.supplier.id, supplierName: ctx.supplier.name,
      email, merchantName: ctx.branding.displayName, invitedBy: ctx.user.email || ctx.supplier.name,
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Invitation not sent. Please retry." };
  }
  revalidatePath("/partner/team");
  revalidateShowOps();
  return { ok: true };
}

export async function removeSellerColleagueAction(formData: FormData): Promise<void> {
  const ctx = await requirePartnerAdmin();
  const memberId = String(formData.get("member_id") ?? "").trim();
  if (!memberId) throw new Error("Person required.");
  // The authenticated client keeps the database admin guard authoritative during concurrent revocation.
  const { data: row, error: lookupError } = await ctx.supabase.from("show_ops_members")
    .select("id,business_id,user_id,role,supplier_id,partner_admin")
    .eq("id", memberId).eq("business_id", ctx.business.id).maybeSingle();
  if (lookupError) throw new Error("Could not check this seller.");
  assertRemovableSeller({ businessId: ctx.business.id, supplierId: ctx.supplier.id, userId: ctx.user.id }, row);
  const { data, error } = await ctx.supabase.from("show_ops_members").delete()
    .eq("id", memberId).eq("business_id", ctx.business.id).eq("supplier_id", ctx.supplier.id)
    .eq("role", "seller").eq("partner_admin", false).neq("user_id", ctx.user.id).select("id");
  if (error || !data?.length) throw new Error("Could not remove this seller. Refresh and check your administrator access.");
  revalidatePath("/partner/team");
  revalidateShowOps();
}

export async function setSellerPartnerAdminAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const memberId = String(formData.get("member_id") ?? "").trim();
  const partnerAdmin = formData.get("partner_admin") === "true";
  if (!memberId) throw new Error("Person required.");
  const { data, error } = await ctx.supabase.from("show_ops_members")
    .update({ partner_admin: partnerAdmin }).eq("id", memberId).eq("business_id", ctx.business.id)
    .eq("role", "seller").not("supplier_id", "is", null).select("id");
  if (error || !data?.length) throw new Error("Could not change organisation administrator access.");
  revalidatePath("/partner/team");
  revalidateShowOps();
}

export async function createSellerBookingAction(
  formData: FormData,
): Promise<{ ok: true; id?: string; message?: string } | { ok: false; message: string }> {
  const ctx = await requireShowOpsSellerContext();
  formData.set("supplier_id", ctx.supplier.id);
  formData.set("sales_channel", ctx.supplier.partner_type || "partner");
  formData.delete("office_only_comments");
  const built = await buildBookingFields(ctx, formData);
  if (!built.ok) return { ok: false, message: built.error };
  if (built.fields.supplier_id !== ctx.supplier.id) {
    return { ok: false, message: "You can only book as your company." };
  }

  const { data: closes } = await ctx.supabase
    .from("show_night_closes")
    .select("show_date,island,product_id,close_kind")
    .eq("business_id", ctx.business.id)
    .eq("show_date", built.fields.show_date)
    .eq("island", built.fields.island);
  if (
    saleBlockedForPartner((closes ?? []) as never, {
      showDate: built.fields.show_date,
      island: built.fields.island,
      productId: built.fields.product_id,
    })
  ) {
    return { ok: false, message: "This night is fully closed — ring the office if you still need to add someone." };
  }

  const id = crypto.randomUUID();
  let booking_ref = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    booking_ref = await nextRef(ctx);
    const { error } = await ctx.supabase
      .from("show_bookings")
      .insert({
        ...built.fields,
        id,
        office_only_comments: null,
        business_id: ctx.business.id,
        booking_ref,
        created_by: ctx.user.id,
      });
    if (!error) break;
    if (isBookingRefClash(error) && attempt < 4) continue;
    return { ok: false, message: partnerBookingErrorMessage(error) };
  }
  const { data: created } = await ctx.supabase.from("show_bookings").select("ticket_token").eq("id", id).maybeSingle();
  await sendGuestTicketIfRequested(formData, ctx, built.fields as Record<string, unknown>, booking_ref, created?.ticket_token ? String(created.ticket_token) : null);
  await pushChannelAvailability(ctx.business.id, { productId: built.fields.product_id }, [built.fields.show_date]);
  revalidatePath("/partner");
  return { ok: true, id, message: booking_ref };
}

export async function inviteShowOpsMemberAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "office").trim();
  if (!email) throw new Error("Email required.");
  if (!["booker", "office", "finance", "admin"].includes(role)) throw new Error("Invalid role.");

  const { createSupabaseServiceRoleClient } = await import("@/lib/supabase/server");
  const admin = createSupabaseServiceRoleClient();
  const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw new Error(listErr.message);
  let userId = listed.users.find((u) => (u.email || "").toLowerCase() === email)?.id;
  if (!userId) {
    for (let page = 2; page <= 10 && !userId; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      userId = data.users.find((u) => (u.email || "").toLowerCase() === email)?.id;
      if (data.users.length < 200) break;
    }
  }
  if (!userId) {
    throw new Error("No Solvio user with that email yet — ask them to sign up first, then invite.");
  }

  const { error } = await ctx.supabase.from("show_ops_members").upsert(
    {
      business_id: ctx.business.id,
      user_id: userId,
      role,
      allowed_islands: parseMemberIslands(formData, ctx.config.islands),
    },
    { onConflict: "business_id,user_id" },
  );
  if (error) throw new Error(error.message);
  revalidateShowOps();
}

/**
 * Create a staff login outright: email + password + the pages they may see.
 *
 * The old invite flow only worked for people who already had a Solvio account,
 * which is a dead end for venue door staff. This creates the auth user directly
 * with the service role, marks the email confirmed (nobody is checking a mailbox
 * on a bus stop), and files the membership with an explicit page allow-list.
 */
export async function createShowOpsStaffAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const role = String(formData.get("role") ?? "booker").trim();
  const pages = formData.getAll("pages").map((p) => String(p));

  if (!email || !email.includes("@")) throw new Error("A valid email is required.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (!["booker", "office", "finance", "admin"].includes(role)) throw new Error("Invalid role.");

  const valid = pages.filter((p) => (SHOW_OPS_PAGE_KEYS as readonly string[]).includes(p));
  if (!valid.length) throw new Error("Pick at least one page this person can see.");
  // Catalogue pages and Settings cannot be granted below admin.
  const allowedPages = showOpsAllowedPages(role, valid);
  if (!allowedPages.length) throw new Error("Pick at least one page available to this role.");

  const allowedIslands = parseMemberIslands(formData, ctx.config.islands);
  const { createSupabaseServiceRoleClient } = await import("@/lib/supabase/server");
  const admin = createSupabaseServiceRoleClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: displayName || email.split("@")[0] },
  });

  const userId = created?.user?.id;
  if (createErr) {
    if (/already|registered|exists/i.test(createErr.message)) throw new Error("That email already has a Solvio account. Use the existing-account invitation instead; its password has not been changed.");
    throw new Error(createErr.message);
  }
  if (!userId) throw new Error("Could not create that login.");

  const { error } = await ctx.supabase.from("show_ops_members").upsert(
    {
      business_id: ctx.business.id,
      user_id: userId,
      role,
      allowed_islands: allowedIslands,
      allowed_pages: allowedPages,
      display_name: displayName || null,
      created_by: ctx.user.id,
    },
    { onConflict: "business_id,user_id" },
  );
  if (error) throw new Error(error.message);
  revalidateShowOps();
}

/** Change which pages an existing member can see. */
export async function updateShowOpsMemberPagesAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const memberId = String(formData.get("member_id") ?? "").trim();
  if (!memberId) throw new Error("Member required.");
  const pages = formData.getAll("pages").map((p) => String(p));
  const valid = pages.filter((p) => (SHOW_OPS_PAGE_KEYS as readonly string[]).includes(p));
  if (!valid.length) throw new Error("Pick at least one page this person can see.");

  const { data: member } = await ctx.supabase
    .from("show_ops_members")
    .select("id,role")
    .eq("id", memberId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!member) throw new Error("Member not found in this workspace.");
  // Owners may move a staff member between roles (e.g. Door-only booker → Office) without recreating the login.
  const requestedRole = String(formData.get("role") ?? "").trim();
  const nextRole = (["booker", "office", "finance", "admin"] as const).find((r) => r === requestedRole) ?? (member.role as string);
  if (member.role === "seller" && nextRole !== "seller") throw new Error("Seller logins stay sellers; create a staff login instead.");
  const allowedPages = showOpsAllowedPages(nextRole as ShowOpsMemberRole, valid);
  if (!allowedPages.length) throw new Error("Pick at least one page available to this role.");

  /*
   * The partner this person books for. Sellers are locked to theirs by the portal,
   * so this only ever sets the desk's pre-selected partner for office staff.
   */
  const patch: Record<string, unknown> = { allowed_pages: allowedPages, role: nextRole };
  if (formData.has("default_supplier_id") && member.role !== "seller") {
    patch.supplier_id = String(formData.get("default_supplier_id") ?? "").trim() || null;
  }

  const { error } = await ctx.supabase
    .from("show_ops_members")
    .update(patch)
    .eq("id", memberId)
    .eq("business_id", ctx.business.id);
  if (error) throw new Error(error.message);
  revalidateShowOps();
}

/** Reset a staff password without deleting the account. */
export async function resetShowOpsStaffPasswordAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const memberId = String(formData.get("member_id") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");

  const { createSupabaseServiceRoleClient } = await import("@/lib/supabase/server");
  const admin = createSupabaseServiceRoleClient();
  const { data: member } = await admin
    .from("show_ops_members")
    .select("user_id")
    .eq("id", memberId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!member) throw new Error("Member not found in this workspace.");
  const [{ data: memberships, error: membershipsError }, { data: owned, error: ownedError }] = await Promise.all([
    admin.from("show_ops_members").select("business_id,role").eq("user_id", member.user_id),
    admin.from("businesses").select("id").eq("owner_id", member.user_id).limit(1),
  ]);
  if (membershipsError || ownedError) throw new Error("Could not verify this account. No password was changed.");
  assertWorkspaceOnlyStaffAccount(ctx.business.id, memberships ?? [], Boolean(owned?.length));
  await requireGlobalShowOpsAdmin();
  const { error } = await admin.auth.admin.updateUserById(member.user_id, { password });
  if (error) throw new Error(error.message);
  revalidateShowOps();
}

export async function removeShowOpsMemberAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const memberId = String(formData.get("member_id") ?? "").trim();
  if (!memberId) throw new Error("Member required.");
  const { error } = await ctx.supabase
    .from("show_ops_members")
    .delete()
    .eq("id", memberId)
    .eq("business_id", ctx.business.id);
  if (error) throw new Error(error.message);
  revalidateShowOps();
}

export async function recordPaymentAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("office", "bookings");
  const bookingId = String(formData.get("booking_id") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);
  const method = String(formData.get("method") ?? "cash");
  if (!bookingId || !Number.isFinite(amount) || round2(amount) <= 0) throw new Error("Booking and a positive amount required.");
  if (!["cash", "card", "transfer", "other"].includes(method)) throw new Error("Choose a manual payment method.");

  const { data: booking } = await ctx.supabase
    .from("show_bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!booking) throw new Error("Booking not found.");
  if (booking.cancelled_at) throw new Error("This booking is cancelled.");
  if (booking.billing_mode !== "deposit") throw new Error("Payments are for deposit bookings.");

  const paidSum = await paidOnBooking(ctx.supabase, booking);
  const { balance: outstanding } = paymentStatusAfter(Number(booking.total_cost), paidSum);
  if (outstanding <= 0) throw new Error("Nothing due on this booking.");
  if (round2(amount) - outstanding > 0.009) {
    throw new Error(`Amount is more than outstanding (${outstanding.toFixed(2)}).`);
  }

  const { error: payErr } = await ctx.supabase.from("show_booking_payments").insert({
    business_id: ctx.business.id,
    booking_id: bookingId,
    amount,
    method,
    created_by: ctx.user.id,
  });
  if (payErr) throw new Error(payErr.message);

  // The payment insert and booking summary are committed atomically by the database.

  revalidateShowOps();
  return;
}

export async function sendShowOpsPaymentLinkAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("office", "bookings");
  if (!ctx.config.guest_stripe_enabled) {
    throw new Error("Guest Stripe links are off in Settings.");
  }
  const connectId = ctx.business.stripe_connect_account_id?.trim();
  if (!connectId || !ctx.business.stripe_connect_charges_enabled) {
    throw new Error("Connect Stripe under Dashboard → Payments first.");
  }
  const bookingId = String(formData.get("booking_id") ?? "").trim();
  if (!bookingId) throw new Error("Booking required.");

  const { data: booking } = await ctx.supabase
    .from("show_bookings")
    .select(
      "id,legacy_id,island,booking_ref,guest_name,guest_email,show_name,show_date,deposit_amount,balance_remaining,total_cost,payment_status,billing_mode,cancelled_at",
    )
    .eq("id", bookingId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!booking) throw new Error("Booking not found.");
  if (booking.cancelled_at) throw new Error("This booking is cancelled.");
  if (booking.billing_mode !== "deposit") throw new Error("Payment links are for deposit bookings.");
  if (booking.payment_status === "paid") throw new Error("This booking is already paid.");

  const email = (booking.guest_email || "").trim();
  if (!email || !email.includes("@")) {
    throw new Error("Add a guest email on the booking before sending a link.");
  }

  const paidSum = await paidOnBooking(ctx.supabase, booking);
  const dueInfo = showOpsAmountDue({
    billingMode: "deposit",
    totalCost: Number(booking.total_cost),
    depositAmount: Number(booking.deposit_amount),
    paidSum,
  });
  if (dueInfo.amount <= 0) throw new Error("Nothing due on this booking.");

  const url = await createShowOpsDepositCheckoutSession({
    businessId: ctx.business.id,
    connectAccountId: connectId,
    bookingId: booking.id,
    bookingRef: booking.booking_ref,
    guestEmail: email,
    guestName: booking.guest_name,
    showName: booking.show_name,
    showDate: booking.show_date,
    amount: dueInfo.amount,
    dueKind: dueInfo.kind,
    currency: showOpsCurrencyFor(ctx.config, (booking as { island?: string | null }).island ?? null),
    merchantName: ctx.branding.displayName,
  });
  if (!url) throw new Error("Could not create a Stripe payment link.");

  const sent = await sendShowOpsPaymentLinkEmail({
    guestEmail: email,
    guestName: booking.guest_name,
    merchantName: ctx.branding.displayName,
    bookingRef: booking.booking_ref,
    showName: booking.show_name,
    showDate: booking.show_date,
    amount: dueInfo.amount,
    currency: showOpsCurrencyFor(ctx.config, (booking as { island?: string | null }).island ?? null),
    payUrl: url,
  });
  if (!sent.ok) throw new Error(sent.message);

  revalidateShowOps();
  redirect("/dashboard/show-ops/payments?sent=1");
}

type ShowOpsFinanceCtx = Awaited<ReturnType<typeof requireShowOpsRole>>;

type InvoicePackOpts = {
  supplier_id: string;
  period_start: string;
  period_end: string;
  island: string;
  terms: number;
  invoice_date: string;
};

/**
 * Build one supplier's draft invoice pack for a period. Returns the new
 * invoice id, or null when the supplier has no uninvoiced reservations in
 * the window (so a batch run can skip quietly where the single-supplier
 * flow reports an error).
 */
async function generateInvoicePackCore(ctx: ShowOpsFinanceCtx, opts: InvoicePackOpts): Promise<string | null> {
  const { supplier_id, period_start, period_end, island, terms, invoice_date } = opts;

  let q = ctx.supabase
    .from("show_bookings")
    .select("*")
    .eq("business_id", ctx.business.id)
    .eq("supplier_id", supplier_id)
    .eq("billing_mode", "invoice")
    .is("invoice_id", null)
    .or("legacy_status.is.null,legacy_status.neq.Invoiced") // already invoiced in Lanzasoft
    .is("cancelled_at", null)
    .gte("show_date", period_start)
    .lte("show_date", period_end);
  if (island) q = q.eq("island", island);

  const { data: bookings, error } = await q;
  if (error) throw new Error(error.message);
  if (!bookings?.length) return null;

  const { data: supplierRow } = await ctx.supabase
    .from("show_suppliers")
    .select("*")
    .eq("id", supplier_id)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  const productIds = [...new Set(bookings.map((b) => b.product_id).filter(Boolean))] as string[];
  const { data: productRows } = productIds.length
    ? await ctx.supabase.from("show_products").select("*").in("id", productIds)
    : { data: [] as never[] };
  const productById = new Map((productRows ?? []).map((p) => [p.id, p]));

  /*
   * Invoice at the rate the booking was SOLD at, never today's rate.
   *
   * A booking taken through the desk carries a pricing snapshot, so its stored
   * netts are authoritative — editing a partner's nett % afterwards must not move
   * money on work already sold. Only the legacy import rows, which came in with no
   * netts at all, still get priced from live master data.
   */
  const priced = bookings.map((b) => {
    if (hasPricingSnapshot(b.pricing_snapshot)) {
      return {
        ...b,
        adult_nett_total: Number(b.adult_nett_total),
        child_nett_total: Number(b.child_nett_total),
        nett_total: Number(b.nett_total),
      };
    }
    const product = b.product_id ? productById.get(b.product_id) : null;
    if (!product || !supplierRow) {
      return {
        ...b,
        adult_nett_total: Number(b.adult_nett_total),
        child_nett_total: Number(b.child_nett_total),
        nett_total: Number(b.nett_total),
      };
    }
    const money = computeBookingMoney({
      adults: Number(b.adults),
      children: Number(b.children),
      infants: Number(b.infants),
      product: product as never,
      supplier: supplierRow as never,
      transportRequired: Boolean(b.transport_required),
      transportSupplement: ctx.config.transport_supplement,
    });
    return {
      ...b,
      adult_nett_total: money.adult_nett_total,
      child_nett_total: money.child_nett_total,
      nett_total: money.nett_total,
    };
  });

  const supplier_name = priced[0].supplier_name || "Supplier";
  const packIslands = new Set(priced.map((b) => (b.island ? String(b.island) : "")).filter(Boolean));
  const packIsland = packIslands.size === 1 ? [...packIslands][0] : island || null;
  const due_date = addDaysIso(invoice_date, terms);
  const invoiceCfg = ctx.config.invoice;
  const vatRate = invoiceCfg.defaultVatRate;
  const recipientName = String(supplierRow?.legal_name || supplier_name).trim();

  const { data: inv, error: invErr } = await ctx.supabase
    .from("show_invoices")
    .insert({
      business_id: ctx.business.id,
      supplier_id,
      supplier_name,
      island: packIsland,
      period_start,
      period_end,
      invoice_date,
      payment_terms_days: terms,
      due_date,
      total_amount: 0,
      created_by: ctx.user.id,
      status: "draft",
      series: invoiceCfg.series,
      currency: showOpsCurrencyFor(ctx.config, packIsland),
      issuer_name: invoiceCfg.issuerName || ctx.branding.displayName,
      issuer_tax_id: invoiceCfg.issuerTaxId || null,
      issuer_address: invoiceCfg.issuerAddress || null,
      recipient_name: recipientName,
      recipient_tax_id: String(supplierRow?.tax_id ?? "").trim() || null,
      recipient_address: String(supplierRow?.invoice_address ?? "").trim() || null,
      verifactu_status: "not_sent",
    })
    .select("id")
    .maybeSingle();
  if (invErr || !inv) throw new Error(invErr?.message || "Failed to create invoice.");

  const ids = priced.map((b) => b.id);
  const { data: claimed, error: claimErr } = await ctx.supabase
    .from("show_bookings")
    .update({ invoice_id: inv.id, updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("business_id", ctx.business.id)
    .is("invoice_id", null)
    .is("cancelled_at", null)
    .select("id");
  if (claimErr) {
    await ctx.supabase.from("show_invoices").delete().eq("id", inv.id);
    throw new Error(claimErr.message);
  }
  const claimedIds = new Set((claimed ?? []).map((r) => r.id));
  const claimedRows = priced.filter((b) => claimedIds.has(b.id));
  if (!claimedRows.length) {
    await ctx.supabase.from("show_invoices").delete().eq("id", inv.id);
    return null;
  }

  const billedRows = claimedRows.map((b) => {
    const arrival = resolveArrivedPax({
      adults: Number(b.adults),
      children: Number(b.children),
      infants: Number(b.infants),
      arrivedPax: (b as { arrived_pax?: number | null }).arrived_pax,
      arrivedAt: (b as { arrived_at?: string | null }).arrived_at,
      noShow: (b as { no_show?: boolean | null }).no_show,
    });
    const billed = applyNoShowBilling({
      booked: arrival.booked,
      arrived: arrival.arrived,
      totalCost: Number(b.total_cost),
      nettTotal: Number(b.nett_total),
      adultNettTotal: Number(b.adult_nett_total),
      childNettTotal: Number(b.child_nett_total),
      charge: (b as { no_show_charge?: "charge" | "write_off" | null }).no_show_charge,
    });
    return { b, billed };
  });

  const lines = billedRows.map(({ b, billed }) => {
    const adults = Number(b.adults);
    const children = Number(b.children);
    const money = recalcInvoiceLine({
      adults,
      children,
      adultUnit: adults > 0 ? round2(billed.billedAdultNett / adults) : 0,
      childUnit: children > 0 ? round2(billed.billedChildNett / children) : 0,
      vatRate,
    });
    return {
      business_id: ctx.business.id,
      invoice_id: inv.id,
      booking_id: b.id,
      booking_ref: b.booking_ref,
      guest_name: b.guest_name,
      supplier_ticket_number: b.supplier_ticket_number,
      adults,
      children,
      adult_nett_total: money.adultNettTotal,
      child_nett_total: money.childNettTotal,
      line_total: money.lineTotal,
      notes: billed.invoiceNote,
      description: `${b.guest_name}${b.booking_ref ? ` · ${b.booking_ref}` : ""}`,
      quantity: money.quantity,
      unit_price: money.unitPrice,
      adult_unit_price: money.adultUnit,
      child_unit_price: money.childUnit,
      vat_rate: money.vatRate,
      vat_amount: money.vatAmount,
      net_total: money.netTotal,
      line_kind: "booking",
    };
  });
  const supplementRows = billedRows.flatMap(({ b, billed }) => invoiceSupplements({
    extras: b.extras_snapshot, infantNett: Number(b.infant_nett_total || 0), infants: Number(b.infants),
    booked: paxTotal(Number(b.adults), Number(b.children), Number(b.infants)),
    missing: billed.missing, writeOff: billed.charge === "write_off", vatRate,
  }).map(({ description, money }) => ({
    business_id: ctx.business.id, invoice_id: inv.id, booking_id: null, source_booking_id: b.id,
    booking_ref: b.booking_ref, guest_name: b.guest_name, supplier_ticket_number: b.supplier_ticket_number,
    adults: 0, children: 0, adult_nett_total: 0, child_nett_total: 0,
    line_total: money.lineTotal, notes: billed.invoiceNote,
    description: `${b.booking_ref} · ${description}`, quantity: money.quantity, unit_price: money.unitPrice,
    adult_unit_price: 0, child_unit_price: 0, vat_rate: money.vatRate, vat_amount: money.vatAmount,
    net_total: money.netTotal, line_kind: "manual",
  })));
  const { error: lineErr } = await ctx.supabase.from("show_invoice_lines").insert([...lines, ...supplementRows]);
  if (lineErr) {
    await ctx.supabase.from("show_invoices").delete().eq("id", inv.id);
    throw new Error(lineErr.message);
  }

  const totals = sumInvoiceLines([...lines, ...supplementRows].map((line) => ({
    netTotal: line.net_total, vatAmount: line.vat_amount, lineTotal: line.line_total,
  })));
  await ctx.supabase
    .from("show_invoices")
    .update({
      total_amount: totals.grandTotal,
      net_total: totals.netTotal,
      vat_total: totals.vatTotal,
      updated_at: new Date().toISOString(),
    })
    .eq("id", inv.id);

  for (const b of claimedRows) {
    await ctx.supabase
      .from("show_bookings")
      .update({
        nett_total: b.nett_total,
        adult_nett_total: b.adult_nett_total,
        child_nett_total: b.child_nett_total,
      })
      .eq("id", b.id);
  }

  return inv.id;
}

export async function generateInvoicePackAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const period_start = String(formData.get("period_start") ?? "").trim();
  const period_end = String(formData.get("period_end") ?? "").trim();
  const island = String(formData.get("island") ?? "").trim();
  const terms = Number(formData.get("payment_terms_days") ?? 30);
  const invoice_date = String(formData.get("invoice_date") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const supplier_id = String(formData.get("supplier_id") ?? "").trim();

  if (!period_start || !period_end || !supplier_id) {
    throw new Error("Period and supplier required.");
  }

  const invoiceId = await generateInvoicePackCore(ctx, {
    supplier_id,
    period_start,
    period_end,
    island,
    terms,
    invoice_date,
  });
  if (!invoiceId) {
    throw new Error("No uninvoiced reservations for that filter — they may have just been invoiced elsewhere.");
  }

  revalidateShowOps();
  redirect(`/dashboard/show-ops/invoices/${invoiceId}`);
}

/**
 * The month-end run: one click builds a draft pack for EVERY supplier with
 * uninvoiced invoice-mode reservations in the period — the batch Lanzasoft
 * did by hand, supplier by supplier.
 */
export async function generateAllInvoicePacksAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const period_start = String(formData.get("period_start") ?? "").trim();
  const period_end = String(formData.get("period_end") ?? "").trim();
  const island = String(formData.get("island") ?? "").trim();
  const terms = Number(formData.get("payment_terms_days") ?? 30);
  const invoice_date = String(formData.get("invoice_date") ?? "").trim() || new Date().toISOString().slice(0, 10);

  if (!period_start || !period_end) throw new Error("Period required.");

  let q = ctx.supabase
    .from("show_bookings")
    .select("supplier_id")
    .eq("business_id", ctx.business.id)
    .eq("billing_mode", "invoice")
    .is("invoice_id", null)
    .or("legacy_status.is.null,legacy_status.neq.Invoiced") // already invoiced in Lanzasoft
    .is("cancelled_at", null)
    .gte("show_date", period_start)
    .lte("show_date", period_end);
  if (island) q = q.eq("island", island);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const supplierIds = [...new Set((data ?? []).map((r) => r.supplier_id).filter(Boolean))] as string[];
  if (!supplierIds.length) throw new Error("No uninvoiced reservations in that period.");

  let generated = 0;
  for (const supplier_id of supplierIds) {
    const invoiceId = await generateInvoicePackCore(ctx, {
      supplier_id,
      period_start,
      period_end,
      island,
      terms,
      invoice_date,
    });
    if (invoiceId) generated += 1;
  }

  revalidateShowOps();
  redirect(`/dashboard/show-ops/invoices?view=invoices&generated=${generated}`);
}

export async function markInvoicePaidAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const id = String(formData.get("invoice_id") ?? "").trim();
  const paid_at = String(formData.get("paid_at") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const { error } = await ctx.supabase
    .from("show_invoices")
    .update({ paid: true, paid_at, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .eq("voided", false);
  if (error) throw new Error(error.message);
  revalidateShowOps();
  return;
}

export async function voidInvoiceAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const id = String(formData.get("invoice_id") ?? "").trim();
  if (!id) throw new Error("Invoice required.");

  const { data: inv } = await ctx.supabase
    .from("show_invoices")
    .select("id,voided,paid")
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!inv) throw new Error("Invoice not found.");
  if (inv.voided) throw new Error("Already voided.");

  const now = new Date().toISOString();
  const { error } = await ctx.supabase
    .from("show_invoices")
    .update({
      voided: true,
      voided_at: now,
      voided_by: ctx.user.id,
      status: "voided",
      updated_at: now,
    })
    .eq("id", id)
    .eq("business_id", ctx.business.id);
  if (error) throw new Error(error.message);

  await ctx.supabase
    .from("show_bookings")
    .update({ invoice_id: null, updated_at: now })
    .eq("business_id", ctx.business.id)
    .eq("invoice_id", id);

  revalidateShowOps();
  return;
}

export async function updateInvoiceMetaAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const id = String(formData.get("invoice_id") ?? "").trim();
  const { data: inv } = await ctx.supabase
    .from("show_invoices")
    .select("id,status,paid,voided,verifactu_status")
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!inv) throw new Error("Invoice not found.");
  if (invoiceIsLocked({ status: inv.status, paid: inv.paid, voided: inv.voided, verifactuStatus: inv.verifactu_status })) {
    throw new Error("This invoice is issued and locked. Void it if you need a replacement.");
  }
  const terms = Number(formData.get("payment_terms_days") ?? 30);
  const invoice_date = String(formData.get("invoice_date") ?? "").trim();
  const due_date = invoice_date ? addDaysIso(invoice_date, terms) : null;
  const { error } = await ctx.supabase
    .from("show_invoices")
    .update({
      verifactu_number: String(formData.get("verifactu_number") ?? "").trim() || null,
      invoice_date: invoice_date || null,
      payment_terms_days: terms,
      due_date,
      notes: String(formData.get("notes") ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("business_id", ctx.business.id);
  if (error) throw new Error(error.message);
  revalidateShowOps();
  return;
}

type ParsedInvoiceLine = {
  id: string;
  delete: boolean;
  isNew: boolean;
  booking_id: string | null;
  booking_ref: string;
  guest_name: string;
  supplier_ticket_number: string | null;
  description: string;
  notes: string | null;
  line_kind: "booking" | "manual";
  money: ReturnType<typeof recalcInvoiceLine>;
};

function parseInvoiceEditorForm(formData: FormData): {
  invoiceId: string;
  invoice_date: string;
  terms: number;
  notes: string | null;
  series: string;
  recipient_name: string;
  recipient_tax_id: string | null;
  recipient_address: string | null;
  lines: ParsedInvoiceLine[];
} {
  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const invoice_date = String(formData.get("invoice_date") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const terms = Number(formData.get("payment_terms_days") ?? 30);
  const ids = formData.getAll("line_id").map(String).filter(Boolean);
  const lines: ParsedInvoiceLine[] = ids.map((id) => {
    const kind = String(formData.get(`line_kind_${id}`) ?? "booking") === "manual" ? "manual" : "booking";
    const money =
      kind === "manual"
        ? recalcInvoiceLine({
            quantity: Number(formData.get(`quantity_${id}`) ?? 0),
            unitPrice: Number(formData.get(`unit_price_${id}`) ?? 0),
            vatRate: Number(formData.get(`vat_rate_${id}`) ?? 0),
          })
        : recalcInvoiceLine({
            adults: Number(formData.get(`adults_${id}`) ?? 0),
            children: Number(formData.get(`children_${id}`) ?? 0),
            adultUnit: Number(formData.get(`adult_unit_${id}`) ?? 0),
            childUnit: Number(formData.get(`child_unit_${id}`) ?? 0),
            vatRate: Number(formData.get(`vat_rate_${id}`) ?? 0),
          });
    const description = String(formData.get(`description_${id}`) ?? "").trim();
    const guest = String(formData.get(`guest_name_${id}`) ?? "").trim() || description || "Line";
    return {
      id,
      delete: String(formData.get(`delete_${id}`) ?? "") === "1",
      isNew: id.startsWith("new-"),
      booking_id: String(formData.get(`booking_id_${id}`) ?? "").trim() || null,
      booking_ref: String(formData.get(`booking_ref_${id}`) ?? "").trim(),
      guest_name: guest,
      supplier_ticket_number: String(formData.get(`ticket_${id}`) ?? "").trim() || null,
      description: description || guest,
      notes: String(formData.get(`notes_${id}`) ?? "").trim() || null,
      line_kind: kind,
      money,
    };
  });
  return {
    invoiceId,
    invoice_date,
    terms,
    notes: String(formData.get("notes") ?? "").trim() || null,
    series: String(formData.get("series") ?? "").trim().toUpperCase(),
    recipient_name: String(formData.get("recipient_name") ?? "").trim(),
    recipient_tax_id: String(formData.get("recipient_tax_id") ?? "").trim() || null,
    recipient_address: String(formData.get("recipient_address") ?? "").trim() || null,
    lines,
  };
}

async function persistInvoiceDraft(
  ctx: Awaited<ReturnType<typeof requireShowOpsRole>>,
  formData: FormData,
) {
  const parsed = parseInvoiceEditorForm(formData);
  if (!parsed.invoiceId) throw new Error("Invoice required.");
  const { data: inv } = await ctx.supabase
    .from("show_invoices")
    .select("*")
    .eq("id", parsed.invoiceId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!inv) throw new Error("Invoice not found.");
  if (
    invoiceIsLocked({
      status: inv.status,
      paid: inv.paid,
      voided: inv.voided,
      verifactuStatus: inv.verifactu_status,
    })
  ) {
    throw new Error("This invoice is issued and locked.");
  }

  const keep = parsed.lines.filter((l) => !l.delete);
  const drop = parsed.lines.filter((l) => l.delete && !l.isNew);
  if (drop.length) {
    const dropIds = drop.map((l) => l.id);
    const bookingIds = drop.map((l) => l.booking_id).filter(Boolean) as string[];
    await ctx.supabase
      .from("show_invoice_lines")
      .delete()
      .in("id", dropIds)
      .eq("invoice_id", inv.id)
      .eq("business_id", ctx.business.id);
    if (bookingIds.length) {
      await ctx.supabase
        .from("show_bookings")
        .update({ invoice_id: null, updated_at: new Date().toISOString() })
        .in("id", bookingIds)
        .eq("business_id", ctx.business.id)
        .eq("invoice_id", inv.id);
    }
  }

  for (const line of keep) {
    const row = {
      business_id: ctx.business.id,
      invoice_id: inv.id,
      booking_id: line.line_kind === "booking" ? line.booking_id : null,
      booking_ref: line.booking_ref,
      guest_name: line.guest_name,
      supplier_ticket_number: line.supplier_ticket_number,
      adults: line.money.adults,
      children: line.money.children,
      adult_nett_total: line.money.adultNettTotal,
      child_nett_total: line.money.childNettTotal,
      line_total: line.money.lineTotal,
      notes: line.notes,
      description: line.description,
      quantity: line.money.quantity,
      unit_price: line.money.unitPrice,
      adult_unit_price: line.money.adultUnit,
      child_unit_price: line.money.childUnit,
      vat_rate: line.money.vatRate,
      vat_amount: line.money.vatAmount,
      net_total: line.money.netTotal,
      line_kind: line.line_kind,
    };
    if (line.isNew) {
      const { error } = await ctx.supabase.from("show_invoice_lines").insert(row);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await ctx.supabase
        .from("show_invoice_lines")
        .update(row)
        .eq("id", line.id)
        .eq("invoice_id", inv.id)
        .eq("business_id", ctx.business.id);
      if (error) throw new Error(error.message);
    }
  }

  const totals = sumInvoiceLines(keep.map((l) => l.money));
  const due_date = addDaysIso(parsed.invoice_date, parsed.terms);
  const series =
    parsed.series.replace(/[^A-Z0-9]/g, "").slice(0, 12) || String(inv.series || ctx.config.invoice.series);
  const { error } = await ctx.supabase
    .from("show_invoices")
    .update({
      invoice_date: parsed.invoice_date,
      payment_terms_days: parsed.terms,
      due_date,
      notes: parsed.notes,
      series,
      recipient_name: parsed.recipient_name || inv.supplier_name,
      recipient_tax_id: parsed.recipient_tax_id,
      recipient_address: parsed.recipient_address,
      total_amount: totals.grandTotal,
      net_total: totals.netTotal,
      vat_total: totals.vatTotal,
      updated_at: new Date().toISOString(),
    })
    .eq("id", inv.id)
    .eq("business_id", ctx.business.id);
  if (error) throw new Error(error.message);
  return { inv, totals, series, invoice_date: parsed.invoice_date, recipient_name: parsed.recipient_name };
}

export async function saveInvoiceDraftAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const saved = await persistInvoiceDraft(ctx, formData);
  revalidateShowOps();
  redirect(`/dashboard/show-ops/invoices/${saved.inv.id}?saved=1`);
}

export async function issueInvoiceAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const saved = await persistInvoiceDraft(ctx, formData);
  const { data: inv } = await ctx.supabase
    .from("show_invoices")
    .select("*")
    .eq("id", saved.inv.id)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!inv) throw new Error("Invoice not found.");

  const { data: lineRows } = await ctx.supabase
    .from("show_invoice_lines")
    .select("*")
    .eq("invoice_id", inv.id)
    .eq("business_id", ctx.business.id);
  if (!lineRows?.length) throw new Error("Add at least one line before issuing.");

  const year = Number(String(inv.invoice_date || saved.invoice_date).slice(0, 4));
  const series = String(inv.series || ctx.config.invoice.series);
  const { data: numbered } = await ctx.supabase
    .from("show_invoices")
    .select("invoice_number")
    .eq("business_id", ctx.business.id)
    .not("invoice_number", "is", null);
  const sequence = nextInvoiceSequence(
    (numbered ?? []).map((r) => String(r.invoice_number || "")),
    series,
    year,
  );
  const invoiceNumber = formatInvoiceNumber(series, year, sequence);
  const issuerName = String(ctx.config.invoice.issuerName || ctx.branding.displayName).trim();
  const issuerTaxId = String(ctx.config.invoice.issuerTaxId || "").trim();
  const issuerAddress = String(ctx.config.invoice.issuerAddress || "").trim();
  const recipientName = String(inv.recipient_name || inv.supplier_name).trim();
  const recipientTaxId = String(inv.recipient_tax_id || "").trim();
  const recipientAddress = String(inv.recipient_address || "").trim();
  const totals = sumInvoiceLines(
    (lineRows ?? []).map((l) => ({
      netTotal: Number(l.net_total || 0),
      vatAmount: Number(l.vat_amount || 0),
      lineTotal: Number(l.line_total || 0),
    })),
  );
  const payload = buildVerifactuPayload({
    series,
    invoiceNumber,
    invoiceDate: inv.invoice_date || saved.invoice_date,
    issuerName,
    issuerTaxId,
    issuerAddress,
    recipientName,
    recipientTaxId,
    recipientAddress,
    currency: String(inv.currency || ctx.config.currency || "eur"),
    lines: (lineRows ?? []).map((l) => ({
      description: String(l.description || l.guest_name || "Line"),
      quantity: Number(l.quantity || 0),
      unitPrice: Number(l.unit_price || 0),
      vatRate: Number(l.vat_rate || 0),
      netTotal: Number(l.net_total || 0),
      vatAmount: Number(l.vat_amount || 0),
      lineTotal: Number(l.line_total || 0),
    })),
    netTotal: totals.netTotal,
    vatTotal: totals.vatTotal,
    grandTotal: totals.grandTotal,
  });

  const submitted = await submitVerifactuInvoice(payload);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: "issued",
    invoice_number: invoiceNumber,
    verifactu_number: String(inv.verifactu_number || "").trim() || invoiceNumber,
    issuer_name: issuerName,
    issuer_tax_id: issuerTaxId || null,
    issuer_address: issuerAddress || null,
    recipient_name: recipientName,
    recipient_tax_id: recipientTaxId || null,
    recipient_address: recipientAddress || null,
    verifactu_payload: payload,
    verifactu_status: submitted.ok ? submitted.status : "error",
    verifactu_error: submitted.ok ? null : submitted.error,
    verifactu_recorded_at: submitted.ok && submitted.status === "recorded" ? now : null,
    total_amount: totals.grandTotal,
    net_total: totals.netTotal,
    vat_total: totals.vatTotal,
    updated_at: now,
  };
  const { error } = await ctx.supabase
    .from("show_invoices")
    .update(patch)
    .eq("id", inv.id)
    .eq("business_id", ctx.business.id);
  if (error) throw new Error(error.message);

  revalidateShowOps();
  redirect(`/dashboard/show-ops/invoices/${inv.id}?issued=1`);
}

export async function retryVerifactuAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const id = String(formData.get("invoice_id") ?? "").trim();
  const { data: inv } = await ctx.supabase
    .from("show_invoices")
    .select("*")
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!inv) throw new Error("Invoice not found.");
  if (inv.status !== "issued" || inv.voided) throw new Error("Only issued invoices can be sent to Verifactu.");
  const payload = inv.verifactu_payload as Parameters<typeof submitVerifactuInvoice>[0] | null;
  if (!payload) throw new Error("This invoice has no Verifactu payload — void and re-issue.");
  const submitted = await submitVerifactuInvoice(payload);
  const now = new Date().toISOString();
  const { error } = await ctx.supabase
    .from("show_invoices")
    .update({
      verifactu_status: submitted.ok ? submitted.status : "error",
      verifactu_error: submitted.ok ? null : submitted.error,
      verifactu_recorded_at: submitted.ok && submitted.status === "recorded" ? now : null,
      updated_at: now,
    })
    .eq("id", id)
    .eq("business_id", ctx.business.id);
  if (error) throw new Error(error.message);
  revalidateShowOps();
  redirect(`/dashboard/show-ops/invoices/${id}?verifactu=${submitted.ok ? submitted.status : "error"}`);
}

export async function sendShowOpsInvoiceEmailAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsAction("finance", "invoices");
  const { canSeeShowOpsPage } = await import("@/lib/show-ops/nav");
  if (!canSeeShowOpsPage(ctx.role, ctx.allowedPages, "invoices")) throw new Error("Invoice page access is required.");
  const id = String(formData.get("invoice_id") ?? "").trim();
  const overrideTo = String(formData.get("to") ?? "").trim().toLowerCase();
  if (!id) throw new Error("Invoice required.");

  const { loadInvoiceDelivery } = await import("@/lib/show-ops/invoice-delivery");
  const { invoice: inv, lines, bytes, filename, evidence, evidenceFingerprint } = await loadInvoiceDelivery(ctx.supabase, ctx.business.id, id);
  const { assertInvoiceDeliveryReviewed } = await import("@/lib/show-ops/invoice-delivery-fingerprint");
  assertInvoiceDeliveryReviewed({
    expected: String(formData.get("evidence_fingerprint") || ""), actual: evidenceFingerprint,
    reviewed: formData.get("attachments_reviewed") === "1", missingCount: evidence.missing.length,
    missingAcknowledged: formData.get("missing_photos_acknowledged") === "1",
  });
  const invoiceNumber = String(inv.invoice_number || inv.verifactu_number);
  let to = overrideTo;
  if (!to && inv.supplier_id) {
    const { data: supplier, error } = await ctx.supabase
      .from("show_suppliers")
      .select("email")
      .eq("id", inv.supplier_id)
      .eq("business_id", ctx.business.id)
      .maybeSingle();
    if (error) throw new Error("Could not load the supplier email. Nothing was sent.");
    to = String(supplier?.email ?? "").trim().toLowerCase();
  }
  if (!to || !to.includes("@")) {
    throw new Error("Add a supplier email on Master data, or type one on this form.");
  }
  const currency = inv.currency;
  if (currency !== "eur" && currency !== "gbp" && currency !== "usd") throw new Error("Invoice currency is missing or unsupported.");
  const sent = await sendShowOpsInvoiceEmail({
    to,
    cc: ctx.user.email,
    replyTo: ctx.user.email,
    merchantName: inv.issuer_name || ctx.branding.displayName,
    supplierName: inv.recipient_name || inv.supplier_name,
    verifactuNumber: invoiceNumber,
    invoiceDate: inv.invoice_date,
    periodStart: inv.period_start,
    periodEnd: inv.period_end,
    dueDate: inv.due_date,
    totalAmount: Number(inv.total_amount),
    currency,
    paid: Boolean(inv.paid),
    invoiceAttachment: { filename, content: Buffer.from(bytes).toString("base64") },
    ticketAttachments: evidence.photos.map(({ filename, content }) => ({ filename, content })),
    lines: lines.map((l) => ({
      showDate: l.show_date || inv.invoice_date,
      guestName: l.description || l.guest_name || "Line",
      bookingRef: l.booking_ref || "",
      ticketNumber: l.supplier_ticket_number,
      adultNett: Number(l.adult_nett_total || 0),
      childNett: Number(l.child_nett_total || 0),
      lineTotal: Number(l.line_total),
    })),
  });
  if (!sent.ok) throw new Error(sent.message);

  const { error: logError } = await ctx.supabase
    .from("show_invoices")
    .update({ emailed_at: new Date().toISOString(), emailed_to: to, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", ctx.business.id);
  if (logError) throw new Error("Invoice email was sent, but its sent status could not be saved. Check delivery before sending again.");
  revalidateShowOps();
  redirect(`/dashboard/show-ops/invoices/${id}?emailed=1`);
}

export async function importCsvAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const kind = String(formData.get("kind") ?? "").trim();
  const csv = String(formData.get("csv") ?? "");
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("Paste CSV with a header row.");
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] ?? "";
    });
    return obj;
  });

  if (kind === "suppliers") {
    const payload = rows.map((r) => ({
      business_id: ctx.business.id,
      name: r.name || r.supplier,
      partner_type: r.partner_type || "agency",
      island: r.island || r.location || null,
      billing_mode: r.billing_mode === "invoice" ? "invoice" : "deposit",
      deposit_percent: Number(r.deposit_percent || 30),
      invoice_nett_percent: Number(r.invoice_nett_percent || 100),
    })).filter((r) => r.name);
    const { error } = await ctx.supabase.from("show_suppliers").insert(payload);
    if (error) throw new Error(error.message);
  } else if (kind === "hotels") {
    const payload = rows.map((r) => ({
      business_id: ctx.business.id,
      name: r.name || r.hotel,
      island: r.island,
    })).filter((r) => r.name && r.island);
    const { error } = await ctx.supabase.from("show_hotels").insert(payload);
    if (error) throw new Error(error.message);
  } else if (kind === "stops") {
    const payload = rows.map((r, i) => ({
      business_id: ctx.business.id,
      island: r.island,
      resort: r.resort,
      stop_name: r.stop_name || r.stop || r.name,
      pickup_time: r.pickup_time || null,
      sort_order: Number(r.sort_order || i),
    })).filter((r) => r.island && r.resort && r.stop_name);
    const { error } = await ctx.supabase.from("show_bus_stops").insert(payload);
    if (error) throw new Error(error.message);
  } else {
    throw new Error("Unknown import kind.");
  }

  revalidateShowOps();
}

export async function updateShowOpsDailyReportAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const emails = String(formData.get("office_report_emails") ?? "")
    .split(/[\n,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
  const { error } = await ctx.supabase
    .from("businesses")
    .update({
      show_ops_config: { ...ctx.config, office_report_emails: emails },
      updated_at: new Date().toISOString(),
    })
    .eq("id", ctx.business.id);
  if (error) throw new Error(error.message);
  revalidateShowOps();
  revalidatePath("/dashboard/show-ops/settings");
}

export async function closeSaleAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsRole("office");
  const show_date = String(formData.get("show_date") ?? "").trim();
  const island = String(formData.get("island") ?? "").trim();
  const product_id = String(formData.get("product_id") ?? "").trim() || null;
  const close_kind = String(formData.get("close_kind") ?? "") === "part" ? "part" : "full";
  const note = String(formData.get("note") ?? "").trim() || null;
  const next =
    safeShowOpsNext(String(formData.get("next") ?? "")) ||
    `/dashboard/show-ops/calendar?date=${encodeURIComponent(show_date)}&island=${encodeURIComponent(island)}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(show_date) || !island) {
    redirect(`${next}${next.includes("?") ? "&" : "?"}error=${encodeURIComponent("Pick a night and island.")}`);
  }

  const { data: product } = product_id
    ? await ctx.supabase
        .from("show_products")
        .select("id,name")
        .eq("id", product_id)
        .eq("business_id", ctx.business.id)
        .maybeSingle()
    : { data: null };

  let del = ctx.supabase
    .from("show_night_closes")
    .delete()
    .eq("business_id", ctx.business.id)
    .eq("show_date", show_date)
    .eq("island", island);
  del = product_id ? del.eq("product_id", product_id) : del.is("product_id", null);
  const { error: delErr } = await del;
  if (delErr) {
    redirect(`${next}${next.includes("?") ? "&" : "?"}error=${encodeURIComponent(delErr.message.slice(0, 180))}`);
  }
  const { error: insErr } = await ctx.supabase.from("show_night_closes").insert({
    business_id: ctx.business.id,
    show_date,
    island,
    product_id,
    close_kind,
    note,
    emailed_at: null,
    created_by: ctx.user.id,
  });
  if (insErr) {
    redirect(`${next}${next.includes("?") ? "&" : "?"}error=${encodeURIComponent(insErr.message.slice(0, 180))}`);
  }

  const { data: partners } = await ctx.supabase
    .from("show_suppliers")
    .select("name,email,island,active")
    .eq("business_id", ctx.business.id);
  const rec = closeSaleRecipients(partners ?? [], island);
  const copy = closeSaleCopy({
    kind: close_kind,
    merchantName: ctx.branding.displayName,
    island,
    showDate: show_date,
    showName: product?.name ?? null,
    note,
  });
  const sent =
    rec.length > 0
      ? await sendShowOpsHtmlEmail({
          to: rec.map((r) => r.email),
          subject: copy.subject,
          html: copy.html,
          text: copy.text,
        })
      : { ok: false as const };
  const emailed = sent.ok ? rec.filter((r) => filterShowOpsOutboundTo(r.email).length).length : 0;
  if (emailed > 0) {
    await ctx.supabase
      .from("show_night_closes")
      .update({ emailed_at: new Date().toISOString() })
      .eq("business_id", ctx.business.id)
      .eq("show_date", show_date)
      .eq("island", island);
  }
  if (close_kind === "full") await pushChannelAvailability(ctx.business.id, product_id ? { productId: product_id } : { island }, [show_date]);
  revalidateShowOps();
  redirect(`${next}${next.includes("?") ? "&" : "?"}closed=1&emailed=${emailed}`);
}

export async function reopenSaleAction(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsRole("office");
  const id = String(formData.get("id") ?? "").trim();
  const show_date = String(formData.get("show_date") ?? "").trim();
  const island = String(formData.get("island") ?? "").trim();
  const next =
    safeShowOpsNext(String(formData.get("next") ?? "")) ||
    `/dashboard/show-ops/calendar?date=${encodeURIComponent(show_date)}&island=${encodeURIComponent(island)}`;
  if (!id) redirect(next);
  const { error } = await ctx.supabase
    .from("show_night_closes")
    .delete()
    .eq("id", id)
    .eq("business_id", ctx.business.id);
  if (error) {
    redirect(`${next}${next.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message.slice(0, 180))}`);
  }
  await pushChannelAvailability(ctx.business.id, { island }, [show_date]);
  revalidateShowOps();
  redirect(`${next}${next.includes("?") ? "&" : "?"}reopened=1`);
}

/** Used by commercial stats — no-op write, kept for future. */
export async function noopPax(adults: number, children: number, infants: number) {
  return paxTotal(adults, children, infants);
}

export async function setShowOpsMemberIslandsAction(formData: FormData): Promise<void> {
  const ctx = await requireGlobalShowOpsAdmin();
  const memberId = String(formData.get("member_id") ?? "").trim();
  if (!memberId) throw new Error("Member required.");
  const { data, error } = await ctx.supabase.from("show_ops_members")
    .update({ allowed_islands: parseMemberIslands(formData, ctx.config.islands) })
    .eq("id", memberId).eq("business_id", ctx.business.id).select("id");
  if (error || !data?.length) throw new Error("Could not change this member’s island access.");
  revalidateShowOps();
  revalidatePath("/partner");
}
