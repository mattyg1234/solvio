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
      { href: "/dashboard/show-ops/lists", label: "Quick check-in", key: "lists" },
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

/* ------------------------------------------------------------------ *
 * Per-staff page permissions
 * ------------------------------------------------------------------ */

export type ShowOpsPageKey = (typeof SHOW_OPS_PAGE_KEYS)[number];

export const SHOW_OPS_PAGE_KEYS = [
  "dashboard",
  "calendar",
  "shows",
  "bookings",
  "door",
  "invoices",
  "partners",
  "hotels",
  "buses",
  "rates",
  "outlook",
  "reports",
  "stats",
  "lists",
  "settings",
] as const;

/** Human labels for the permission picker, in nav order. */
export const SHOW_OPS_PAGE_LABELS: Record<ShowOpsPageKey, string> = {
  dashboard: "Dashboard",
  calendar: "Show calendar",
  shows: "Shows",
  bookings: "Bookings",
  door: "Door",
  invoices: "Invoicing",
  partners: "Partners",
  hotels: "Hotels & pick-ups",
  buses: "Bus board",
  rates: "Rates & commissions",
  outlook: "Outlook",
  reports: "Reports",
  stats: "Stats & insights",
  lists: "Quick check-in",
  settings: "Settings",
};

/**
 * What each role can reach when no explicit allow-list is set.
 * Money and master data climb with the rank; the door/check-in views sit low
 * so venue staff can be given them without handing over the rest.
 */
const ROLE_DEFAULT_PAGES: Record<string, ShowOpsPageKey[]> = {
  seller: [],
  booker: ["dashboard", "calendar", "bookings", "door", "lists"],
  office: ["dashboard", "calendar", "bookings", "door", "lists", "shows", "partners", "hotels", "buses", "outlook", "reports"],
  finance: [
    "dashboard", "calendar", "bookings", "door", "lists", "shows", "partners", "hotels",
    "buses", "outlook", "reports", "invoices", "rates", "stats",
  ],
  admin: [...SHOW_OPS_PAGE_KEYS],
  owner: [...SHOW_OPS_PAGE_KEYS],
};

/** Pages this member may reach. An explicit allow-list always wins over the role default. */
export function showOpsAllowedPages(
  role: string,
  allowedPages?: string[] | null,
): ShowOpsPageKey[] {
  const valid = (keys: readonly string[]) =>
    keys.filter((k): k is ShowOpsPageKey => (SHOW_OPS_PAGE_KEYS as readonly string[]).includes(k));

  if (allowedPages && allowedPages.length) {
    const picked = valid(allowedPages);
    // Settings stays owner/admin only, whatever the allow-list claims.
    return role === "owner" || role === "admin" ? picked : picked.filter((k) => k !== "settings");
  }
  return ROLE_DEFAULT_PAGES[role] ?? ROLE_DEFAULT_PAGES.booker;
}

export function canSeeShowOpsPage(
  role: string,
  allowedPages: string[] | null | undefined,
  key: ShowOpsPageKey,
): boolean {
  return showOpsAllowedPages(role, allowedPages).includes(key);
}

/** Nav sections with anything this member cannot reach stripped out. */
export function visibleShowOpsNav(
  role: string,
  allowedPages: string[] | null | undefined,
): ShowOpsNavSection[] {
  const allowed = new Set<string>(showOpsAllowedPages(role, allowedPages));
  return SHOW_OPS_NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => allowed.has(item.key)),
  })).filter((section) => section.items.length > 0);
}
