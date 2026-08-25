/** Show Ops SaaS tiers (EUR / month) — sellable later. Launch is free. */

export const SHOW_OPS_FREE_LAUNCH = true;

export const SHOW_OPS_STARTER_EUR = 199;
export const SHOW_OPS_OPS_EUR = 399;
export const SHOW_OPS_FINANCE_EUR = 699;
export const SHOW_OPS_SETUP_EUR = 2000;
export const SHOW_OPS_SEAT_EUR = 20;
export const SHOW_OPS_INCLUDED_SEATS = 5;

export type ShowOpsPlanId = "starter" | "ops" | "finance";

export const SHOW_OPS_PLANS: {
  id: ShowOpsPlanId;
  name: string;
  monthlyEur: number;
  blurb: string;
  modules: string[];
}[] = [
  {
    id: "starter",
    name: "Show Ops Starter",
    monthlyEur: SHOW_OPS_STARTER_EUR,
    blurb: "Bookings, master data, office/bus/dietary lists, daily sales export.",
    modules: ["bookings", "lists"],
  },
  {
    id: "ops",
    name: "Show Ops",
    monthlyEur: SHOW_OPS_OPS_EUR,
    blurb: "Everything in Starter plus payments clearing, weekly outlook, bus capacity.",
    modules: ["bookings", "lists", "payments"],
  },
  {
    id: "finance",
    name: "Show Ops Finance",
    monthlyEur: SHOW_OPS_FINANCE_EUR,
    blurb: "Invoice packs, Verifactu fields, overdue, commercial / YoY trackers.",
    modules: ["bookings", "lists", "payments", "invoices", "commercial"],
  },
];
