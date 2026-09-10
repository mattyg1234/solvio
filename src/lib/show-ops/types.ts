export type ShowOpsBillingTier = "starter" | "ops" | "finance";

export type ShowOpsModule =
  | "bookings"
  | "lists"
  | "payments"
  | "invoices"
  | "commercial";

export type ShowOpsMemberRole = "booker" | "office" | "finance" | "admin" | "seller";

export type ShowOpsBillingMode = "deposit" | "invoice";

export type ShowOpsPaymentMethod = "cash" | "card" | "direct" | "transfer";

export const SHOW_OPS_PAYMENT_METHODS: ShowOpsPaymentMethod[] = ["cash", "card", "direct", "transfer"];

export const SHOW_OPS_PAYMENT_METHOD_LABELS: Record<ShowOpsPaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  direct: "Direct",
  transfer: "Transfer",
};

export function parseShowOpsPaymentMethod(raw: unknown): ShowOpsPaymentMethod | null {
  const v = String(raw ?? "").trim().toLowerCase();
  return (SHOW_OPS_PAYMENT_METHODS as string[]).includes(v) ? (v as ShowOpsPaymentMethod) : null;
}

export type ShowOpsPickupKind = "bus" | "private" | "own_way";

export type ShowOpsPrivateAccommodation = "hotel" | "villa" | "airbnb" | "friends_family";

/** Legacy channel ids still accepted; tenants can add their own via config.sales_channels. */
export type ShowOpsSalesChannel = string;

export type ShowOpsBookingQuestionType = "text" | "textarea" | "select" | "checkbox" | "number";

export type ShowOpsBookingQuestion = {
  id: string;
  label: string;
  type: ShowOpsBookingQuestionType;
  required?: boolean;
  options?: string[];
  /** Show on office list column when set */
  show_on_office_list?: boolean;
};

export type ShowOpsCurrency = "eur" | "gbp" | "usd";

export type ShowOpsConfig = {
  /** Regions / islands / departure areas — whatever the operator calls them */
  islands: string[];
  /** UI label for islands column (e.g. "Island", "Region", "Departure") */
  location_label: string;
  /** UI label for products (e.g. "Show", "Trip", "Boat party") */
  product_label: string;
  partner_types: string[];
  sales_channels: string[];
  dietary_mode: "free_text" | "options";
  dietary_options: string[];
  booking_questions: ShowOpsBookingQuestion[];
  enabled_modules: ShowOpsModule[];
  feature_flags: Record<string, boolean>;
  /** Display + Stripe Checkout currency */
  currency: ShowOpsCurrency;
  /**
   * Per-island currency overrides — e.g. { "UK Tour": "gbp" } for a tour leg
   * sold in pounds while the rest of the workspace trades in euros. Islands
   * named "UK…" default to gbp even when unset.
   */
  island_currencies: Record<string, ShowOpsCurrency>;
  /** Email Stripe Checkout links for guest deposits when Connect is ready */
  guest_stripe_enabled: boolean;
  /** Pay-links on partner invoice packs — off until the tenant opts in */
  partner_stripe_enabled: boolean;
  /**
   * Added per adult and per child when a booking takes the bus. Infants never pay it.
   * A show that carries its own explicit with/without-transport price pair keeps that
   * pair and ignores this.
   */
  transport_supplement: number;
  /** In-house morning digest — office emails, one per line */
  office_report_emails: string[];
  report_presets?: {
    office_sort?: "supplier_surname";
  };
  /** Issuer + tax defaults for invoices. Verifactu API uses these snapshots. */
  invoice: {
    series: string;
    defaultVatRate: number;
    issuerName: string;
    issuerTaxId: string;
    issuerAddress: string;
    /** Printed against the tax line on invoices: IGIC (Canaries), IVA, VAT. */
    taxLabel: string;
    /** Free text printed in the invoice footer: bank details, registration line. */
    footerNote: string;
    /** Short name for the footer line "Thank you for working with …"; falls back to the workspace name. */
    thankYouName: string;
  };
};

export const DEFAULT_SHOW_OPS_CONFIG: ShowOpsConfig = {
  islands: ["Main area"],
  location_label: "Region",
  product_label: "Trip / ticket",
  partner_types: ["tour_op", "agency", "hotel", "shop", "partner"],
  sales_channels: ["direct", "tour_op", "hotel", "shop", "agency", "partner", "other"],
  dietary_mode: "free_text",
  dietary_options: [],
  booking_questions: [],
  enabled_modules: ["bookings", "lists", "payments", "invoices", "commercial"],
  feature_flags: {},
  currency: "eur",
  island_currencies: {},
  guest_stripe_enabled: true,
  partner_stripe_enabled: false,
  transport_supplement: 0,
  office_report_emails: [],
  report_presets: { office_sort: "supplier_surname" },
  invoice: {
    series: "INV",
    defaultVatRate: 7,
    issuerName: "",
    issuerTaxId: "",
    issuerAddress: "",
    taxLabel: "IGIC",
    footerNote: "",
    thankYouName: "",
  },
};

export type ShowOpsBranding = {
  displayName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  customDomain: string | null;
};

export const DEFAULT_SHOW_OPS_BRANDING: Pick<ShowOpsBranding, "primaryColor" | "accentColor"> = {
  primaryColor: "#7c3aed",
  accentColor: "#14b8a6",
};

