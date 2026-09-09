import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createPartnerLinkBookingAction } from "@/app/dashboard/show-ops/actions";
import { getDeploymentSiteUrl } from "@/lib/deployment-site-url";
import {
  availabilityForRange,
  basicAuthMatches,
  bookingItemsToPax,
  cancellationRefusal,
  gygDateTime,
  gygError,
  leadTraveller,
  newReservationRef,
  parseGygDateTime,
  reservationExpiry,
  type GygError,
  type NightSource,
  shouldPushAvailability,
  type ProductPricing,
} from "@/lib/show-ops/gyg";
import { showOpsTicketUrl } from "@/lib/show-ops/ticket-token";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/*
 * GetYourGuide Supplier API — data layer. Everything here runs as the backend
 * (service role) because GetYourGuide is not a Solvio user; the caller is
 * authenticated by HTTP Basic against GYG_INBOUND_BASIC_USER/PASSWORD.
 * Bookings are created through the same capacity-checked database transaction
 * partner links use, under the GetYourGuide partner row mapped to the product.
 */

export const GYG_CHANNEL = "getyourguide";

type ChannelProduct = {
  id: string;
  business_id: string;
  external_product_id: string;
  product_id: string;
  ticket_type_id: string | null;
  supplier_id: string;
  pickup_kind: "own_way" | "private";
  cutoff_minutes: number;
  availability_type: "time_point" | "time_period";
  pricing_type: "individual" | "group";
  group_size: number | null;
  period_minutes: number;
  active: boolean;
  product: { id: string; name: string; island: string; capacity: number | null; run_weekdays: number[] | null; show_time: string | null; active: boolean };
  supplier: { id: string; name: string; booking_token: string | null; active: boolean };
};

/** One-shot response helpers: GetYourGuide wants HTTP 200 for both success and business errors. */
export const gygOk = (data: unknown) => NextResponse.json({ data }, { status: 200 });
export const gygFail = (error: GygError) => NextResponse.json(error, { status: 200 });

export async function gygHandler(req: Request, fn: (body: Record<string, unknown>, url: URL, db: SupabaseClient) => Promise<NextResponse>): Promise<NextResponse> {
  if (!basicAuthMatches(req.headers.get("authorization"), process.env.GYG_INBOUND_BASIC_USER, process.env.GYG_INBOUND_BASIC_PASSWORD)) {
    return gygFail(gygError("AUTHORIZATION_FAILURE", "The provided authentication credentials are not valid."));
  }
  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try {
      const raw = (await req.json()) as { data?: unknown };
      body = (raw && typeof raw === "object" && raw.data && typeof raw.data === "object" ? raw.data : {}) as Record<string, unknown>;
    } catch {
      return gygFail(gygError("VALIDATION_FAILURE", "Body must be JSON with a data object."));
    }
  }
  try {
    return await fn(body, new URL(req.url), createSupabaseServiceRoleClient());
  } catch (err) {
    console.error("[gyg] handler failed:", err instanceof Error ? err.message : err);
    return gygFail(gygError("INTERNAL_SYSTEM_FAILURE", "Unexpected error in the reservation system. Please retry."));
  }
}

export async function findChannelProduct(db: SupabaseClient, externalProductId: string): Promise<ChannelProduct | null> {
  const id = String(externalProductId ?? "").trim();
  if (!id) return null;
  const { data } = await db
    .from("show_channel_products")
    .select("id,business_id,external_product_id,product_id,ticket_type_id,supplier_id,pickup_kind,cutoff_minutes,availability_type,pricing_type,group_size,period_minutes,active,product:show_products(id,name,island,capacity,run_weekdays,show_time,active),supplier:show_suppliers(id,name,booking_token,active)")
    .eq("channel", GYG_CHANNEL)
    .eq("external_product_id", id)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as ChannelProduct & { product: ChannelProduct["product"] | ChannelProduct["product"][]; supplier: ChannelProduct["supplier"] | ChannelProduct["supplier"][] };
  const product = Array.isArray(row.product) ? row.product[0] : row.product;
  const supplier = Array.isArray(row.supplier) ? row.supplier[0] : row.supplier;
  if (!product || !supplier) return null;
  return { ...row, product, supplier };
}

function sellable(cp: ChannelProduct): GygError | null {
  if (!cp.active || !cp.product.active || !cp.supplier.active || !cp.supplier.booking_token) {
    return gygError("INVALID_PRODUCT", "This activity should be deactivated; not sellable.");
  }
  return null;
}

