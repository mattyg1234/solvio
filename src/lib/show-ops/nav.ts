export type ShowOpsNavItem = {
  href: string;
  label: string;
  exact?: boolean;
  key: string;
  tab?: string;
};

export type ShowOpsNavSection = {
  id: string;
  label: string;
  items: ShowOpsNavItem[];
};

/** Left-rail groups — same order as the MHT Show Ops redesign. */
export const SHOW_OPS_NAV_SECTIONS: ShowOpsNavSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { href: "/dashboard/show-ops", label: "Dashboard", exact: true, key: "dashboard" },
      { href: "/dashboard/show-ops/calendar", label: "Show calendar", key: "calendar" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { href: "/dashboard/show-ops/master?tab=shows", label: "Shows", key: "shows", tab: "shows" },
      { href: "/dashboard/show-ops/bookings", label: "Bookings", key: "bookings" },
      { href: "/dashboard/show-ops/door", label: "Door", key: "door" },
      { href: "/dashboard/show-ops/invoices", label: "Invoicing", key: "invoices" },
      { href: "/dashboard/show-ops/master?tab=partners", label: "Partners", key: "partners", tab: "partners" },
      { href: "/dashboard/show-ops/master?tab=hotels", label: "Hotels & pick-ups", key: "hotels", tab: "hotels" },
      { href: "/dashboard/show-ops/buses", label: "Bus board", key: "buses" },
      { href: "/dashboard/show-ops/master?tab=rates", label: "Rates & commissions", key: "rates", tab: "rates" },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    items: [
      { href: "/dashboard/show-ops/outlook", label: "Outlook", key: "outlook" },
      { href: "/dashboard/show-ops/reports", label: "Reports", key: "reports" },
      { href: "/dashboard/show-ops/stats", label: "Stats & insights", key: "stats" },
      { href: "/dashboard/show-ops/lists", label: "Night lists", key: "lists" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    items: [{ href: "/dashboard/show-ops/settings", label: "Settings", key: "settings" }],
  },
];

export const SHOW_OPS_SIDEBAR_LINKS: ShowOpsNavItem[] = SHOW_OPS_NAV_SECTIONS.flatMap((section) => section.items);

export const SHOW_OPS_MOBILE_PRIMARY_KEYS = ["dashboard", "door", "bookings"] as const;

export function showOpsNavActive(
  pathname: string,
  searchTab: string | null,
  item: ShowOpsNavItem,
): boolean {
  if (item.exact) return pathname === item.href.split("?")[0];
  if (item.tab) {
    const current = searchTab || "shows";
    return pathname.startsWith("/dashboard/show-ops/master") && current === item.tab;
  }
  if (item.key === "bookings") {
    return pathname === "/dashboard/show-ops/bookings" || pathname.startsWith("/dashboard/show-ops/bookings/");
  }
  if (item.key === "door") {
    return pathname === "/dashboard/show-ops/door" || pathname.startsWith("/dashboard/show-ops/door/");
  }
  const path = item.href.split("?")[0] ?? item.href;
  return pathname === path || pathname.startsWith(`${path}/`);
}