export type ShowSupplier = {
  id: string;
  business_id: string;
  name: string;
  partner_type: string;
  island: string | null;
  billing_mode: ShowOpsBillingMode;
  deposit_percent: number;
  invoice_nett_percent: number;
  email: string | null;
  notes: string | null;
  tax_id: string | null;
  legal_name: string | null;
  invoice_address: string | null;
  no_show_policy: "charge" | "write_off";
  active: boolean;
  /** Rate cards (Lanzasoft tarifas). The sale card prices bookings; the invoice card is reference only. */
  sale_rate_id?: string | null;
  invoice_rate_id?: string | null;
};

export type ShowProduct = {
  id: string;
  business_id: string;
  name: string;
  island: string;
  ticket_type: string;
  adult_price: number;
  child_price: number;
  infant_price: number;
  adult_price_no_transport: number | null;
  child_price_no_transport: number | null;
  infant_price_no_transport: number | null;
  adult_nett: number | null;
  child_nett: number | null;
  transport_available: boolean;
  capacity: number | null;
  active: boolean;
};

export type ShowBusStop = {
  id: string;
  business_id: string;
  island: string;
  /** Resort code driving the outlook columns and private pick-ups (PDC, CT, TFS, …). */
  zone: string | null;
  resort: string;
  stop_name: string;
  pickup_time: string | null;
  sort_order: number;
  /** Link to the stop on a map — "Map" on the bus run sheet. */
  map_url: string | null;
  /** Photo of the pick-up point — small image on the bus run sheet. */
  photo_url: string | null;
  active: boolean;
};

export type ShowHotel = {
  id: string;
  business_id: string;
  name: string;
  island: string;
  bus_stop_id: string | null;
  active: boolean;
};

export type ShowBooking = {
  id: string;
  business_id: string;
  booking_ref: string;
  show_date: string;
  guest_name: string;
  guest_mobile: string | null;
  guest_email: string | null;
  hotel_id: string | null;
  hotel_name: string | null;
  transport_required: boolean;
  /** bus = our coach (transport_required), private = own transfer from a resort, own_way = walks in. */
  pickup_kind: ShowOpsPickupKind;
  private_accommodation: ShowOpsPrivateAccommodation | null;
  /** Resort zone code (show_bus_stops.zone) a private-transfer guest comes from. */
  private_zone: string | null;
  pickup_stop_id: string | null;
  pickup_stop_name: string | null;
  pickup_time: string | null;
  dietary_required: boolean;
  dietary_notes: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  billing_mode: ShowOpsBillingMode;
  product_id: string | null;
  show_name: string;
  island: string;
  adults: number;
  children: number;
  infants: number;
  total_cost: number;
  deposit_amount: number;
  balance_remaining: number;
  nett_total: number;
  adult_nett_total: number;
  child_nett_total: number;
  supplier_ticket_number: string | null;
  office_comments: string | null;
  office_only_comments: string | null;
  sales_channel: ShowOpsSalesChannel;
  custom_answers: Record<string, string | boolean | number>;
  payment_status: "unpaid" | "partial" | "paid" | "n_a";
  /** How the guest paid; null until the office picks one. */
  payment_method: ShowOpsPaymentMethod | null;
  invoice_id: string | null;
  arrived_at: string | null;
  arrived_pax: number | null;
  no_show: boolean;
  no_show_charge: "charge" | "write_off" | null;
  no_show_proof_path: string | null;
  door_pay_method: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type ShowInvoice = {
  id: string;
  business_id: string;
  supplier_id: string | null;
  supplier_name: string;
  island: string | null;
  period_start: string;
  period_end: string;
  verifactu_number: string | null;
  invoice_date: string | null;
  payment_terms_days: number;
  due_date: string | null;
  total_amount: number;
  paid: boolean;
  paid_at: string | null;
  voided: boolean;
  voided_at: string | null;
  emailed_at: string | null;
  emailed_to: string | null;
  created_at: string;
};

export type ShowBusOrder = {
  id: string;
  business_id: string;
  show_date: string;
  island: string;
  seats_ordered: number;
  bus_count: number;
  cost_total: number;
  notes: string | null;
  /** Guide riding this island's coach tonight. */
  guide_name: string | null;
};

/** Tonight's dragged running order of pick-up stops, one row per island per night. */
export type ShowBusNightOrder = {
  id: string;
  business_id: string;
  show_date: string;
  island: string;
  stop_ids: string[];
  updated_by: string | null;
  updated_at: string;
};

/** One save that changed something on a booking: {field: {from, to}}. */
export type ShowBookingHistory = {
  id: string;
  business_id: string;
  booking_id: string;
  changed_at: string;
  changed_by: string | null;
  changed_by_name: string | null;
  changes: Record<string, { from: unknown; to: unknown }>;
};

export type ShowOpsWorkspace = {
  businessId: string;
  name: string;
  displayName: string;
  role: ShowOpsMemberRole | "owner";
  isOwner: boolean;
  showOpsEnabled: boolean;
  supplierId: string | null;
  /** Explicit page allow-list; null means fall back to the role default. */
  allowedPages?: string[] | null;
  allowedIslands?: string[] | null;
};
