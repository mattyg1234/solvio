"use client";

import {
  applyTicketType,
  ticketTransportAvailable,
  type ShowTicketType,
} from "@/lib/show-ops/ticket-types";
import { Check, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { hotelNamesForStops } from "@/lib/show-ops/directory-search";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  getNightLoadAction,
  loadSupplierRatePricesAction,
  type ShowOpsNightLoad,
} from "@/app/dashboard/show-ops/actions";
import { ShowOpsNightCalendar } from "@/components/show-ops/night-calendar";
import {
  SearchableSelect,
  type SearchableOption,
} from "@/components/show-ops/searchable-select";
import { NumberInput } from "@/components/ui/number-input";
import {
  calculateExtras,
  sameExtraSelection,
  type ShowExtra,
  type ExtraSnapshot,
  type ExtraSelection,
} from "@/lib/show-ops/extras";
import { showOpsCurrencyFor } from "@/lib/show-ops/config";
import {
  computeBookingMoney,
  formatShowOpsMoney,
  hasPricingSnapshot,
  round2,
  showOpsDayName,
  type ShowOpsPricingSnapshot,
} from "@/lib/show-ops/calc";
import { pickRatePrice, type RatePriceRow } from "@/lib/show-ops/rate-cards";
import { pickupStopOffered } from "@/lib/show-ops/bus";
import { partnerSellsOnIsland } from "@/lib/show-ops/partners";
import {
  PRIVATE_ACCOMMODATIONS,
  PRIVATE_ACCOMMODATION_LABELS,
  parsePickupKind,
  parsePrivateAccommodation,
  privatePickupLabel,
  zoneOptionsFromStops,
  type PickupKind,
} from "@/lib/show-ops/private-pickup";
import {
  groupNightsByMonth,
  showOpsNightLabel,
  showOpsRunNights,
} from "@/lib/show-ops/nights";
import {
  SHOW_OPS_PAYMENT_METHODS,
  SHOW_OPS_PAYMENT_METHOD_LABELS,
  type ShowOpsBookingQuestion,
  type ShowOpsConfig,
} from "@/lib/show-ops/types";

export type BookingFormProduct = {
  show_ticket_types?: ShowTicketType[];
  show_extras?: ShowExtra[];
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
  /** Partners with this on may be switched between deposit and invoice per booking. */
  can_choose_billing_mode?: boolean | null;
  /** The rate card this partner sells at; null = master price + bus supplement. */
  sale_rate_id?: string | null;
};

export type BookingFormRateBook = {
  card: { id: string; name: string | null } | null;
  rows: RatePriceRow[];
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
  /** Resort code (PDC, CT…) — feeds the resort list for private transfers. */
  zone?: string | null;
};

export type BookingFormDefaults = {
  extras_snapshot?: ExtraSnapshot[];
  /** Edit mode: the prices the booking was sold at. Kept while show / partner / bus stay the same. */
  pricing_snapshot?: ShowOpsPricingSnapshot | null;
  id?: string;
  /** Partner booking link token — the action resolves the partner from it, no login. */
  partner_token?: string;
  show_date?: string;
  guest_name?: string;
  guest_mobile?: string | null;
  guest_email?: string | null;
  product_id?: string | null;
  ticket_type_id?: string | null;
  ticket_type_name?: string | null;
  hotel_id?: string | null;
  pickup_stop_id?: string | null;
  supplier_id?: string | null;
  transport_required?: boolean;
  /** bus / private / own_way — falls back to transport_required on older rows. */
  pickup_kind?: string | null;
  private_accommodation?: string | null;
  private_zone?: string | null;
  payment_method?: string | null;
  dietary_required?: boolean;
  dietary_notes?: string | null;
  adults?: number;
  children?: number;
  infants?: number;
  sales_channel?: string;
  supplier_ticket_number?: string | null;
  office_comments?: string | null;
  office_only_comments?: string | null;
  billing_mode?: "deposit" | "invoice";
  custom_answers?: Record<string, string | boolean | number>;
  attendees?: Array<{
    name?: string | null;
    type?: string | null;
    note?: string | null;
  }> | null;
};

