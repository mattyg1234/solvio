import {
  DEFAULT_SHOW_OPS_BRANDING,
  DEFAULT_SHOW_OPS_CONFIG,
  type ShowOpsBillingTier,
  type ShowOpsBookingQuestion,
  type ShowOpsBookingQuestionType,
  type ShowOpsBranding,
  type ShowOpsConfig,
  type ShowOpsCurrency,
  type ShowOpsModule,
} from "@/lib/show-ops/types";
import { SHOW_OPS_FREE_LAUNCH } from "@/lib/show-ops/pricing";

const MODULES: ShowOpsModule[] = ["bookings", "lists", "payments", "invoices", "commercial"];
const QUESTION_TYPES: ShowOpsBookingQuestionType[] = ["text", "textarea", "select", "checkbox", "number"];

const TIER_MODULES: Record<ShowOpsBillingTier, ShowOpsModule[]> = {
  starter: ["bookings", "lists"],
  ops: ["bookings", "lists", "payments"],
  finance: ["bookings", "lists", "payments", "invoices", "commercial"],
};

function parseQuestions(raw: unknown): ShowOpsBookingQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: ShowOpsBookingQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const label = typeof o.label === "string" ? o.label.trim() : "";
    const type = QUESTION_TYPES.includes(o.type as ShowOpsBookingQuestionType)
      ? (o.type as ShowOpsBookingQuestionType)
      : "text";
    if (!id || !label) continue;
    const options = Array.isArray(o.options)
      ? o.options.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : undefined;
    out.push({
      id,
      label,
      type,
      required: Boolean(o.required),
      options,
      show_on_office_list: Boolean(o.show_on_office_list),
    });
  }
  return out;
}

function parseCurrency(raw: unknown): ShowOpsCurrency {
  return raw === "gbp" || raw === "usd" || raw === "eur" ? raw : DEFAULT_SHOW_OPS_CONFIG.currency;
}

function parseIslandCurrencies(raw: unknown): Record<string, ShowOpsCurrency> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, ShowOpsCurrency> = {};
  for (const [island, cur] of Object.entries(raw as Record<string, unknown>)) {
    if (cur === "gbp" || cur === "usd" || cur === "eur") out[island.trim()] = cur;
  }
  return out;
}

/**
 * Currency a given island trades in. Explicit override wins; islands named
 * "UK…" default to pounds; everything else uses the workspace currency.
 */
export function showOpsCurrencyFor(config: ShowOpsConfig, island?: string | null): ShowOpsCurrency {
  const name = (island ?? "").trim();
  if (!name) return config.currency;
  const override = config.island_currencies[name];
  if (override) return override;
  if (/^uk\b/i.test(name)) return "gbp";
  return config.currency;
}

function parseBool(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return fallback;
}

function parseInvoiceConfig(
  raw: unknown,
  mhtLegacy: boolean,
): ShowOpsConfig["invoice"] {
  const fallback = mhtLegacy
    ? { ...DEFAULT_SHOW_OPS_CONFIG.invoice, series: "MHT" }
    : DEFAULT_SHOW_OPS_CONFIG.invoice;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...fallback };
  const o = raw as Record<string, unknown>;
  const series =
    typeof o.series === "string" && o.series.trim()
      ? o.series.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12)
      : fallback.series;
  const vat = Number(o.defaultVatRate);
  return {
    series: series || fallback.series,
    defaultVatRate: Number.isFinite(vat) && vat >= 0 ? vat : fallback.defaultVatRate,
    issuerName: typeof o.issuerName === "string" ? o.issuerName.trim() : fallback.issuerName,
    issuerTaxId: typeof o.issuerTaxId === "string" ? o.issuerTaxId.trim() : fallback.issuerTaxId,
    issuerAddress: typeof o.issuerAddress === "string" ? o.issuerAddress.trim() : fallback.issuerAddress,
    taxLabel: typeof o.taxLabel === "string" && o.taxLabel.trim() ? o.taxLabel.trim().slice(0, 12) : fallback.taxLabel,
    footerNote: typeof o.footerNote === "string" ? o.footerNote.trim().slice(0, 600) : fallback.footerNote,
    thankYouName: typeof o.thankYouName === "string" ? o.thankYouName.trim().slice(0, 60) : fallback.thankYouName,
  };
}

