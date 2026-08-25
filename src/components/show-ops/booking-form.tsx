"use client";

import { Check, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { getNightLoadAction, type ShowOpsNightLoad } from "@/app/dashboard/show-ops/actions";
import { ShowOpsNightCalendar } from "@/components/show-ops/night-calendar";
import { NumberInput } from "@/components/ui/number-input";
import { computeBookingMoney, formatShowOpsMoney, round2, showOpsDayName } from "@/lib/show-ops/calc";
import { pickupStopOffered } from "@/lib/show-ops/bus";
import { partnerSellsOnIsland } from "@/lib/show-ops/partners";
import {
  groupNightsByMonth,
  showOpsNightLabel,
  showOpsRunNights,
} from "@/lib/show-ops/nights";
import type { ShowOpsBookingQuestion, ShowOpsConfig } from "@/lib/show-ops/types";

export type BookingFormProduct = {
  id: string;
  name: string;
  island: string;
  adult_price: number;
  child_price: number;
  infant_price: number;
  adult_price_no_transport: number | null;
  child_price_no_transport: number | null;
  infant_price_no_transport: number | null;
  adult_nett: number | null;
  child_nett: number | null;
  transport_available: boolean;
  show_time?: string | null;
  /** 0=Sun..6=Sat — nights this show runs; empty/null = only dates already on the books. */
  run_weekdays?: number[] | null;
  /** Future (and current) nights that already have bookings for this show. */
  booked_dates?: string[];
};

export type BookingFormSupplier = {
  id: string;
  name: string;
  billing_mode: "deposit" | "invoice";
  deposit_percent: number;
  invoice_nett_percent: number;
  partner_type?: string;
  island?: string | null;
};

export type BookingFormHotel = {
  id: string;
  name: string;
  island: string;
  bus_stop_id: string | null;
};

export type BookingFormStop = {
  id: string;
  stop_name: string;
  resort: string;
  pickup_time: string | null;
  island?: string;
  runs_on?: string | null;
};

export type BookingFormDefaults = {
  id?: string;
  show_date?: string;
  guest_name?: string;
  guest_mobile?: string | null;
  guest_email?: string | null;
  product_id?: string | null;
  hotel_id?: string | null;
  pickup_stop_id?: string | null;
  supplier_id?: string | null;
  transport_required?: boolean;
  dietary_required?: boolean;
  dietary_notes?: string | null;
  adults?: number;
  children?: number;
  infants?: number;
  sales_channel?: string;
  supplier_ticket_number?: string | null;
  office_comments?: string | null;
  office_only_comments?: string | null;
  custom_answers?: Record<string, string | boolean | number>;
  attendees?: Array<{ name?: string | null; type?: string | null; note?: string | null }> | null;
};

type Props = {
  mode: "create" | "edit";
  action: (formData: FormData) => Promise<{ ok: true; message?: string } | { ok: false; message: string }>;
  /** Absolute path to navigate after success. Use `{ref}` placeholder for booking ref. */
  successPath?: string;
  products: BookingFormProduct[];
  suppliers: BookingFormSupplier[];
  hotels: BookingFormHotel[];
  stops: BookingFormStop[];
  config: Pick<
    ShowOpsConfig,
    | "sales_channels"
    | "dietary_mode"
    | "dietary_options"
    | "booking_questions"
    | "location_label"
    | "product_label"
    | "currency"
  >;
  defaults?: BookingFormDefaults;
  error?: string | null;
  /** Locked partner portal — supplier is fixed, office-only fields hidden. */
  sellerMode?: boolean;
  /** Invoiced bookings: money/pax/show/supplier stay frozen. */
  moneyLocked?: boolean;
};

function CustomQuestionField({
  q,
  defaults,
}: {
  q: ShowOpsBookingQuestion;
  defaults?: Record<string, string | boolean | number>;
}) {
  const name = `cq_${q.id}`;
  const prev = defaults?.[q.id];
  if (q.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name={name} value="1" defaultChecked={Boolean(prev)} />
        {q.label}
        {q.required ? " *" : ""}
      </label>
    );
  }
  if (q.type === "textarea") {
    return (
      <label className="text-sm sm:col-span-2">
        {q.label}
        {q.required ? " *" : ""}
        <textarea
          name={name}
          rows={2}
          required={q.required}
          defaultValue={prev != null ? String(prev) : ""}
          className="mt-1 w-full rounded-lg border px-3 py-2"
        />
      </label>
    );
  }
  if (q.type === "select") {
    return (
      <label className="text-sm sm:col-span-2">
        {q.label}
        {q.required ? " *" : ""}
        <select
          name={name}
          required={q.required}
          defaultValue={prev != null ? String(prev) : ""}
          className="mt-1 w-full rounded-lg border px-3 py-2"
        >
          <option value="">—</option>
          {(q.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label className="text-sm sm:col-span-2">
      {q.label}
      {q.required ? " *" : ""}
      <input
        name={name}
        type={q.type === "number" ? "number" : "text"}
        required={q.required}
        defaultValue={prev != null ? String(prev) : ""}
        className="mt-1 w-full rounded-lg border px-3 py-2"
      />
    </label>
  );
}

export function ShowOpsBookingForm({
  mode,
  action,
  successPath,
  products,
  suppliers,
  hotels,
  stops,
  config,
  defaults = {},
  error,
  sellerMode = false,
  moneyLocked = false,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(error ?? null);
  const [productId, setProductId] = useState(defaults.product_id ?? "");
  const [supplierId, setSupplierId] = useState(defaults.supplier_id ?? "");
  const [hotelId, setHotelId] = useState(defaults.hotel_id ?? "");
  const [pickupStopId, setPickupStopId] = useState(defaults.pickup_stop_id ?? "");
  const skipHotelFollow = useRef(Boolean(defaults.pickup_stop_id));
  const [transport, setTransport] = useState(Boolean(defaults.transport_required));
  const [dietary, setDietary] = useState(Boolean(defaults.dietary_required));
  const [adults, setAdults] = useState(defaults.adults ?? 2);
  const [children, setChildren] = useState(defaults.children ?? 0);
  const [infants, setInfants] = useState(defaults.infants ?? 0);
  const [attNames, setAttNames] = useState<string[]>(
    () => (defaults.attendees ?? []).map((a) => a?.name ?? ""),
  );
  const [attNotes, setAttNotes] = useState<string[]>(
    () => (defaults.attendees ?? []).map((a) => a?.note ?? ""),
  );
  const [showDate, setShowDate] = useState(defaults.show_date ?? "");
  const [customDate, setCustomDate] = useState(false);
  const [nightLoad, setNightLoad] = useState<ShowOpsNightLoad | null>(null);

  useEffect(() => {
    setNightLoad(null);
    if (!productId || !/^\d{4}-\d{2}-\d{2}$/.test(showDate)) return;
    const t = setTimeout(() => {
      getNightLoadAction(productId, showDate)
        .then((res) => {
          if (res.ok) setNightLoad(res.load);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [productId, showDate]);

  const product = products.find((p) => p.id === productId) ?? null;
  const nights = useMemo(
    () =>
      showOpsRunNights({
        weekdays: product?.run_weekdays,
        bookedDates: product?.booked_dates,
        selected: customDate ? undefined : showDate,
      }),
    [product, showDate, customDate],
  );
  const nightGroups = useMemo(() => groupNightsByMonth(nights), [nights]);
  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const suppliersForIsland = product
    ? suppliers.filter((s) => partnerSellsOnIsland(s.island, product.island) || s.id === supplierId)
    : suppliers;
  const hotelsForIsland = product
    ? hotels.filter((h) => !product.island || h.island === product.island)
    : hotels;
  const hotel = hotelsForIsland.find((h) => h.id === hotelId) ?? hotels.find((h) => h.id === hotelId) ?? null;
  const stop =
    (pickupStopId ? stops.find((s) => s.id === pickupStopId) : null) ??
    (hotel?.bus_stop_id ? stops.find((s) => s.id === hotel.bus_stop_id) ?? null : null);
  const islandStops = stops.filter((s) =>
    pickupStopOffered(s, { island: product?.island, showDate, selectedId: pickupStopId }),
  );

  useEffect(() => {
    if (skipHotelFollow.current) {
      skipHotelFollow.current = false;
      return;
    }
    if (hotel?.bus_stop_id) setPickupStopId(hotel.bus_stop_id);
  }, [hotelId, hotel?.bus_stop_id]);

  useEffect(() => {
    if (product && product.transport_available === false && transport) setTransport(false);
  }, [product, transport]);

  const paxSlots = Math.min(adults + children + infants, 20);
  const attendeeType = (i: number) => (i < adults ? "adult" : i < adults + children ? "child" : "infant");
  const setAt = (list: string[], i: number, v: string) => {
    const next = [...list];
    while (next.length <= i) next.push("");
    next[i] = v;
    return next;
  };
  const specialMeals = attNotes.slice(0, paxSlots).filter((n) => n.trim()).length;

  const moneyFmt = (n: number) => formatShowOpsMoney(n, config.currency ?? "eur");
  const productPriceLabel = (p: BookingFormProduct) => {
    if (sellerMode && supplier?.billing_mode === "invoice") {
      const pct = Number(supplier.invoice_nett_percent);
      const adult =
        pct !== 100 ? p.adult_price * (pct / 100) : Number(p.adult_nett ?? p.adult_price);
      const child =
        pct !== 100 ? p.child_price * (pct / 100) : Number(p.child_nett ?? p.child_price);
      return `${p.name} · ${p.island} (${moneyFmt(adult)} / ${moneyFmt(child)} nett)`;
    }
    return `${p.name} · ${p.island} (${moneyFmt(p.adult_price)} / ${moneyFmt(p.child_price)})`;
  };

  const money = useMemo(
    () =>
      computeBookingMoney({
        adults,
        children,
        infants,
        product,
        supplier,
        transportRequired: transport,
      }),
    [adults, children, infants, product, supplier, transport],
  );
  // Commission = the slice the partner keeps (100% − the nett % we invoice them at).
  const commissionPct =
    supplier && supplier.billing_mode === "invoice"
      ? Math.max(0, round2(100 - Number(supplier.invoice_nett_percent || 100)))
      : 0;
  const commissionAmount = round2((money.total_cost * commissionPct) / 100);

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          setMsg(null);
          const res = await action(fd);
          if (!res.ok) {
            setMsg(res.message || "Save failed");
            return;
          }
          if (successPath) {
            const href = successPath.replace("{ref}", encodeURIComponent(res.message ?? ""));
            router.push(href);
            router.refresh();
          } else {
            router.refresh();
          }
        });
      }}
    >
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      {moneyLocked ? (
        <>
          <input type="hidden" name="product_id" value={productId} />
          <input type="hidden" name="supplier_id" value={supplierId} />
          <input type="hidden" name="adults" value={adults} />
          <input type="hidden" name="children" value={children} />
          <input type="hidden" name="infants" value={infants} />
          {transport ? <input type="hidden" name="transport_required" value="1" /> : null}
        </>
      ) : null}
      {msg ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{msg}</p> : null}
      {moneyLocked ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          This booking is on an invoice pack. Pax, show, supplier and transport are locked — void the invoice to change
          them. Comments still save.
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        {/* ── 1 · The show ─────────────────────────────── */}
        <StepColumn step={1} label="The show">
          <FieldLabel>Show</FieldLabel>
          <select
            name="product_id"
            required
            value={productId}
            onChange={(e) => {
              const next = e.target.value;
              setProductId(next);
              setCustomDate(false);
              const p = products.find((x) => x.id === next);
              if (p && hotelId) {
                const stillOk = hotels.some((h) => h.id === hotelId && h.island === p.island);
                if (!stillOk) setHotelId("");
              }
              const nextNights = showOpsRunNights({
                weekdays: p?.run_weekdays,
                bookedDates: p?.booked_dates,
              });
              if (!nextNights.includes(showDate)) setShowDate(nextNights[0] ?? "");
            }}
            className={INPUT}
            disabled={moneyLocked}
          >
            <option value="">{products.length ? "Select a show" : "No shows saved yet"}</option>
            {product && !products.some((p) => p.id === product.id) ? (
              <option value={product.id}>{productPriceLabel(product)}</option>
            ) : null}
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {productPriceLabel(p)}
              </option>
            ))}
          </select>
          {products.length === 0 ? (
            <p className="mt-1 text-xs text-amber-700">Add shows under Shows in the sidebar before taking a booking.</p>
          ) : null}

          <FieldLabel className="mt-4">Date</FieldLabel>
          {!productId ? (
            <select disabled className={INPUT} aria-label="Show date">
              <option>Pick a show first</option>
            </select>
          ) : (
            <>
              {customDate && !sellerMode ? (
                <input
                  type="date"
                  name="show_date"
                  required
                  value={showDate}
                  onChange={(e) => setShowDate(e.target.value)}
                  className={INPUT}
                />
              ) : (
                <select
                  name="show_date"
                  required
                  value={showDate}
                  onChange={(e) => setShowDate(e.target.value)}
                  className={INPUT}
                >
                  <option value="">{nights.length ? `Select a ${product?.name ?? "show"} night…` : "No nights on the books"}</option>
                  {nightGroups.map((g) => (
                    <optgroup key={g.month} label={g.month}>
                      {g.dates.map((d) => (
                        <option key={d} value={d}>
                          {showOpsNightLabel(d)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
              <ShowOpsNightCalendar
                nights={nights}
                selected={showDate}
                onSelect={(iso) => {
                  setCustomDate(false);
                  setShowDate(iso);
                }}
              />
              <p className="mt-1 text-xs text-slate-500">
                {product?.run_weekdays?.length
                  ? "Purple dates are nights this show runs."
                  : nights.length
                    ? "Purple dates are nights already on the books. Set run nights under Shows for the full schedule."
                    : "This show has no run nights yet — set them under Shows."}{" "}
                {customDate && !sellerMode ? (
                  <button type="button" className="font-semibold text-[var(--show-ops-primary,#7c3aed)] underline" onClick={() => setCustomDate(false)}>
                    Back to listed nights
                  </button>
                ) : !sellerMode ? (
                  <button type="button" className="underline" onClick={() => setCustomDate(true)}>
                    Night not listed
                  </button>
                ) : null}
              </p>
            </>
          )}

          <FieldLabel className="mt-4">Adults</FieldLabel>
          <Stepper name="adults" value={adults} onChange={setAdults} disabled={moneyLocked} />
          <FieldLabel className="mt-4">Children</FieldLabel>
          <Stepper name="children" value={children} onChange={setChildren} disabled={moneyLocked} />
          <FieldLabel className="mt-4">Infants</FieldLabel>
          <Stepper name="infants" value={infants} onChange={setInfants} disabled={moneyLocked} />

          {sellerMode ? (
            <>
              <input type="hidden" name="supplier_id" value={supplierId} />
              <input
                type="hidden"
                name="sales_channel"
                value={supplier?.partner_type || defaults.sales_channel || "partner"}
              />
            </>
          ) : (
            <>
              <FieldLabel className="mt-4">Partner / supplier</FieldLabel>
              <select
                name="supplier_id"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className={INPUT}
                disabled={moneyLocked}
              >
                <option value="">—</option>
                {suppliersForIsland.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.island ? ` · ${s.island}` : ""} · {s.billing_mode}
                    {s.billing_mode === "deposit" ? ` ${s.deposit_percent}%` : ` nett ${s.invoice_nett_percent}%`}
                  </option>
                ))}
              </select>
              <FieldLabel className="mt-4">Sales channel</FieldLabel>
              <select
                name="sales_channel"
                className={INPUT}
                defaultValue={defaults.sales_channel || config.sales_channels[0] || "direct"}
              >
                {config.sales_channels.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </>
          )}

          <div className="mt-4 space-y-1.5 rounded-xl bg-slate-50 px-3 py-3 text-sm ring-1 ring-slate-200/70">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-slate-600">
                {sellerMode ? "Your rate" : "Ticket total"}
                {product ? (
                  <span className="text-slate-400">
                    : {adults} × {moneyFmt(product.adult_price)}
                    {children > 0 ? ` + ${children} × ${moneyFmt(product.child_price)}` : ""}
                  </span>
                ) : null}
              </span>
              <span className="font-semibold tabular-nums text-slate-900">{moneyFmt(money.total_cost)}</span>
            </div>
            {commissionPct > 0 ? (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-slate-600">
                  {sellerMode ? "Your commission" : "Partner commission"} ({commissionPct}%)
                </span>
                <span className="font-semibold tabular-nums text-rose-600">−{moneyFmt(commissionAmount)}</span>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-2 border-t border-slate-200 pt-1.5">
              <span className="font-semibold text-slate-900">
                {money.billing_mode === "invoice" ? "Nett to invoice" : "Deposit to collect"}
              </span>
              <span className="text-lg font-semibold tabular-nums" style={{ color: ACCENT }}>
                {moneyFmt(money.billing_mode === "invoice" ? money.nett_total : money.deposit_amount)}
              </span>
            </div>
          </div>

          {nightLoad ? (
            <div className="mt-3 rounded-xl bg-violet-50/70 px-3 py-2.5 ring-1 ring-violet-100">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-900/60">
                Capacity left tonight
              </p>
              <p className="text-lg font-semibold tabular-nums text-violet-900">
                {nightLoad.show_free != null ? `${nightLoad.show_free} tickets` : `${nightLoad.show_pax} booked`}
              </p>
              <p className="text-[11px] text-violet-900/60">
                {nightLoad.seats_ordered != null
                  ? `Bus ${nightLoad.bus_pax}/${nightLoad.seats_ordered} · ${nightLoad.bus_free} seats free`
                  : "No bus ordered for this night yet"}
              </p>
              {nightLoad.close_kind === "full" ? (
                <p className="mt-1 text-xs font-semibold text-rose-800">Fully closed — partners cannot add more. Office can still override.</p>
              ) : nightLoad.close_kind === "part" ? (
                <p className="mt-1 text-xs font-semibold text-amber-800">Part close — last seats only.</p>
              ) : null}
            </div>
          ) : null}
        </StepColumn>

        {/* ── 2 · Attendees ────────────────────────────── */}
        <StepColumn step={2} label="Attendees" note={paxSlots ? `${paxSlots} of ${paxSlots}` : undefined}>
          <FieldLabel>Lead booking name</FieldLabel>
          <input name="guest_name" required defaultValue={defaults.guest_name} className={INPUT} />
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div>
              <FieldLabel>Mobile</FieldLabel>
              <input name="guest_mobile" defaultValue={defaults.guest_mobile ?? ""} className={INPUT} />
            </div>
            <div>
              <FieldLabel>Email</FieldLabel>
              <input type="email" name="guest_email" defaultValue={defaults.guest_email ?? ""} className={INPUT} />
            </div>
          </div>
          {mode === "create" ? (
            <label className="mt-3 flex items-start gap-2 text-xs text-slate-600">
              <input type="checkbox" name="send_ticket" value="1" defaultChecked className="mt-0.5" />
              Send the guest their ticket (email / text) with QR and pick-up details
            </label>
          ) : null}

          {paxSlots > 0 ? (
            <div className="mt-4 space-y-2">
              {Array.from({ length: paxSlots }, (_, i) => {
                const type = attendeeType(i);
                const note = attNotes[i] ?? "";
                const flagged = Boolean(note.trim());
                return (
                  <div
                    key={i}
                    className={`rounded-xl px-3 py-2.5 ring-1 ${
                      flagged ? "bg-violet-50 ring-violet-200" : "bg-white ring-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      <input
                        name={`attendee_name_${i}`}
                        value={attNames[i] ?? ""}
                        onChange={(e) => setAttNames((l) => setAt(l, i, e.target.value))}
                        placeholder={`${type === "adult" ? "Adult" : type === "child" ? "Child" : "Infant"} ${i + 1}`}
                        className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-0"
                      />
                    </div>
                    <div className="mt-1 flex items-center gap-2 pl-6">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{type}</span>
                      <span className="text-slate-300">·</span>
                      <input
                        name={`attendee_note_${i}`}
                        value={note}
                        onChange={(e) => setAttNotes((l) => setAt(l, i, e.target.value))}
                        placeholder="no notes"
                        className={`w-full border-0 bg-transparent p-0 text-xs focus:outline-none focus:ring-0 ${
                          flagged ? "font-medium text-violet-900" : "text-slate-500 placeholder:text-slate-400"
                        }`}
                      />
                      {flagged ? (
                        <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                          meal
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <p className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-center text-xs text-slate-500">
                Change the adult / child / infant counts to add or remove attendees
              </p>
            </div>
          ) : null}

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="dietary_required"
              value="1"
              checked={dietary}
              onChange={(e) => setDietary(e.target.checked)}
            />
            Dietary restriction on this booking
          </label>
          {dietary && config.dietary_mode === "options" && config.dietary_options.length ? (
            <fieldset className="mt-2 space-y-2 text-sm">
              <div className="flex flex-wrap gap-3">
                {config.dietary_options.map((opt) => (
                  <label key={opt} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      name="dietary_option"
                      value={opt}
                      defaultChecked={Boolean(defaults.dietary_notes?.includes(opt))}
                    />
                    {opt}
                  </label>
                ))}
              </div>
              <input name="dietary_notes" defaultValue="" placeholder="Extra notes" className={INPUT} />
            </fieldset>
          ) : null}
          {dietary && (config.dietary_mode !== "options" || !config.dietary_options.length) ? (
            <input
              name="dietary_notes"
              defaultValue={defaults.dietary_notes ?? ""}
              className={`${INPUT} mt-2`}
              placeholder="e.g. 1x gluten free, child nut allergy"
            />
          ) : null}
          {config.booking_questions.map((q) => (
            <div key={q.id} className="mt-3">
              <CustomQuestionField q={q} defaults={defaults.custom_answers} />
            </div>
          ))}
        </StepColumn>

        {/* ── 3 · Pick-up ──────────────────────────────── */}
        <StepColumn step={3} label="Pick-up">
          <FieldLabel>Hotel</FieldLabel>
          <select name="hotel_id" value={hotelId} onChange={(e) => setHotelId(e.target.value)} className={INPUT}>
            <option value="">—</option>
            {hotelsForIsland.map((h) => {
              const hotelStop = h.bus_stop_id ? stops.find((s) => s.id === h.bus_stop_id) : null;
              const t = hotelStop?.pickup_time ? String(hotelStop.pickup_time).slice(0, 5) : "";
              return (
                <option key={h.id} value={h.id}>
                  {h.name}
                  {t ? ` · ${t}` : ""}
                </option>
              );
            })}
          </select>
          {product && hotelsForIsland.length === 0 ? (
            <p className="mt-1 text-xs text-amber-700">No hotels on {product.island} yet — add under Master data.</p>
          ) : null}

          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="transport_required"
              value="1"
              checked={transport && Boolean(product?.transport_available !== false)}
              disabled={moneyLocked || product?.transport_available === false}
              onChange={(e) => setTransport(e.target.checked)}
            />
            Transport required
            {product?.transport_available === false ? (
              <span className="text-xs text-slate-500">· no bus on this show</span>
            ) : null}
          </label>

          {transport ? (
            <>
              <FieldLabel className="mt-4">Pick-up point</FieldLabel>
              <select
                name="pickup_stop_id"
                value={pickupStopId}
                onChange={(e) => setPickupStopId(e.target.value)}
                className={INPUT}
              >
                <option value="">— pick a stop —</option>
                {islandStops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.resort} · {s.stop_name}
                    {s.pickup_time ? ` · ${String(s.pickup_time).slice(0, 5)}` : ""}
                    {s.runs_on ? ` · ${s.runs_on}` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                {hotel?.bus_stop_id && pickupStopId === hotel.bus_stop_id
                  ? `Assigned by hotel${stop?.resort ? `: ${stop.resort}` : ""}.`
                  : hotel?.bus_stop_id && pickupStopId
                    ? "Custom stop (not the hotel default)."
                    : "Changing this only moves this booking."}
              </p>

              <div className="mt-3 space-y-2 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pick-up</p>
                  <p className="text-2xl font-semibold tabular-nums text-slate-900">
                    {stop?.pickup_time ? String(stop.pickup_time).slice(0, 5) : "—"}
                  </p>
                </div>
                <div className="border-t border-slate-200 pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Show</p>
                  <p className="text-2xl font-semibold tabular-nums text-slate-900">
                    {product?.show_time ? String(product.show_time).slice(0, 5) : "—"}
                  </p>
                </div>
              </div>
            </>
          ) : null}

          <FieldLabel className="mt-4">Supplier ticket #</FieldLabel>
          <input
            name="supplier_ticket_number"
            defaultValue={defaults.supplier_ticket_number ?? ""}
            className={INPUT}
          />
          <FieldLabel className="mt-3">Comments (office list)</FieldLabel>
          <textarea
            name="office_comments"
            rows={2}
            defaultValue={defaults.office_comments ?? ""}
            className={INPUT}
          />
          {sellerMode ? null : (
            <>
              <FieldLabel className="mt-3">Office-only comments</FieldLabel>
              <textarea
                name="office_only_comments"
                rows={2}
                defaultValue={defaults.office_only_comments ?? ""}
                className={INPUT}
              />
            </>
          )}
        </StepColumn>
      </div>

      {/* ── Summary + price breakdown ─────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-slate-900 p-5 text-sm text-white">
          <h3 className="font-semibold">Booking summary</h3>
          <dl className="mt-3 space-y-2">
            <SummaryLine label="Show" value={product?.name ?? "—"} />
            <SummaryLine
              label="Date"
              value={showDate ? `${showOpsDayName(showDate) ?? ""}, ${showDate}` : "—"}
            />
            <SummaryLine
              label="Attendees"
              value={
                [
                  adults ? `${adults} Adult${adults === 1 ? "" : "s"}` : "",
                  children ? `${children} Child${children === 1 ? "" : "ren"}` : "",
                  infants ? `${infants} Infant${infants === 1 ? "" : "s"}` : "",
                ]
                  .filter(Boolean)
                  .join(", ") || "—"
              }
            />
            {transport ? (
              <>
                <SummaryLine label="Pick-up point" value={stop ? `${stop.resort} · ${stop.stop_name}` : "Not set"} />
                <SummaryLine
                  label="Pick-up time"
                  value={stop?.pickup_time ? String(stop.pickup_time).slice(0, 5) : "—"}
                />
              </>
            ) : (
              <SummaryLine label="Transport" value="Guest makes own way" />
            )}
            <SummaryLine label="Show time" value={product?.show_time ? String(product.show_time).slice(0, 5) : "—"} />
            {specialMeals > 0 || dietary ? (
              <SummaryLine
                label="Special notes"
                value={specialMeals > 0 ? `${specialMeals} special meal${specialMeals === 1 ? "" : "s"}` : "Dietary noted"}
              />
            ) : null}
          </dl>
        </div>

        <div className="rounded-2xl bg-white p-5 text-sm shadow-sm ring-1 ring-slate-200/80">
          <h3 className="font-semibold text-slate-900">Price breakdown</h3>
          <dl className="mt-3 space-y-2">
            {product ? (
              <>
                <PriceLine
                  label={`Adults (${adults} × ${moneyFmt(product.adult_price)})`}
                  value={moneyFmt(round2(adults * Number(product.adult_price)))}
                />
                {children > 0 ? (
                  <PriceLine
                    label={`Children (${children} × ${moneyFmt(product.child_price)})`}
                    value={moneyFmt(round2(children * Number(product.child_price)))}
                  />
                ) : null}
                {infants > 0 && Number(product.infant_price) > 0 ? (
                  <PriceLine
                    label={`Infants (${infants} × ${moneyFmt(product.infant_price)})`}
                    value={moneyFmt(round2(infants * Number(product.infant_price)))}
                  />
                ) : null}
              </>
            ) : (
              <p className="text-slate-500">Pick a show to see the price.</p>
            )}
            <div className="border-t border-slate-200 pt-2">
              <PriceLine label={sellerMode ? "Your rate" : "Ticket total"} value={moneyFmt(money.total_cost)} strong />
            </div>
            {commissionPct > 0 ? (
              <PriceLine
                label={`${sellerMode ? "Your commission" : "Partner commission"} (${commissionPct}%)`}
                value={`− ${moneyFmt(commissionAmount)}`}
                tone="rose"
              />
            ) : null}
          </dl>
          <div
            className="mt-3 flex items-baseline justify-between gap-2 rounded-xl px-3 py-2.5"
            style={{ backgroundColor: "rgba(124,58,237,0.08)" }}
          >
            <span className="font-semibold" style={{ color: ACCENT }}>
              {money.billing_mode === "invoice" ? "Nett to invoice" : "Deposit to collect"}
            </span>
            <span className="text-lg font-semibold tabular-nums" style={{ color: ACCENT }}>
              {moneyFmt(money.billing_mode === "invoice" ? money.nett_total : money.deposit_amount)}
            </span>
          </div>
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Once confirmed, the booking appears in that night&apos;s lists
            {money.billing_mode === "invoice" ? " and on the next invoice." : " and on the bus board."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
          style={{ backgroundColor: ACCENT }}
        >
          <Check className="h-4 w-4" aria-hidden />
          {pending ? "Saving…" : mode === "edit" ? "Update booking" : "Confirm booking"}
        </button>
      </div>
    </form>
  );
}

const INPUT =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100";
const ACCENT = "var(--show-ops-primary,#7c3aed)";

function FieldLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 ${className}`}>{children}</p>
  );
}

function StepColumn({
  step,
  label,
  note,
  children,
}: {
  step: number;
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: ACCENT }}
        >
          {step}
        </span>
        <span className="text-sm font-semibold text-slate-900">{label}</span>
      </div>
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
          {note ? <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{note}</span> : null}
        </div>
        {children}
      </section>
    </div>
  );
}

function Stepper({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-xl border border-slate-200">
      <button
        type="button"
        aria-label={`One fewer ${name}`}
        disabled={disabled || value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-11 shrink-0 text-lg font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-40"
      >
        −
      </button>
      <NumberInput
        min={0}
        name={name}
        value={value}
        disabled={disabled}
        onValueChange={(n) => onChange(Math.max(0, n === "" ? 0 : n))}
        className="w-full border-x border-slate-200 py-2.5 text-center text-base font-semibold text-slate-900 focus:outline-none"
      />
      <button
        type="button"
        aria-label={`One more ${name}`}
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        className="w-11 shrink-0 text-lg font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-white/50">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function PriceLine({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "rose";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? "font-semibold text-slate-900" : "text-slate-600"}>{label}</dt>
      <dd
        className={`tabular-nums ${tone === "rose" ? "text-rose-600" : strong ? "font-semibold text-slate-900" : "text-slate-700"}`}
      >
        {value}
      </dd>
    </div>
  );
}