type Props = {
  mode: "create" | "edit";
  action: (
    formData: FormData,
  ) => Promise<
    { ok: true; id?: string; message?: string } | { ok: false; message: string }
  >;
  /** Absolute path to navigate after success. Use `{ref}` for booking ref, or `{id}` for the created seller booking. */
  successPath?: string;
  products: BookingFormProduct[];
  suppliers: BookingFormSupplier[];
  hotels: BookingFormHotel[];
  stops: BookingFormStop[];
  config: ShowOpsConfig;
  defaults?: BookingFormDefaults;
  error?: string | null;
  /** Locked partner portal — supplier is fixed, office-only fields hidden. */
  sellerMode?: boolean;
  /** Invoiced bookings: money/pax/show/supplier stay frozen. */
  moneyLocked?: boolean;
  /**
   * Rate card of the one partner this form can book for (seller portal, partner
   * link). Multi-partner desks leave it unset and the form fetches on selection.
   */
  ratePrices?: BookingFormRateBook | null;
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
        <input
          type="checkbox"
          name={name}
          value="1"
          defaultChecked={Boolean(prev)}
        />
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
  ratePrices,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(error ?? null);
  const [extraChoices, setExtraChoices] = useState<{
    productId: string;
    selections: ExtraSelection[];
  }>(() => ({
    productId: defaults.product_id ?? "",
    selections: (defaults.extras_snapshot ?? []).map((line) => ({
      id: line.id,
      quantity: line.charge_basis === "quantity" ? line.quantity : 1,
    })),
  }));
  const [ticketTypeId, setTicketTypeId] = useState(
    defaults.ticket_type_id ?? "",
  );
  const [productId, setProductId] = useState(defaults.product_id ?? "");
  const [supplierId, setSupplierId] = useState(defaults.supplier_id ?? "");
  /**
   * The chosen partner's rate card. Preloaded on single-partner pages; the desk
   * fetches it when the partner changes. A stale reply (partner switched again
   * while a fetch was in flight) is dropped, never applied to the wrong partner.
   */
  const [rateBook, setRateBook] = useState<BookingFormRateBook | null>(ratePrices ?? null);
  const [rateBookLoading, setRateBookLoading] = useState(false);
  const rateFetchSeq = useRef(0);
  useEffect(() => {
    if (ratePrices !== undefined) return;
    const seq = ++rateFetchSeq.current;
    if (!supplierId) {
      setRateBook(null);
      setRateBookLoading(false);
      return;
    }
    setRateBookLoading(true);
    loadSupplierRatePricesAction(supplierId)
      .then((book) => {
        if (rateFetchSeq.current !== seq) return;
        setRateBook(book);
      })
      .catch(() => {
        if (rateFetchSeq.current !== seq) return;
        setRateBook(null);
      })
      .finally(() => {
        if (rateFetchSeq.current === seq) setRateBookLoading(false);
      });
  }, [supplierId, ratePrices]);
  const [channel, setChannel] = useState(
    defaults.sales_channel || config.sales_channels[0] || "direct",
  );
  /** Set once the operator overrides the channel by hand; stops the partner re-writing it. */
  const channelPinned = useRef(Boolean(defaults.sales_channel));
  const [hotelId, setHotelId] = useState(defaults.hotel_id ?? "");
  const [pickupStopId, setPickupStopId] = useState(
    defaults.pickup_stop_id ?? "",
  );
  const skipHotelFollow = useRef(Boolean(defaults.pickup_stop_id));
  // Bus / Private / Own way. transport_required (pricing + bus list) is simply "kind is bus".
  const [pickupKind, setPickupKind] = useState<PickupKind>(() =>
    parsePickupKind(defaults.pickup_kind, Boolean(defaults.transport_required)),
  );
  const transport = pickupKind === "bus";
  const [privateAcc, setPrivateAcc] = useState(
    defaults.private_accommodation ?? "",
  );
  const [privateZone, setPrivateZone] = useState(defaults.private_zone ?? "");
  const [paymentMethod, setPaymentMethod] = useState(
    defaults.payment_method ?? "",
  );
  const [dietary, setDietary] = useState(Boolean(defaults.dietary_required));
  const [adults, setAdults] = useState(defaults.adults ?? 2);
  const [children, setChildren] = useState(defaults.children ?? 0);
  const [infants, setInfants] = useState(defaults.infants ?? 0);
  const [attNames, setAttNames] = useState<string[]>(() =>
    (defaults.attendees ?? []).map((a) => a?.name ?? ""),
  );
  const [attNotes, setAttNotes] = useState<string[]>(() =>
    (defaults.attendees ?? []).map((a) => a?.note ?? ""),
  );
  const [billingMode, setBillingMode] = useState<"deposit" | "invoice" | "">(
    defaults.billing_mode ?? "",
  );
  const [showDate, setShowDate] = useState(defaults.show_date ?? "");
  const [customDate, setCustomDate] = useState(false);
  const [nightLoad, setNightLoad] = useState<ShowOpsNightLoad | null>(null);
  /** Set on a successful create so the desk can read the ref back to the caller. */
  const [saved, setSaved] = useState<SavedBooking | null>(null);

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

  const baseProduct = products.find((p) => p.id === productId) ?? null;
  const selectedTicketType =
    baseProduct?.show_ticket_types?.find((t) => t.id === ticketTypeId) ?? null;
  const product = useMemo(() => {
    if (!baseProduct) return null;
    const pricedProduct = applyTicketType(baseProduct, selectedTicketType);
    return {
      ...pricedProduct,
      transport_available: ticketTransportAvailable(
        pricedProduct.transport_available,
        productId,
        ticketTypeId,
        mode === "edit"
          ? {
              product_id: defaults.product_id,
              ticket_type_id: defaults.ticket_type_id,
              transport_required: defaults.transport_required,
            }
          : undefined,
      ),
    };
  }, [
    baseProduct,
    selectedTicketType,
    productId,
    ticketTypeId,
    mode,
    defaults.product_id,
    defaults.ticket_type_id,
    defaults.transport_required,
  ]);

  /*
   * The desk works location → date → ticket type, in that order: an operator on
   * the phone knows which island the caller is on long before they know which
   * show they want. Everything below narrows from that.
   */
  const islands = useMemo(
    () =>
      [...new Set(products.map((p) => p.island).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [products],
  );
  const [island, setIsland] = useState(
    () =>
      products.find((p) => p.id === defaults.product_id)?.island ??
      (islands.length === 1 ? islands[0] : ""),
  );
  const islandProducts = useMemo(
    () => (island ? products.filter((p) => p.island === island) : products),
    [products, island],
  );

  const runNightsFor = (p: BookingFormProduct) =>
    showOpsRunNights({ weekdays: p.run_weekdays, bookedDates: p.booked_dates });

  /** Every night any show on this island runs — the date list before a show is picked. */
  const nights = useMemo(() => {
    const set = new Set<string>();
    for (const p of islandProducts) for (const d of runNightsFor(p)) set.add(d);
    if (!customDate && showDate) set.add(showDate);
    return [...set].sort();
  }, [islandProducts, showDate, customDate]);
  const nightGroups = useMemo(() => groupNightsByMonth(nights), [nights]);

  /**
   * Ticket types on that island running that night. If nothing matches — a show
   * with no run nights set yet — the whole island's list is offered rather than
   * an empty dropdown the operator cannot get past.
   */
  const showsForNight = useMemo(() => {
    if (!showDate) return islandProducts;
    const running = islandProducts.filter((p) =>
      runNightsFor(p).includes(showDate),
    );
    return running.length ? running : islandProducts;
  }, [islandProducts, showDate]);
  /** The location everything downstream filters by: the show's if picked, else the operator's choice. */
  const activeIsland = product?.island || island || "";
  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const suppliersForIsland = activeIsland
    ? suppliers.filter(
        (s) =>
          partnerSellsOnIsland(s.island, activeIsland) || s.id === supplierId,
      )
    : suppliers;
  const hotelsForIsland = activeIsland
    ? hotels.filter((h) => h.island === activeIsland)
    : hotels;
  const hotel =
    hotelsForIsland.find((h) => h.id === hotelId) ??
    hotels.find((h) => h.id === hotelId) ??
    null;
  const stop =
    (pickupStopId ? stops.find((s) => s.id === pickupStopId) : null) ??
    (hotel?.bus_stop_id
      ? (stops.find((s) => s.id === hotel.bus_stop_id) ?? null)
      : null);
  const islandStops = stops.filter((s) =>
    pickupStopOffered(s, {
      island: activeIsland || undefined,
      showDate,
      selectedId: pickupStopId,
    }),
  );

  useEffect(() => {
    if (skipHotelFollow.current) {
      skipHotelFollow.current = false;
      return;
    }
    if (hotel?.bus_stop_id) setPickupStopId(hotel.bus_stop_id);
  }, [hotelId, hotel?.bus_stop_id]);

  useEffect(() => {
    if (product && product.transport_available === false && transport)
      setPickupKind("own_way");
  }, [product, transport]);

  /** Resort codes on this island's stops — the "from where" of a private transfer. */
  const zoneOptions = useMemo(
    () => zoneOptionsFromStops(stops, activeIsland || null),
    [stops, activeIsland],
  );
  const privateLabel = privatePickupLabel(
    privateZone,
    parsePrivateAccommodation(privateAcc),
  );

  /*
   * Classify the sale by the partner who made it. Legacy imports tend to stamp
   * every row with one channel regardless of who sold it, which wrecks the channel
   * split in the commercial stats — the partner's own type is the truth.
   */
  useEffect(() => {
    if (channelPinned.current) return;
    const type = suppliers.find((s) => s.id === supplierId)?.partner_type;
    setChannel(
      type || (supplierId ? "partner" : config.sales_channels[0] || "direct"),
    );
  }, [supplierId, suppliers, config.sales_channels]);

  const paxSlots = Math.min(adults + children + infants, 20);
  const attendeeType = (i: number) =>
    i < adults ? "adult" : i < adults + children ? "child" : "infant";
  const setAt = (list: string[], i: number, v: string) => {
    const next = [...list];
    while (next.length <= i) next.push("");
    next[i] = v;
    return next;
  };
  const specialMeals = attNotes
    .slice(0, paxSlots)
    .filter((n) => n.trim()).length;

  /*
   * Hotels carry no resort of their own — it comes from the stop they are
   * mapped to. Folding it into the searchable text means an operator who knows
   * the resort but not the hotel name can still find it, which is how the
   * phone call usually goes.
   */
  const hotelOptions = useMemo<SearchableOption[]>(
    () =>
      hotelsForIsland.map((h) => {
        const stopFor = h.bus_stop_id
          ? stops.find((s) => s.id === h.bus_stop_id)
          : null;
        const time = stopFor?.pickup_time
          ? String(stopFor.pickup_time).slice(0, 5)
          : "";
        const hint = [stopFor?.stop_name, stopFor?.resort, time].filter(Boolean).join(" · ");
        return {
          value: h.id,
          label: h.name,
          hint: hint || undefined,
          keywords: [stopFor?.resort, stopFor?.stop_name, h.island]
            .filter(Boolean)
            .join(" "),
        };
      }),
    [hotelsForIsland, stops],
  );

  const hotelNamesByStop = useMemo(() => hotelNamesForStops(hotels), [hotels]);
  const stopOptions = useMemo<SearchableOption[]>(
    () =>
      islandStops.map((s) => ({
        value: s.id,
        label: `${s.resort} · ${s.stop_name}`,
        hint:
          [
            s.pickup_time ? String(s.pickup_time).slice(0, 5) : "",
            s.runs_on ?? "",
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
        keywords: [s.resort, s.stop_name, s.runs_on, s.island, ...(hotelNamesByStop[s.id] ?? [])]
          .filter(Boolean)
          .join(" "),
      })),
    [islandStops, hotelNamesByStop],
  );

  const supplierOptions = useMemo<SearchableOption[]>(
    () =>
      suppliersForIsland.map((s) => ({
        value: s.id,
        label: s.name,
        hint: [
          s.island || "",
          s.billing_mode === "deposit"
            ? `deposit ${s.deposit_percent}%`
            : `invoice nett ${s.invoice_nett_percent}%`,
        ]
          .filter(Boolean)
          .join(" · "),
        keywords: s.partner_type ?? "",
      })),
    [suppliersForIsland],
  );

  const moneyFmt = (n: number) =>
    formatShowOpsMoney(n, showOpsCurrencyFor(config, baseProduct?.island));
  const supplement = Number(config.transport_supplement) || 0;
  /** Card row for the picked show and bus choice; null = master price + supplement. */
  const rateCard = useMemo(
    () => pickRatePrice(rateBook?.rows, productId, transport, rateBook?.card),
    [rateBook, productId, transport],
  );
  /**
   * Editing pax on the same show / ticket / partner / bus keeps the prices the
   * booking was sold at. Anything else reprices from the card or master price.
   */
  const frozen = useMemo(() => {
    if (mode !== "edit" || !hasPricingSnapshot(defaults.pricing_snapshot)) return null;
    const same =
      productId === (defaults.product_id ?? "") &&
      ticketTypeId === (defaults.ticket_type_id ?? "") &&
      supplierId === (defaults.supplier_id ?? "") &&
      transport === Boolean(defaults.transport_required);
    return same ? (defaults.pricing_snapshot as ShowOpsPricingSnapshot) : null;
  }, [mode, defaults, productId, ticketTypeId, supplierId, transport]);
  const productPriceLabel = (p: BookingFormProduct) => {
    const card = pickRatePrice(rateBook?.rows, p.id, transport);
    const adultGross = card ? card.adult_price : p.adult_price;
    const childGross = card ? card.child_price : p.child_price;
    if (sellerMode && supplier?.billing_mode === "invoice") {
      const pct = Number(supplier.invoice_nett_percent);
      const adult = adultGross * (pct / 100);
      const child = childGross * (pct / 100);
      return `${p.name} (${moneyFmt(adult)} / ${moneyFmt(child)} nett)`;
    }
    return `${p.name} (${moneyFmt(adultGross)} / ${moneyFmt(childGross)})`;
  };

  // Only a partner explicitly given the permission can be flipped between deposit
  // and invoice on a single booking; everyone else follows their partner record.
  const canPickBilling =
    Boolean(supplier?.can_choose_billing_mode) && !sellerMode && !moneyLocked;
  const effectiveBilling =
    canPickBilling && (billingMode === "deposit" || billingMode === "invoice")
      ? billingMode
      : undefined;

  const extraSelections = useMemo(
    () => (extraChoices.productId === productId ? extraChoices.selections : []),
    [extraChoices, productId],
  );
  const extrasPreview = useMemo(() => {
    const original = defaults.extras_snapshot ?? [];
    const originalSelection = original.map((line) => ({
      id: line.id,
      quantity: line.charge_basis === "quantity" ? line.quantity : 1,
    }));
    const unchanged =
      mode === "edit" &&
      productId === (defaults.product_id ?? "") &&
      ticketTypeId === (defaults.ticket_type_id ?? "") &&
      adults === (defaults.adults ?? 2) &&
      children === (defaults.children ?? 0) &&
      infants === (defaults.infants ?? 0) &&
      supplierId === (defaults.supplier_id ?? "") &&
      transport === Boolean(defaults.transport_required) &&
      (effectiveBilling ?? supplier?.billing_mode ?? "deposit") ===
        (defaults.billing_mode ?? supplier?.billing_mode ?? "deposit") &&
      sameExtraSelection(extraSelections, originalSelection);
    if (moneyLocked || unchanged) return { lines: original, error: "" };
    try {
      for (const selected of extraSelections) {
        const catalogueExtra = baseProduct?.show_extras?.find(
          (item) => item.id === selected.id,
        );
        const previous = original.find((line) => line.id === selected.id);
        if (catalogueExtra && !catalogueExtra.active && previous) {
          const nextQuantity =
            catalogueExtra.charge_basis === "per_person"
              ? adults + children + infants
              : catalogueExtra.charge_basis === "per_booking"
                ? 1
                : selected.quantity;
          if (nextQuantity !== previous.quantity)
            throw new Error(
              `Remove the archived extra "${previous.name}" before changing its quantity or passenger count.`,
            );
        }
      }
      return {
        lines: calculateExtras(
          baseProduct?.show_extras ?? [],
          extraSelections,
          adults + children + infants,
          Number(supplier?.invoice_nett_percent ?? 100),
          {
            allowArchived: mode === "edit" && productId === defaults.product_id,
          },
        ),
        error: "",
      };
    } catch (failure) {
      return {
        lines: [] as ExtraSnapshot[],
        error:
          failure instanceof Error
            ? failure.message
            : "Could not calculate extras. Check your selection.",
      };
    }
  }, [
    defaults,
    mode,
    productId,
    ticketTypeId,
    adults,
    children,
    infants,
    supplierId,
    transport,
    effectiveBilling,
    supplier,
    extraSelections,
    moneyLocked,
    baseProduct,
  ]);
  const extraLines = extrasPreview.lines;
  const visibleExtras = (baseProduct?.show_extras ?? []).filter(
    (extra) =>
      extra.active ||
      (productId === defaults.product_id &&
        defaults.extras_snapshot?.some((line) => line.id === extra.id)),
  );
  function updateExtra(id: string, quantity: number | null) {
    const next = extraSelections.filter((item) => item.id !== id);
    if (quantity !== null) next.push({ id, quantity });
    setExtraChoices({ productId, selections: next });
  }

  const money = useMemo(
    () =>
      computeBookingMoney({
        adults,
        children,
        infants,
        product,
        supplier,
        billingMode: effectiveBilling,
        transportRequired: transport,
        transportSupplement: supplement,
        extras: extraLines,
        rateCard,
        frozen,
      }),
    [
      adults,
      children,
      infants,
      product,
      supplier,
      transport,
      supplement,
      effectiveBilling,
      extraLines,
      rateCard,
      frozen,
    ],
  );
  // What the money above was actually priced at — card, master or the frozen original.
  const unit = money.pricing_snapshot;
  // The bus supplement only exists as a separate line when the price came from the master list.
  const supplementTotal =
    transport && product != null && unit.transport_supplement > 0
      ? round2(unit.transport_supplement * (adults + children))
      : 0;
  const priceSourceNote =
    unit.frozen_from
      ? "Prices kept from the original booking."
      : unit.price_source === "rate_card"
        ? `Priced from rate card${unit.rate_card?.name ? ` “${unit.rate_card.name}”` : ""}.`
        : rateBookLoading
          ? "Checking the partner's rate card…"
          : supplier?.sale_rate_id
            ? "No rate-card price for this show — master price used."
            : null;
  // Commission = the slice the partner keeps (100% − the nett % we invoice them at).
  const commissionPct =
    supplier && money.billing_mode === "invoice"
      ? Math.max(0, round2(100 - Number(supplier.invoice_nett_percent ?? 100)))
      : 0;
  const commissionAmount = round2(
    ((money.total_cost -
      extraLines.reduce((sum, line) => sum + line.gross_total, 0)) *
      commissionPct) /
      100 +
      extraLines.reduce(
        (sum, line) => sum + line.gross_total - line.nett_total,
        0,
      ),
  );

  if (saved) {
    return (
      <BookingSavedPanel
        saved={saved}
        onAnother={() => {
          setSaved(null);
          router.refresh();
        }}
        backHref={(successPath ?? "/dashboard/show-ops/bookings").replace(
          "{ref}",
          encodeURIComponent(saved.ref),
        )}
      />
    );
  }

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (extrasPreview.error) {
          setMsg(extrasPreview.error);
          return;
        }
        const fd = new FormData(e.currentTarget);
        start(async () => {
          setMsg(null);
          const res = await action(fd);
          if (!res.ok) {
            setMsg(res.message || "Save failed");
            return;
          }
          if (
            mode === "create" &&
            sellerMode &&
            res.id &&
            successPath?.includes("{id}")
          ) {
            router.push(
              successPath
                .replace("{id}", encodeURIComponent(res.id))
                .replace("{ref}", encodeURIComponent(res.message ?? "")),
            );
            router.refresh();
            return;
          }
          if (mode === "create") {
            // Read-back panel: the ref and the pick-up the guest is waiting to hear.
            setSaved({
              ref: res.message ?? "",
              show: product?.name ?? "",
              date: showDate,
              guestName: String(fd.get("guest_name") ?? ""),
              pax: { adults, children, infants },
              transport,
              privateLabel: pickupKind === "private" ? privateLabel : null,
              stopName:
                transport && stop ? `${stop.resort} · ${stop.stop_name}` : null,
              pickupTime:
                transport && stop?.pickup_time
                  ? String(stop.pickup_time).slice(0, 5)
                  : null,
              showTime: product?.show_time
                ? String(product.show_time).slice(0, 5)
                : null,
              total: moneyFmt(money.total_cost),
              dueLabel:
                money.billing_mode === "invoice"
                  ? "Nett to invoice"
                  : "Deposit to collect",
              dueAmount: moneyFmt(
                money.billing_mode === "invoice"
                  ? money.nett_total
                  : money.deposit_amount,
              ),
            });
            router.refresh();
            return;
          }
          if (successPath) {
            const href = successPath.replace(
              "{ref}",
              encodeURIComponent(res.message ?? ""),
            );
            router.push(href);
            router.refresh();
          } else {
            router.refresh();
          }
        });
      }}
    >
      <input
        type="hidden"
        name="extras"
        value={JSON.stringify(extraSelections)}
      />
      {defaults.id ? (
        <input type="hidden" name="id" value={defaults.id} />
      ) : null}
      {defaults.partner_token ? (
        <input type="hidden" name="partner_token" value={defaults.partner_token} />
      ) : null}
      {moneyLocked ? (
        <>
          <input type="hidden" name="product_id" value={productId} />
          <input type="hidden" name="supplier_id" value={supplierId} />
          <input type="hidden" name="adults" value={adults} />
          <input type="hidden" name="children" value={children} />
          <input type="hidden" name="infants" value={infants} />
          <input type="hidden" name="pickup_kind" value={pickupKind} />
          {transport ? (
            <input type="hidden" name="transport_required" value="1" />
          ) : null}
        </>
      ) : null}
      {msg ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {msg}
        </p>
      ) : null}
      {moneyLocked ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          This booking is on an invoice pack. Pax, show, supplier and transport
          are locked — void the invoice to change them. Comments still save.
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        {/* ── 1 · The show ─────────────────────────────── */}
        <StepColumn step={1} label={`${config.location_label}, date, ticket`}>
          {islands.length > 1 ? (
            <>
              <FieldLabel>{config.location_label}</FieldLabel>
              <select
                value={island}
                onChange={(e) => {
                  const next = e.target.value;
                  setIsland(next);
                  setCustomDate(false);
                  // Drop a show or hotel that does not belong to the new location.
                  const keptProduct = products.find((p) => p.id === productId);
                  if (keptProduct && next && keptProduct.island !== next)
                    setProductId("");
                  const keptHotel = hotels.find((h) => h.id === hotelId);
                  if (keptHotel && next && keptHotel.island !== next)
                    setHotelId("");
                }}
                className={INPUT}
                disabled={moneyLocked}
                aria-label={config.location_label}
              >
                <option value="">
                  All {config.location_label.toLowerCase()}s
                </option>
                {islands.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          <FieldLabel className={islands.length > 1 ? "mt-4" : ""}>
            Date
          </FieldLabel>
          {!nights.length && !customDate ? (
            <select disabled className={INPUT} aria-label="Show date">
              <option>
                No nights on the books{island ? ` for ${island}` : ""}
              </option>
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
                  <option value="">Select a night…</option>
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
                {showDate ? `${showOpsDayName(showDate) ?? ""} — ` : ""}
                purple dates are nights a show runs
                {island ? ` on ${island}` : ""}.{" "}
                {customDate && !sellerMode ? (
                  <button
                    type="button"
                    className="font-semibold text-[var(--show-ops-primary,#7c3aed)] underline"
                    onClick={() => setCustomDate(false)}
                  >
                    Back to listed nights
                  </button>
                ) : !sellerMode ? (
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setCustomDate(true)}
                  >
                    Night not listed
                  </button>
                ) : null}
              </p>
            </>
          )}

          <FieldLabel className="mt-4">Show</FieldLabel>
          <select
            name="product_id"
            required
            value={productId}
            onChange={(e) => {
              const next = e.target.value;
              setProductId(next);
              setTicketTypeId("");
              const p = products.find((x) => x.id === next);
              // A hotel from another island cannot survive the show change.
              if (
                p &&
                hotelId &&
                !hotels.some((h) => h.id === hotelId && h.island === p.island)
              ) {
                setHotelId("");
              }
              if (p?.island && p.island !== island) setIsland(p.island);
            }}
            className={INPUT}
            disabled={moneyLocked}
          >
            <option value="">
              {showsForNight.length
                ? "Select a show"
                : products.length
                  ? "Nothing runs that night"
                  : "No shows available with your access"}
            </option>
            {product && !showsForNight.some((p) => p.id === product.id) ? (
              <option value={product.id}>{productPriceLabel(product)}</option>
            ) : null}
            {showsForNight.map((p) => (
              <option key={p.id} value={p.id}>
                {productPriceLabel(p)}
              </option>
            ))}
          </select>
          {products.length === 0 ? (
            <p className="mt-1 text-xs text-amber-700">
              No shows are available with your current access. Contact an
              administrator if you need another show or island.
            </p>
          ) : null}

          {baseProduct ? (
            <label className="mt-4 block text-sm font-medium">
              Ticket type
              <select
                name="ticket_type_id"
                value={ticketTypeId}
                disabled={moneyLocked}
                onChange={(e) => setTicketTypeId(e.target.value)}
                className={INPUT}
              >
                <option value="">Standard ticket</option>
                {(baseProduct.show_ticket_types ?? [])
                  .filter((t) => t.active || t.id === defaults.ticket_type_id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.active ? "" : " (archived)"}
                    </option>
                  ))}
              </select>
              {moneyLocked ? (
                <input
                  type="hidden"
                  name="ticket_type_id"
                  value={ticketTypeId}
                />
              ) : null}
            </label>
          ) : null}

          <FieldLabel className="mt-4">Adults</FieldLabel>
          <Stepper
            name="adults"
            value={adults}
            onChange={setAdults}
            disabled={moneyLocked}
          />
          <FieldLabel className="mt-4">Children</FieldLabel>
          <Stepper
            name="children"
            value={children}
            onChange={setChildren}
            disabled={moneyLocked}
          />
          <FieldLabel className="mt-4">Infants</FieldLabel>
          <Stepper
            name="infants"
            value={infants}
            onChange={setInfants}
            disabled={moneyLocked}
          />

          {visibleExtras.length || extraSelections.length ? (
            <section
              className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
              aria-label="Optional extras"
            >
              <h3 className="text-sm font-semibold text-slate-900">
                Optional extras
              </h3>
              <p className="text-xs text-slate-500">
                Choose any additions. Per-guest extras charge for adults,
                children and infants.
              </p>
              {visibleExtras.map((extra) => {
                const selected = extraSelections.find(
                  (item) => item.id === extra.id,
                );
                const line = extraLines.find((item) => item.id === extra.id);
                return (
                  <div key={extra.id} className="rounded-lg bg-white p-3">
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(selected)}
                        disabled={moneyLocked}
                        onChange={(event) =>
                          updateExtra(extra.id, event.target.checked ? 1 : null)
                        }
                        className="mt-1"
                      />
                      <span>
                        <span className="font-medium">
                          {line?.name ?? extra.name}
                          {!extra.active ? " (archived)" : ""}
                        </span>
                        <span className="ml-2 text-slate-500">
                          {moneyFmt(line?.unit_price ?? extra.unit_price)} ·{" "}
                          {(line?.charge_basis ?? extra.charge_basis) ===
                          "per_booking"
                            ? "once per booking"
                            : (line?.charge_basis ?? extra.charge_basis) ===
                                "per_person"
                              ? "per guest, including infants"
                              : "each"}
                        </span>
                        {extra.description ? (
                          <span className="mt-1 block text-xs text-slate-500">
                            {extra.description}
                          </span>
                        ) : null}
                      </span>
                    </label>
                    {selected &&
                    (line?.charge_basis ?? extra.charge_basis) ===
                      "quantity" ? (
                      <label className="mt-2 block text-xs font-medium">
                        Quantity
                        <input
                          type="number"
                          min={1}
                          max={100}
                          step={1}
                          value={selected.quantity}
                          disabled={moneyLocked || !extra.active}
                          onChange={(event) =>
                            updateExtra(
                              extra.id,
                              Math.min(
                                100,
                                Math.max(
                                  1,
                                  Math.trunc(Number(event.target.value) || 1),
                                ),
                              ),
                            )
                          }
                          className="ml-2 w-20 rounded-lg border border-slate-200 px-2 py-1"
                        />
                      </label>
                    ) : null}
                    {line ? (
                      <p className="mt-2 text-xs font-medium text-slate-700">
                        {line.quantity} × {moneyFmt(line.unit_price)} ={" "}
                        {moneyFmt(line.gross_total)}
                      </p>
                    ) : null}
                  </div>
                );
              })}
              {extraSelections
                .filter(
                  (selection) =>
                    !visibleExtras.some((extra) => extra.id === selection.id),
                )
                .map((selection) => {
                  const line = defaults.extras_snapshot?.find(
                    (item) => item.id === selection.id,
                  );
                  return (
                    <p key={selection.id} className="text-xs text-slate-600">
                      {line ? (
                        <>
                          Recorded extra: {line.name} · {line.quantity} ×{" "}
                          {moneyFmt(line.unit_price)} ={" "}
                          {moneyFmt(line.gross_total)}
                        </>
                      ) : (
                        "This selected extra is no longer available."
                      )}
                      {!moneyLocked ? (
                        <button
                          type="button"
                          onClick={() => updateExtra(selection.id, null)}
                          className="ml-2 underline"
                        >
                          Remove extra
                        </button>
                      ) : null}
                    </p>
                  );
                })}
              {moneyLocked ? (
                <p className="text-xs text-slate-500">
                  Extras are locked with this invoice.
                </p>
              ) : null}
            </section>
          ) : null}
          {extrasPreview.error ? (
            <p role="alert" className="mt-3 text-sm text-rose-700">
              {extrasPreview.error}
            </p>
          ) : null}

          {sellerMode ? (
            <>
              <input type="hidden" name="supplier_id" value={supplierId} />
              <input
                type="hidden"
                name="sales_channel"
                value={
                  supplier?.partner_type || defaults.sales_channel || "partner"
                }
              />
            </>
          ) : (
            <>
              <FieldLabel className="mt-4">Partner / supplier</FieldLabel>
              <SearchableSelect
                name="supplier_id"
                value={supplierId}
                onChange={setSupplierId}
                options={supplierOptions}
                disabled={moneyLocked}
                ariaLabel="Partner / supplier"
                placeholder="Type a partner name…"
              />
              {canPickBilling ? (
                <>
                  <FieldLabel className="mt-4">
                    Billing for this booking
                  </FieldLabel>
                  <select
                    name="billing_mode"
                    value={billingMode || supplier?.billing_mode || "deposit"}
                    onChange={(e) =>
                      setBillingMode(e.target.value as "deposit" | "invoice")
                    }
                    className={INPUT}
                  >
                    <option value="deposit">
                      Deposit — collect {supplier?.deposit_percent}% now
                    </option>
                    <option value="invoice">
                      Invoice — nett {supplier?.invoice_nett_percent}% on the
                      monthly pack
                    </option>
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    {supplier?.name} is allowed to switch. Their default is{" "}
                    {supplier?.billing_mode}.
                  </p>
                </>
              ) : null}

              <FieldLabel className="mt-4">Sales channel</FieldLabel>
              <select
                name="sales_channel"
                className={INPUT}
                value={channel}
                onChange={(e) => {
                  channelPinned.current = true;
                  setChannel(e.target.value);
                }}
              >
                {[
                  ...new Set([
                    ...config.sales_channels,
                    ...suppliers.map((s) => s.partner_type).filter(Boolean),
                    channel,
                  ]),
                ]
                  .filter(Boolean)
                  .map((c) => (
                    <option key={c} value={c}>
                      {String(c).replace(/_/g, " ")}
                    </option>
                  ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                {supplier
                  ? `Set from ${supplier.name}'s partner type.`
                  : "Set from the partner once you pick one."}
              </p>
            </>
          )}

          <div className="mt-4 space-y-1.5 rounded-xl bg-slate-50 px-3 py-3 text-sm ring-1 ring-slate-200/70">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-slate-600">
                {sellerMode ? "Your rate" : "Ticket total"}
                {product ? (
                  <span className="text-slate-400">
                    : {adults} × {moneyFmt(unit.adult_price - unit.transport_supplement)}
                    {children > 0
                      ? ` + ${children} × ${moneyFmt(unit.child_price - unit.transport_supplement)}`
                      : ""}
                    {supplementTotal > 0
                      ? ` + bus ${moneyFmt(supplementTotal)}`
                      : ""}
                  </span>
                ) : null}
              </span>
              <span className="font-semibold tabular-nums text-slate-900">
                {moneyFmt(money.total_cost)}
              </span>
            </div>
            {priceSourceNote ? (
              <p className="text-xs text-slate-500">{priceSourceNote}</p>
            ) : null}
            {commissionPct > 0 ? (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-slate-600">
                  {sellerMode ? "Your commission" : "Partner commission"} (
                  {commissionPct}%)
                </span>
                <span className="font-semibold tabular-nums text-rose-600">
                  −{moneyFmt(commissionAmount)}
                </span>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-2 border-t border-slate-200 pt-1.5">
              <span className="font-semibold text-slate-900">
                {money.billing_mode === "invoice"
                  ? "Nett to invoice"
                  : "Deposit to collect"}
              </span>
              <span
                className="text-lg font-semibold tabular-nums"
                style={{ color: ACCENT }}
              >
                {moneyFmt(
                  money.billing_mode === "invoice"
                    ? money.nett_total
                    : money.deposit_amount,
                )}
              </span>
            </div>
          </div>

          {sellerMode ? null : (
            <>
              <FieldLabel className="mt-3">Paid by</FieldLabel>
              <select
                name="payment_method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className={INPUT}
                aria-label="Paid by"
              >
                <option value="">—</option>
                {SHOW_OPS_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {SHOW_OPS_PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </>
          )}

          {nightLoad ? (
            <div className="mt-3 rounded-xl bg-violet-50/70 px-3 py-2.5 ring-1 ring-violet-100">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-900/60">
                Capacity left tonight
              </p>
              <p className="text-lg font-semibold tabular-nums text-violet-900">
                {nightLoad.show_free != null
                  ? `${nightLoad.show_free} tickets`
                  : `${nightLoad.show_pax} booked`}
              </p>
              <p className="text-[11px] text-violet-900/60">
                {nightLoad.seats_ordered != null
                  ? `Bus ${nightLoad.bus_pax}/${nightLoad.seats_ordered} · ${nightLoad.bus_free} seats free`
                  : "No bus ordered for this night yet"}
              </p>
              {nightLoad.close_kind === "full" ? (
                <p className="mt-1 text-xs font-semibold text-rose-800">
                  Fully closed — partners cannot add more. Office can still
                  override.
                </p>
              ) : nightLoad.close_kind === "part" ? (
                <p className="mt-1 text-xs font-semibold text-amber-800">
                  Part close — last seats only.
                </p>
              ) : null}
            </div>
          ) : null}
        </StepColumn>

        {/* ── 2 · Attendees ────────────────────────────── */}
        <StepColumn
          step={2}
          label="Attendees"
          note={paxSlots ? `${paxSlots} of ${paxSlots}` : undefined}
        >
          <FieldLabel>Lead booking name</FieldLabel>
          <input
            name="guest_name"
            required
            defaultValue={defaults.guest_name}
            className={INPUT}
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div>
              <FieldLabel>Mobile</FieldLabel>
              <input
                name="guest_mobile"
                defaultValue={defaults.guest_mobile ?? ""}
                className={INPUT}
              />
            </div>
            <div>
              <FieldLabel>Email</FieldLabel>
              <input
                type="email"
                name="guest_email"
                defaultValue={defaults.guest_email ?? ""}
                className={INPUT}
              />
            </div>
          </div>
          {mode === "create" ? (
            <label className="mt-3 flex items-start gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                name="send_ticket"
                value="1"
                defaultChecked
                className="mt-0.5"
              />
              Send the guest their ticket (email / text) with QR and pick-up
              details
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
                      flagged
                        ? "bg-violet-50 ring-violet-200"
                        : "bg-white ring-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Users
                        className="h-4 w-4 shrink-0 text-slate-400"
                        aria-hidden
                      />
                      <input
                        name={`attendee_name_${i}`}
                        value={attNames[i] ?? ""}
                        onChange={(e) =>
                          setAttNames((l) => setAt(l, i, e.target.value))
                        }
                        placeholder={`${type === "adult" ? "Adult" : type === "child" ? "Child" : "Infant"} ${i + 1}`}
                        className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-0"
                      />
                    </div>
                    <div className="mt-1 flex items-center gap-2 pl-6">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {type}
                      </span>
                      <span className="text-slate-300">·</span>
                      <input
                        name={`attendee_note_${i}`}
                        value={note}
                        onChange={(e) =>
                          setAttNotes((l) => setAt(l, i, e.target.value))
                        }
                        placeholder="no notes"
                        className={`w-full border-0 bg-transparent p-0 text-xs focus:outline-none focus:ring-0 ${
                          flagged
                            ? "font-medium text-violet-900"
                            : "text-slate-500 placeholder:text-slate-400"
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
                Change the adult / child / infant counts to add or remove
                attendees
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
          {dietary &&
          config.dietary_mode === "options" &&
          config.dietary_options.length ? (
            <fieldset className="mt-2 space-y-2 text-sm">
              <div className="flex flex-wrap gap-3">
                {config.dietary_options.map((opt) => (
                  <label
                    key={opt}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <input
                      type="checkbox"
                      name="dietary_option"
                      value={opt}
                      defaultChecked={Boolean(
                        defaults.dietary_notes?.includes(opt),
                      )}
                    />
                    {opt}
                  </label>
                ))}
              </div>
              <input
                name="dietary_notes"
                defaultValue=""
                placeholder="Extra notes"
                className={INPUT}
              />
            </fieldset>
          ) : null}
          {dietary &&
          (config.dietary_mode !== "options" ||
            !config.dietary_options.length) ? (
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
          <SearchableSelect
            name="hotel_id"
            value={hotelId}
            onChange={setHotelId}
            options={hotelOptions}
            ariaLabel="Hotel"
            placeholder="Type a hotel or pickup name…"
          />
          {activeIsland && hotelsForIsland.length === 0 ? (
            <p className="mt-1 text-xs text-amber-700">
              No hotels on {activeIsland} yet — add under Master data.
            </p>
          ) : null}

          <FieldLabel className="mt-3">Getting there</FieldLabel>
          <select
            name="pickup_kind"
            value={pickupKind}
            disabled={moneyLocked}
            onChange={(e) => setPickupKind(e.target.value as PickupKind)}
            className={INPUT}
            aria-label="Getting there"
          >
            <option
              value="bus"
              disabled={product?.transport_available === false}
            >
              Bus
            </option>
            <option value="private">Private</option>
            <option value="own_way">Own way</option>
          </select>
          {moneyLocked ? null : (
            <input
              type="hidden"
              name="transport_required"
              value={transport ? "1" : "0"}
            />
          )}
          <p className="mt-1 text-xs text-slate-500">
            {product?.transport_available === false
              ? "No bus on this show."
              : supplier?.sale_rate_id
                ? "Bus and no-bus prices come from the partner's rate card. Infants free."
                : supplement > 0
                  ? `Bus adds ${moneyFmt(supplement)} per adult & child, infants free.`
                  : "Bus puts them on the coach list. Private and own way pay the no-bus price."}
          </p>

          {pickupKind === "private" ? (
            <>
              <FieldLabel className="mt-3">Staying at</FieldLabel>
              <select
                name="private_accommodation"
                required
                value={privateAcc}
                onChange={(e) => setPrivateAcc(e.target.value)}
                className={INPUT}
                aria-label="Staying at"
              >
                <option value="">Pick one…</option>
                {PRIVATE_ACCOMMODATIONS.map((a) => (
                  <option key={a} value={a}>
                    {PRIVATE_ACCOMMODATION_LABELS[a]}
                  </option>
                ))}
              </select>
              <FieldLabel className="mt-3">Resort</FieldLabel>
              {zoneOptions.length ? (
                <select
                  name="private_zone"
                  required
                  value={privateZone}
                  onChange={(e) => setPrivateZone(e.target.value)}
                  className={INPUT}
                  aria-label="Resort"
                >
                  <option value="">Pick a resort…</option>
                  {privateZone &&
                  !zoneOptions.some((z) => z.code === privateZone) ? (
                    <option value={privateZone}>{privateZone}</option>
                  ) : null}
                  {zoneOptions.map((z) => (
                    <option key={z.code} value={z.code}>
                      {z.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name="private_zone"
                  value={privateZone}
                  onChange={(e) => setPrivateZone(e.target.value.toUpperCase())}
                  placeholder="Resort code, e.g. PDC"
                  className={INPUT}
                  aria-label="Resort"
                />
              )}
              <p className="mt-1 text-xs text-slate-500">
                Office list shows: {privateLabel}.
              </p>
            </>
          ) : null}

          {transport ? (
            <>
              <FieldLabel className="mt-4">Pick-up point</FieldLabel>
              <SearchableSelect
                name="pickup_stop_id"
                value={pickupStopId}
                onChange={setPickupStopId}
                options={stopOptions}
                ariaLabel="Pick-up point"
                placeholder="Type a pickup or hotel name…"
                emptyLabel="— pick a stop —"
              />
              <p className="mt-1 text-xs text-slate-500">
                {hotel?.bus_stop_id && pickupStopId === hotel.bus_stop_id
                  ? `Assigned by hotel${stop?.resort ? `: ${stop.resort}` : ""}.`
                  : hotel?.bus_stop_id && pickupStopId
                    ? "Custom stop (not the hotel default)."
                    : "Changing this only moves this booking."}
              </p>

              <div className="mt-3 space-y-2 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Pick-up
                  </p>
                  <p className="text-2xl font-semibold tabular-nums text-slate-900">
                    {stop?.pickup_time
                      ? String(stop.pickup_time).slice(0, 5)
                      : "—"}
                  </p>
                </div>
                <div className="border-t border-slate-200 pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Show starts
                  </p>
                  {product?.show_time ? (
                    <p className="text-2xl font-semibold tabular-nums text-slate-900">
                      {String(product.show_time).slice(0, 5)}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-700">
                      {product
                        ? `No start time saved for ${product.name} — set it under Shows.`
                        : "Pick a show first."}
                    </p>
                  )}
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
              value={
                showDate
                  ? `${showOpsDayName(showDate) ?? ""}, ${showDate}`
                  : "—"
              }
            />
            <SummaryLine
              label="Attendees"
              value={
                [
                  adults ? `${adults} Adult${adults === 1 ? "" : "s"}` : "",
                  children
                    ? `${children} Child${children === 1 ? "" : "ren"}`
                    : "",
                  infants ? `${infants} Infant${infants === 1 ? "" : "s"}` : "",
                ]
                  .filter(Boolean)
                  .join(", ") || "—"
              }
            />
            {transport ? (
              <>
                <SummaryLine
                  label="Pick-up point"
                  value={
                    stop ? `${stop.resort} · ${stop.stop_name}` : "Not set"
                  }
                />
                <SummaryLine
                  label="Pick-up time"
                  value={
                    stop?.pickup_time
                      ? String(stop.pickup_time).slice(0, 5)
                      : "—"
                  }
                />
              </>
            ) : pickupKind === "private" ? (
              <SummaryLine label="Transport" value={privateLabel} />
            ) : (
              <SummaryLine label="Transport" value="Guest makes own way" />
            )}
            <SummaryLine
              label="Show time"
              value={
                product?.show_time ? String(product.show_time).slice(0, 5) : "—"
              }
            />
            {specialMeals > 0 || dietary ? (
              <SummaryLine
                label="Special notes"
                value={
                  specialMeals > 0
                    ? `${specialMeals} special meal${specialMeals === 1 ? "" : "s"}`
                    : "Dietary noted"
                }
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
                  label={`Adults (${adults} × ${moneyFmt(unit.adult_price - unit.transport_supplement)})`}
                  value={moneyFmt(round2(adults * (unit.adult_price - unit.transport_supplement)))}
                />
                {children > 0 ? (
                  <PriceLine
                    label={`Children (${children} × ${moneyFmt(unit.child_price - unit.transport_supplement)})`}
                    value={moneyFmt(
                      round2(children * (unit.child_price - unit.transport_supplement)),
                    )}
                  />
                ) : null}
                {infants > 0 && unit.infant_price > 0 ? (
                  <PriceLine
                    label={`Infants (${infants} × ${moneyFmt(unit.infant_price)})`}
                    value={moneyFmt(round2(infants * unit.infant_price))}
                  />
                ) : null}
                {supplementTotal > 0 ? (
                  <PriceLine
                    label={`Transport (${adults + children} × ${moneyFmt(supplement)}${infants > 0 ? ", infants free" : ""})`}
                    value={moneyFmt(supplementTotal)}
                  />
                ) : null}
              </>
            ) : (
              <p className="text-slate-500">Pick a show to see the price.</p>
            )}
            {extraLines.map((line) => (
              <PriceLine
                key={line.id}
                label={`${line.name} (${line.quantity} × ${moneyFmt(line.unit_price)})`}
                value={moneyFmt(line.gross_total)}
              />
            ))}
            <div className="border-t border-slate-200 pt-2">
              <PriceLine
                label={
                  sellerMode
                    ? "Your rate including extras"
                    : "Total including extras"
                }
                value={moneyFmt(money.total_cost)}
                strong
              />
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
              {money.billing_mode === "invoice"
                ? "Nett to invoice"
                : "Deposit to collect"}
            </span>
            <span
              className="text-lg font-semibold tabular-nums"
              style={{ color: ACCENT }}
            >
              {moneyFmt(
                money.billing_mode === "invoice"
                  ? money.nett_total
                  : money.deposit_amount,
              )}
            </span>
          </div>
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Once confirmed, the booking appears in that night&apos;s lists
            {money.billing_mode === "invoice"
              ? " and on the next invoice."
              : " and on the bus board."}
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
          disabled={pending || Boolean(extrasPreview.error)}
          className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
          style={{ backgroundColor: ACCENT }}
        >
          <Check className="h-4 w-4" aria-hidden />
          {pending
            ? "Saving…"
            : mode === "edit"
              ? "Update booking"
              : "Confirm booking"}
        </button>
      </div>
    </form>
  );
}

const INPUT =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100";
const ACCENT = "var(--show-ops-primary,#7c3aed)";

function FieldLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 ${className}`}
    >
      {children}
    </p>
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
          {note ? (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {note}
            </span>
          ) : null}
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
      <dt
        className={strong ? "font-semibold text-slate-900" : "text-slate-600"}
      >
        {label}
      </dt>
      <dd
        className={`tabular-nums ${tone === "rose" ? "text-rose-600" : strong ? "font-semibold text-slate-900" : "text-slate-700"}`}
      >
        {value}
      </dd>
    </div>
  );
}

type SavedBooking = {
  ref: string;
  show: string;
  date: string;
  guestName: string;
  pax: { adults: number; children: number; infants: number };
  transport: boolean;
  /** "Private PDC · Villa" when the guest has their own transfer. */
  privateLabel: string | null;
  stopName: string | null;
  pickupTime: string | null;
  showTime: string | null;
  total: string;
  dueLabel: string;
  dueAmount: string;
};

/**
 * What the operator reads back down the phone the moment a booking saves: the
 * reference first, then the day, the stop and the time the coach comes.
 */
function BookingSavedPanel({
  saved,
  onAnother,
  backHref,
}: {
  saved: SavedBooking;
  onAnother: () => void;
  backHref: string;
}) {
  const pax = [
    saved.pax.adults
      ? `${saved.pax.adults} adult${saved.pax.adults === 1 ? "" : "s"}`
      : "",
    saved.pax.children
      ? `${saved.pax.children} child${saved.pax.children === 1 ? "" : "ren"}`
      : "",
    saved.pax.infants
      ? `${saved.pax.infants} infant${saved.pax.infants === 1 ? "" : "s"}`
      : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mt-6 print:mt-0">
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div
          className="flex flex-wrap items-center gap-3 px-6 py-5"
          style={{ backgroundColor: ACCENT }}
        >
          <Check className="h-6 w-6 text-white" aria-hidden />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/70">
              Booking saved
            </p>
            <p className="font-mono text-2xl font-bold tracking-tight text-white">
              {saved.ref}
            </p>
          </div>
        </div>
        <dl className="divide-y divide-slate-100">
          <SavedLine label="Guest" value={saved.guestName} />
          <SavedLine label="Show" value={saved.show} />
          <SavedLine
            label="Date"
            value={
              saved.date
                ? `${showOpsDayName(saved.date) ?? ""} ${saved.date}`.trim()
                : "—"
            }
            strong
          />
          <SavedLine label="Party" value={pax || "—"} />
          {saved.transport ? (
            <>
              <SavedLine
                label="Pick-up stop"
                value={saved.stopName ?? "Not set"}
                strong
              />
              <SavedLine
                label="Pick-up time"
                value={saved.pickupTime ?? "—"}
                strong
              />
            </>
          ) : saved.privateLabel ? (
            <SavedLine label="Transport" value={saved.privateLabel} strong />
          ) : (
            <SavedLine label="Transport" value="Guest makes their own way" />
          )}
          <SavedLine label="Show starts" value={saved.showTime ?? "—"} />
          <SavedLine label="Total" value={saved.total} />
          <SavedLine label={saved.dueLabel} value={saved.dueAmount} strong />
        </dl>
      </div>
      <div className="mt-4 flex flex-wrap gap-3 print:hidden">
        <button
          type="button"
          onClick={onAnother}
          className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-sm"
          style={{ backgroundColor: ACCENT }}
        >
          Take another booking
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
        >
          Print
        </button>
        <a
          href={backHref}
          className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
        >
          Back to bookings
        </a>
      </div>
    </div>
  );
}

function SavedLine({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-6 py-3">
      <dt className="shrink-0 text-sm text-slate-500">{label}</dt>
      <dd
        className={`text-right text-sm ${strong ? "text-base font-semibold text-slate-900" : "text-slate-800"}`}
      >
        {value}
      </dd>
    </div>
  );
}