/** Money kept out of negative territory; anything unparseable falls back. */
function parseMoney(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n * 100) / 100;
}

function splitList(raw: unknown, fallback: string[]): string[] {
  if (Array.isArray(raw)) {
    const list = raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim());
    return list.length ? list : fallback;
  }
  return fallback;
}

export function parseShowOpsConfig(raw: unknown): ShowOpsConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ...DEFAULT_SHOW_OPS_CONFIG,
      islands: [...DEFAULT_SHOW_OPS_CONFIG.islands],
      partner_types: [...DEFAULT_SHOW_OPS_CONFIG.partner_types],
      sales_channels: [...DEFAULT_SHOW_OPS_CONFIG.sales_channels],
      dietary_options: [...DEFAULT_SHOW_OPS_CONFIG.dietary_options],
      booking_questions: [],
      enabled_modules: [...DEFAULT_SHOW_OPS_CONFIG.enabled_modules],
      feature_flags: { ...DEFAULT_SHOW_OPS_CONFIG.feature_flags },
      invoice: { ...DEFAULT_SHOW_OPS_CONFIG.invoice },
    };
  }
  const o = raw as Record<string, unknown>;
  const islands = splitList(o.islands, DEFAULT_SHOW_OPS_CONFIG.islands);
  const partner_types = splitList(o.partner_types, DEFAULT_SHOW_OPS_CONFIG.partner_types);
  const sales_channels = splitList(o.sales_channels, DEFAULT_SHOW_OPS_CONFIG.sales_channels);
  const dietary_options = splitList(o.dietary_options, []);
  const enabled = Array.isArray(o.enabled_modules)
    ? o.enabled_modules.filter((x): x is ShowOpsModule => MODULES.includes(x as ShowOpsModule))
    : DEFAULT_SHOW_OPS_CONFIG.enabled_modules;
  const flags =
    o.feature_flags && typeof o.feature_flags === "object" && !Array.isArray(o.feature_flags)
      ? (o.feature_flags as Record<string, boolean>)
      : {};

  const mhtLegacy = Boolean(flags.mht_tracker_v1);
  return {
    islands,
    location_label:
      typeof o.location_label === "string" && o.location_label.trim()
        ? o.location_label.trim()
        : mhtLegacy
          ? "Island"
          : DEFAULT_SHOW_OPS_CONFIG.location_label,
    product_label:
      typeof o.product_label === "string" && o.product_label.trim()
        ? o.product_label.trim()
        : mhtLegacy
          ? "Show"
          : DEFAULT_SHOW_OPS_CONFIG.product_label,
    partner_types,
    sales_channels,
    dietary_mode: o.dietary_mode === "options" ? "options" : "free_text",
    dietary_options,
    booking_questions: parseQuestions(o.booking_questions),
    enabled_modules: enabled.length ? enabled : [...DEFAULT_SHOW_OPS_CONFIG.enabled_modules],
    feature_flags: flags,
    currency: parseCurrency(o.currency),
    island_currencies: parseIslandCurrencies(o.island_currencies),
    guest_stripe_enabled: parseBool(o.guest_stripe_enabled, DEFAULT_SHOW_OPS_CONFIG.guest_stripe_enabled),
    partner_stripe_enabled: parseBool(o.partner_stripe_enabled, false),
    transport_supplement: parseMoney(o.transport_supplement, DEFAULT_SHOW_OPS_CONFIG.transport_supplement),
    office_report_emails: splitList(o.office_report_emails, []).filter((e) => e.includes("@")),
    report_presets: { office_sort: "supplier_surname" },
    invoice: parseInvoiceConfig(o.invoice, mhtLegacy),
  };
}