async function pagedPax(db: SupabaseClient, table: "show_bookings" | "show_seat_holds", businessId: string, productId: string, from: string, to: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let offset = 0; offset < 20000; offset += 1000) {
    let q = db.from(table).select("show_date,adults,children,infants").eq("business_id", businessId).eq("product_id", productId).gte("show_date", from).lte("show_date", to);
    q = table === "show_bookings" ? q.is("cancelled_at", null) : q.eq("status", "held").gt("expires_at", new Date().toISOString());
    const { data, error } = await q.order("id").range(offset, offset + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      const key = String(r.show_date);
      out[key] = (out[key] ?? 0) + (Number(r.adults) || 0) + (Number(r.children) || 0) + (Number(r.infants) || 0);
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function closedDates(db: SupabaseClient, businessId: string, island: string, productId: string, from: string, to: string): Promise<Set<string>> {
  const { data } = await db.from("show_night_closes").select("show_date,product_id,close_kind").eq("business_id", businessId).eq("island", island).eq("close_kind", "full").gte("show_date", from).lte("show_date", to);
  return new Set((data ?? []).filter((c) => c.product_id == null || c.product_id === productId).map((c) => String(c.show_date)));
}

function nightSource(cp: ChannelProduct): NightSource {
  return {
    capacity: cp.product.capacity,
    runWeekdays: cp.product.run_weekdays,
    showTime: cp.product.show_time,
    island: cp.product.island,
    cutoffMinutes: cp.cutoff_minutes,
    availabilityType: cp.availability_type ?? "time_point",
    periodMinutes: cp.period_minutes ?? 180,
    groupSize: cp.pricing_type === "group" ? cp.group_size ?? null : null,
  };
}

function pricingOf(cp: ChannelProduct): ProductPricing {
  return { pricingType: cp.pricing_type === "group" ? "group" : "individual", groupSize: cp.group_size ?? null };
}

export async function availabilityBetween(db: SupabaseClient, cp: ChannelProduct, from: string, to: string) {
  const [booked, held, closed] = await Promise.all([
    pagedPax(db, "show_bookings", cp.business_id, cp.product_id, from, to),
    pagedPax(db, "show_seat_holds", cp.business_id, cp.product_id, from, to),
    closedDates(db, cp.business_id, cp.product.island, cp.product_id, from, to),
  ]);
  return availabilityForRange(nightSource(cp), from, to, booked, held, closed, cp.external_product_id);
}

// ---------- endpoints ----------

export async function handleGetAvailabilities(url: URL, db: SupabaseClient): Promise<NextResponse> {
  const productId = url.searchParams.get("productId") ?? "";
  const from = parseGygDateTime(url.searchParams.get("fromDateTime"));
  const to = parseGygDateTime(url.searchParams.get("toDateTime"));
  if (!from || !to) return gygFail(gygError("VALIDATION_FAILURE", "fromDateTime and toDateTime must be ISO 8601 datetimes."));
  const cp = await findChannelProduct(db, productId);
  if (!cp) return gygFail(gygError("INVALID_PRODUCT", `Unknown product ${productId}.`));
  const blocked = sellable(cp);
  if (blocked) return gygFail(blocked);
  // GYG asks up to 365 days ahead; clamp so a bad range cannot scan years.
  const start = new Date(`${from.date}T00:00:00Z`);
  const maxEnd = new Date(start);
  maxEnd.setUTCDate(maxEnd.getUTCDate() + 400);
  const endDate = new Date(`${to.date}T00:00:00Z`) > maxEnd ? maxEnd.toISOString().slice(0, 10) : to.date;
  return gygOk({ availabilities: await availabilityBetween(db, cp, from.date, endDate) });
}

export async function handleReserve(body: Record<string, unknown>, db: SupabaseClient): Promise<NextResponse> {
  const when = parseGygDateTime(body.dateTime);
  if (!when) return gygFail(gygError("VALIDATION_FAILURE", "dateTime must be an ISO 8601 datetime."));
  const cp = await findChannelProduct(db, String(body.productId ?? ""));
  if (!cp) return gygFail(gygError("INVALID_PRODUCT", `Unknown product ${String(body.productId ?? "")}.`));
  const blocked = sellable(cp);
  if (blocked) return gygFail(blocked);
  const pax = bookingItemsToPax(body.bookingItems, pricingOf(cp));
  if (!pax.ok) return gygFail(pax.error);

  const [night] = await availabilityBetween(db, cp, when.date, when.date);
  if (!night) return gygFail(gygError("NO_AVAILABILITY", `No show on ${when.date}.`));
  // GROUP products count vacancies in groups; everything else in seats.
  const requested = cp.pricing_type === "group" ? pax.pax.groups : pax.pax.total;
  if (night.vacancies < requested) {
    return gygFail(gygError("NO_AVAILABILITY", `This activity is sold out; requested ${requested}; available ${night.vacancies}.`));
  }

  const reservation_ref = newReservationRef();
  const expires = reservationExpiry();
  const { error } = await db.from("show_seat_holds").insert({
    business_id: cp.business_id,
    channel: GYG_CHANNEL,
    channel_product_id: cp.id,
    product_id: cp.product_id,
    island: cp.product.island,
    show_date: when.date,
    adults: pax.pax.adults,
    children: pax.pax.children,
    infants: pax.pax.infants,
    reservation_ref,
    external_booking_ref: body.gygBookingReference ? String(body.gygBookingReference) : null,
    status: "held",
    expires_at: new Date(expires).toISOString(),
  });
  if (error) throw new Error(error.message);
  return gygOk({ reservationReference: reservation_ref, reservationExpiration: expires });
}

export async function handleCancelReservation(body: Record<string, unknown>, db: SupabaseClient): Promise<NextResponse> {
  const ref = String(body.reservationReference ?? "").trim();
  if (!ref) return gygFail(gygError("VALIDATION_FAILURE", "reservationReference is required."));
  // Idempotent: releasing an unknown or already-released hold is still a success.
  await db.from("show_seat_holds").update({ status: "released", updated_at: new Date().toISOString() }).eq("reservation_ref", ref).eq("status", "held");
  return gygOk({});
}

type BookingRow = { id: string; booking_ref: string; ticket_token: string | null; show_date: string; cancelled_at: string | null; arrived_at: string | null; product_id: string | null; island: string | null };

function ticketsFor(booking: BookingRow) {
  // One COLLECTIVE ticket per party: the guest QR already admits the whole booking at the door.
  const url = booking.ticket_token ? showOpsTicketUrl(getDeploymentSiteUrl(), booking.ticket_token) : booking.booking_ref;
  return [{ category: "COLLECTIVE", ticketCode: url, ticketCodeType: "QR_CODE" }];
}

export async function handleBook(body: Record<string, unknown>, db: SupabaseClient): Promise<NextResponse> {
  const gygRef = String(body.gygBookingReference ?? "").trim();
  const resRef = String(body.reservationReference ?? "").trim();
  if (!gygRef) return gygFail(gygError("VALIDATION_FAILURE", "gygBookingReference is required."));
  const cp = await findChannelProduct(db, String(body.productId ?? ""));
  if (!cp) return gygFail(gygError("INVALID_PRODUCT", `Unknown product ${String(body.productId ?? "")}.`));

  // Retries must return the booking already made for this GYG reference, never a second one.
  const { data: existing } = await db
    .from("show_bookings")
    .select("id,booking_ref,ticket_token,show_date,cancelled_at,arrived_at,product_id,island")
    .eq("business_id", cp.business_id)
    .eq("channel", GYG_CHANNEL)
    .eq("channel_ref", gygRef)
    .is("cancelled_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const when = parseGygDateTime(body.dateTime);
  const pax = bookingItemsToPax(body.bookingItems, pricingOf(cp));
  if (existing && when && pax.ok) {
    const { data: full } = await db.from("show_bookings").select("adults,children,infants,show_date").eq("id", existing.id).maybeSingle();
    const same = full && String(full.show_date) === when.date && Number(full.adults) === pax.pax.adults && Number(full.children) === pax.pax.children && Number(full.infants) === pax.pax.infants;
    // Same details → repeat confirmation. Different details → booking-change flow: a new booking is expected and GYG cancels the old one after.
    if (same) return gygOk({ bookingReference: existing.booking_ref, tickets: ticketsFor(existing as BookingRow) });
  }
  const blocked = sellable(cp);
  if (blocked) return gygFail(blocked);
  if (!when) return gygFail(gygError("VALIDATION_FAILURE", "dateTime must be an ISO 8601 datetime."));
  if (!pax.ok) return gygFail(pax.error);

  const { data: hold } = resRef
    ? await db.from("show_seat_holds").select("id,status,expires_at,show_date,external_booking_ref").eq("reservation_ref", resRef).eq("business_id", cp.business_id).maybeSingle()
    : { data: null };
  if (!hold || hold.status !== "held" || new Date(hold.expires_at) < new Date()) {
    return gygFail(gygError("INVALID_RESERVATION", hold ? "Expired reservation; the hold time was exceeded." : "Unknown reservation reference."));
  }

  const lead = leadTraveller(body.travelers);
  const comment = String(body.comment ?? "").trim();
  const fd = new FormData();
  fd.set("partner_token", String(cp.supplier.booking_token));
  fd.set("product_id", cp.product_id);
  if (cp.ticket_type_id) fd.set("ticket_type_id", cp.ticket_type_id);
  fd.set("show_date", when.date);
  fd.set("adults", String(pax.pax.adults));
  fd.set("children", String(pax.pax.children));
  fd.set("infants", String(pax.pax.infants));
  fd.set("guest_name", lead.name);
  if (lead.email) fd.set("guest_email", lead.email);
  if (lead.phone) fd.set("guest_mobile", lead.phone);
  fd.set("transport_required", "0");
  fd.set("pickup_kind", cp.pickup_kind);
  fd.set("billing_mode", "invoice");
  fd.set("supplier_ticket_number", gygRef);
  fd.set("office_comments", [`GetYourGuide ${gygRef}`, comment].filter(Boolean).join(" · ").slice(0, 500));
  fd.set("send_ticket", "0");

  const created = await createPartnerLinkBookingAction(fd);
  if (!created.ok || !created.id) {
    const msg = created.ok ? "Booking id missing." : created.message;
    if (/full|closed|sold out|SHOW_FULL|BUS_FULL|NIGHT_CLOSED|DATE_UNAVAILABLE/i.test(msg)) return gygFail(gygError("NO_AVAILABILITY", msg));
    return gygFail(gygError("INTERNAL_SYSTEM_FAILURE", msg));
  }

  const now = new Date().toISOString();
  // Booking-change flow: the same GYG reference now belongs to the new booking. The old one keeps a
  // traceable, superseded reference so the unique index lets the new booking take the live one; GYG
  // cancels the old booking next, by our booking reference.
  if (existing) {
    const { error: relabelError } = await db
      .from("show_bookings")
      .update({ channel_ref: `${gygRef}#superseded-${Date.now().toString(36)}`, updated_at: now })
      .eq("id", existing.id)
      .eq("business_id", cp.business_id);
    if (relabelError) console.error("[gyg] could not relabel superseded booking", existing.id, relabelError.message);
  }
  const { error: stampError } = await db
    .from("show_bookings")
    .update({ channel: GYG_CHANNEL, channel_ref: gygRef, updated_at: now })
    .eq("id", created.id)
    .eq("business_id", cp.business_id);
  if (stampError) console.error("[gyg] booking created but channel stamp failed", created.id, gygRef, stampError.message);
  await db.from("show_seat_holds").update({ status: "booked", booking_id: created.id, external_booking_ref: gygRef, updated_at: now }).eq("id", hold.id);
  const { data: booking } = await db.from("show_bookings").select("id,booking_ref,ticket_token,show_date,cancelled_at,arrived_at,product_id,island").eq("id", created.id).maybeSingle();
  if (!booking) return gygFail(gygError("INTERNAL_SYSTEM_FAILURE", "Booking saved but could not be read back."));
  void notifyAvailability(db, cp, when.date);
  return gygOk({ bookingReference: booking.booking_ref, tickets: ticketsFor(booking as BookingRow) });
}

export async function handleCancelBooking(body: Record<string, unknown>, db: SupabaseClient): Promise<NextResponse> {
  const gygRef = String(body.gygBookingReference ?? "").trim();
  const ourRef = String(body.bookingReference ?? "").trim();
  if (!gygRef && !ourRef) return gygFail(gygError("VALIDATION_FAILURE", "bookingReference or gygBookingReference is required."));
  // Our own reference is exact (the booking-change flow cancels the OLD booking by it while the GYG
  // reference already points at the new one); fall back to the GYG reference, live or superseded.
  const select = "id,business_id,booking_ref,ticket_token,show_date,cancelled_at,arrived_at,product_id,island,channel_ref";
  let booking: Record<string, unknown> | undefined;
  if (ourRef) {
    const { data } = await db.from("show_bookings").select(select).eq("channel", GYG_CHANNEL).eq("booking_ref", ourRef).limit(1);
    booking = data?.[0];
  }
  if (!booking && gygRef) {
    const { data } = await db.from("show_bookings").select(select).eq("channel", GYG_CHANNEL).eq("channel_ref", gygRef).order("created_at", { ascending: false }).limit(1);
    booking = data?.[0];
  }
  if (!booking && gygRef) {
    const { data } = await db.from("show_bookings").select(select).eq("channel", GYG_CHANNEL).like("channel_ref", `${gygRef}#superseded-%`).order("created_at", { ascending: false }).limit(1);
    booking = data?.[0];
  }
  if (!booking) return gygFail(gygError("INVALID_BOOKING", "The booking does not exist."));
  const b = booking as unknown as BookingRow & { business_id: string; channel_ref: string | null };
  const refusal = cancellationRefusal(b);
  if (refusal) return gygFail(refusal);
  const now = new Date().toISOString();
  const { error } = await db
    .from("show_bookings")
    .update({ cancelled_at: now, cancelled_by: null, cancel_reason: `Cancelled by GetYourGuide (${b.channel_ref || ourRef})`, updated_at: now })
    .eq("id", b.id)
    .eq("business_id", b.business_id);
  if (error) throw new Error(error.message);
  await db.from("show_seat_holds").update({ status: "released", updated_at: now }).eq("booking_id", b.id).eq("status", "booked");
  const cp = b.product_id ? await channelProductForShow(db, b.business_id, b.product_id) : null;
  if (cp) void notifyAvailability(db, cp, String(b.show_date));
  return gygOk({});
}

async function channelProductForShow(db: SupabaseClient, businessId: string, productId: string): Promise<ChannelProduct | null> {
  const { data } = await db.from("show_channel_products").select("external_product_id").eq("business_id", businessId).eq("channel", GYG_CHANNEL).eq("product_id", productId).eq("active", true).limit(1).maybeSingle();
  return data ? findChannelProduct(db, data.external_product_id) : null;
}

/**
 * Where availability pushes go. Production is the only host in their public spec, but the
 * Integrator Portal's "Test GetYourGuide endpoints" page gives a sandbox URL for the
 * PUSH_AVAILABILITY certification test (…/sandbox/1/…), so the base stays configurable.
 */
function gygPushBase(): string {
  // Tolerate a stray full stop or slash typed at the end of the env value (it cost us every sandbox push).
  return (process.env.GYG_API_BASE || "https://supplier-api.getyourguide.com/1").trim().replace(/[.\/\s]+$/, "");
}

export type PushVariant = "standard" | "item-product" | "zulu" | "cutoff";

function pushPayload(cp: ChannelProduct, date: string, vacancies: number, variant: PushVariant = "standard") {
  let dateTime = gygDateTime(date, cp.availability_type === "time_period" ? "00:00" : cp.product.show_time, cp.product.island);
  if (variant === "zulu") dateTime = dateTime.replace(/\+00:00$/, "Z");
  const item: Record<string, unknown> = { dateTime, vacancies };
  if (variant === "item-product") item.productId = cp.external_product_id;
  if (variant === "cutoff") item.cutoffSeconds = Math.max(0, cp.cutoff_minutes) * 60;
  return { data: { productId: cp.external_product_id, availabilities: [item] } };
}

async function postAvailability(payload: unknown, user: string, pass: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${gygPushBase()}/notify-availability-update`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: (await res.text()).slice(0, 400) };
}

/** Admin diagnostic: send one push for a mapped product and night and return what GetYourGuide answered. */
export async function testAvailabilityPush(externalProductId: string, date: string, variant: PushVariant): Promise<{ ok: boolean; status: number; body: string; payload: unknown; base: string }> {
  const user = process.env.GYG_OUTBOUND_BASIC_USER;
  const pass = process.env.GYG_OUTBOUND_BASIC_PASSWORD;
  if (!user || !pass) return { ok: false, status: 0, body: "GYG_OUTBOUND_BASIC_USER / GYG_OUTBOUND_BASIC_PASSWORD are not set on the server.", payload: null, base: gygPushBase() };
  const db = createSupabaseServiceRoleClient();
  const cp = await findChannelProduct(db, externalProductId);
  if (!cp) return { ok: false, status: 0, body: `Unknown mapped product ${externalProductId}.`, payload: null, base: gygPushBase() };
  const [night] = await availabilityBetween(db, cp, date, date);
  const payload = pushPayload(cp, date, night ? night.vacancies : 0, variant);
  const res = await postAvailability(payload, user, pass);
  return { ok: res.status >= 200 && res.status < 300, ...res, payload, base: gygPushBase() };
}
/**
 * Push the night's vacancies to GetYourGuide after our own change (channel booking
 * or cancel, desk booking/edit/cancel, partner-link booking, night close/reopen).
 * Best effort: never throws, never blocks the caller's result on a GYG failure.
 */
export async function notifyAvailability(db: SupabaseClient, cp: ChannelProduct, date: string): Promise<void> {
  const user = process.env.GYG_OUTBOUND_BASIC_USER;
  const pass = process.env.GYG_OUTBOUND_BASIC_PASSWORD;
  if (!user || !pass || !cp.active) return;
  try {
    const [night] = await availabilityBetween(db, cp, date, date);
    if (!night) return;
    const key = { business_id: cp.business_id, channel: GYG_CHANNEL, external_product_id: cp.external_product_id, show_date: date };
    const { data: memo } = await db.from("show_channel_availability_pushes").select("last_vacancies").match(key).maybeSingle();
    const prev = memo ? Number(memo.last_vacancies) : undefined;
    const now = new Date().toISOString();
    if (!shouldPushAvailability(prev, night.vacancies, date)) {
      await db.from("show_channel_availability_pushes").upsert({ ...key, last_vacancies: night.vacancies, updated_at: now }, { onConflict: "business_id,channel,external_product_id,show_date" });
      return;
    }
    const payload = pushPayload(cp, date, night.vacancies);
    const res = await postAvailability(payload, user, pass);
    const ok = res.status >= 200 && res.status < 300;
    // INVALID_PRODUCT is expected until the operator has connected this product id in GYG's supplier portal.
    const status = ok ? "accepted" : /INVALID_PRODUCT/.test(res.body) ? "not-connected" : `error ${res.status}`;
    if (!ok && status !== "not-connected") console.error("[gyg] notify-availability-update", res.status, res.body.slice(0, 200), "payload:", JSON.stringify(payload).slice(0, 300), "base:", gygPushBase());
    await db.from("show_channel_availability_pushes").upsert({ ...key, last_vacancies: night.vacancies, pushed_at: now, last_status: status, updated_at: now }, { onConflict: "business_id,channel,external_product_id,show_date" });
  } catch (err) {
    console.error("[gyg] notify-availability-update failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Office-side hook: after any capacity change in Solvio (booking created/edited/cancelled,
 * night closed/reopened) push every mapped GetYourGuide product for that show — or, when
 * a whole island's night is closed, every mapped product on the island. Fire-and-forget safe.
 */
export async function pushChannelAvailability(
  businessId: string,
  target: { productId?: string | null; island?: string | null },
  dates: Array<string | null | undefined>,
): Promise<void> {
  if (!process.env.GYG_OUTBOUND_BASIC_USER || !process.env.GYG_OUTBOUND_BASIC_PASSWORD) return;
  const days = Array.from(new Set(dates.filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d))));
  if (!days.length || (!target.productId && !target.island)) return;
  try {
    const db = createSupabaseServiceRoleClient();
    let q = db.from("show_channel_products").select("external_product_id,product:show_products(island)").eq("business_id", businessId).eq("channel", GYG_CHANNEL).eq("active", true);
    if (target.productId) q = q.eq("product_id", target.productId);
    const { data } = await q;
    const rows = (data ?? []) as unknown as Array<{ external_product_id: string; product: { island: string } | { island: string }[] | null }>;
    const ids = rows
      .filter((r) => {
        if (target.productId) return true;
        const product = Array.isArray(r.product) ? r.product[0] : r.product;
        return product?.island === target.island;
      })
      .map((r) => r.external_product_id);
    for (const id of ids) {
      const cp = await findChannelProduct(db, id);
      if (!cp) continue;
      for (const date of days) await notifyAvailability(db, cp, date);
    }
  } catch (err) {
    console.error("[gyg] availability push skipped:", err instanceof Error ? err.message : err);
  }
}