export function modulesForTier(tier: ShowOpsBillingTier): ShowOpsModule[] {
  if (SHOW_OPS_FREE_LAUNCH) return [...MODULES];
  return [...TIER_MODULES[tier]];
}

/** Effective modules = intersection of billing tier ceiling and config.enabled_modules. */
export function effectiveModules(config: ShowOpsConfig, tier: ShowOpsBillingTier): ShowOpsModule[] {
  if (SHOW_OPS_FREE_LAUNCH) return [...MODULES];
  const tierSet = modulesForTier(tier);
  if (!config.enabled_modules.length) return tierSet;
  return tierSet.filter((m) => config.enabled_modules.includes(m));
}

export function hasShowOpsModule(
  config: ShowOpsConfig,
  tier: ShowOpsBillingTier,
  module: ShowOpsModule,
): boolean {
  return effectiveModules(config, tier).includes(module);
}

export function brandingFromBusiness(row: {
  name?: string | null;
  logo_url?: string | null;
  show_ops_display_name?: string | null;
  show_ops_logo_url?: string | null;
  show_ops_primary_color?: string | null;
  show_ops_accent_color?: string | null;
  show_ops_custom_domain?: string | null;
}): ShowOpsBranding {
  return {
    displayName: (row.show_ops_display_name || row.name || "Show Ops").trim(),
    logoUrl: (row.show_ops_logo_url || row.logo_url || null)?.trim() || null,
    primaryColor: row.show_ops_primary_color?.trim() || DEFAULT_SHOW_OPS_BRANDING.primaryColor,
    accentColor: row.show_ops_accent_color?.trim() || DEFAULT_SHOW_OPS_BRANDING.accentColor,
    customDomain: row.show_ops_custom_domain?.trim() || null,
  };
}

/** Generic starter config for any operator (boat party, tour desk, etc.). */
export function genericSeedConfig(locationNames?: string[]): ShowOpsConfig {
  return {
    ...DEFAULT_SHOW_OPS_CONFIG,
    islands: locationNames?.length ? locationNames : ["Main area"],
    location_label: "Region",
    product_label: "Trip / ticket",
    currency: "gbp",
    guest_stripe_enabled: true,
    partner_stripe_enabled: false,
    feature_flags: {},
    booking_questions: [
      {
        id: "special_requests",
        label: "Special requests",
        type: "textarea",
        required: false,
        show_on_office_list: true,
      },
    ],
    enabled_modules: ["bookings", "lists", "payments", "invoices", "commercial"],
    invoice: { ...DEFAULT_SHOW_OPS_CONFIG.invoice, taxLabel: "VAT" },
  };
}

/** MHT Canaries seed — design partner defaults. */
export function mhtSeedConfig(): ShowOpsConfig {
  return {
    ...DEFAULT_SHOW_OPS_CONFIG,
    islands: ["Lanzarote", "Fuerteventura", "Gran Canaria", "Tenerife", "UK Tour"],
    location_label: "Island",
    product_label: "Show",
    partner_types: [
      "Ticket Shops",
      "Online Agency",
      "Hotel Reception",
      "Tour Ops",
      "Other Outlets",
      "GYG",
      "MHT Direct",
      "MHT Web",
      "MHT Reception",
    ],
    currency: "eur",
    island_currencies: { "UK Tour": "gbp" },
    guest_stripe_enabled: true,
    partner_stripe_enabled: false,
    transport_supplement: 10,
    feature_flags: { mht_tracker_v1: true },
    booking_questions: [],
    enabled_modules: ["bookings", "lists", "payments", "invoices", "commercial"],
    invoice: {
      ...DEFAULT_SHOW_OPS_CONFIG.invoice,
      series: "MHT",
      defaultVatRate: 7,
    },
  };
}

export function slugifyQuestionId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || `q_${Date.now().toString(36)}`;
}
