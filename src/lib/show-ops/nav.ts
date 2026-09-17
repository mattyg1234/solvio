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
      { href: "/dashboard/show-ops/outlook", label: "Outlook", key: "outlook" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { href: "/dashboard/show-ops/master?tab=shows", label: "Shows", key: "shows", tab: "shows" },
      { href: "/dashboard/show-ops/bookings", label: "Bookings", key: "bookings" },
      { href: "/dashboard/show-ops/door", label: "Door", key: "door" },
      { href: "/dashboard/show-ops/lists", label: "Night lists", key: "lists" },
      { href: "/dashboard/show-ops/invoices", label: "Invoicing", key: "invoices" },
      { href: "/dashboard/show-ops/master?tab=partners", label: "Partners", key: "partners", tab: "partners" },
      { href: "/dashboard/show-ops/master?tab=hotels", label: "Hotels", key: "hotels", tab: "hotels" },
      { href: "/dashboard/show-ops/buses", label: "Bus board", key: "buses" },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    // Stats & insights now lives at the bottom of Reports (see SHOW_OPS_LEGACY_PAGE_KEYS).
    items: [{ href: "/dashboard/show-ops/reports", label: "Reports", key: "reports" }],
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
    // Pick-up points are a sub-tab of Hotels & pick-ups; the rail item stays lit.
    const effective = current === "stops" ? "hotels" : current;
    return pathname.startsWith("/dashboard/show-ops/master") && effective === item.tab;
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
  "outlook",
  "reports",
  "lists",
  "settings",
] as const;

/**
 * Page keys that used to exist and may still sit in a saved allowed_pages list,
 * with the page that answers for them now. "stats" folded into Reports (Sept 2026).
 */
export const SHOW_OPS_LEGACY_PAGE_KEYS = { stats: "reports" } as const satisfies Record<string, ShowOpsPageKey>;
export type ShowOpsLegacyPageKey = keyof typeof SHOW_OPS_LEGACY_PAGE_KEYS;

/** Catalogue management and settings cannot be delegated below admin. */
export const SHOW_OPS_SENIOR_PAGE_KEYS: readonly ShowOpsPageKey[] = ["shows", "partners", "hotels", "settings"];

/** Current key for any saved key — legacy aliases resolve, junk returns null. */
export function resolveShowOpsPageKey(key: string): ShowOpsPageKey | null {
  if ((SHOW_OPS_PAGE_KEYS as readonly string[]).includes(key)) return key as ShowOpsPageKey;
  return (SHOW_OPS_LEGACY_PAGE_KEYS as Record<string, ShowOpsPageKey>)[key] ?? null;
}

/** Human labels for the permission picker, in nav order. */
export const SHOW_OPS_PAGE_LABELS: Record<ShowOpsPageKey, string> = {
  dashboard: "Dashboard",
  calendar: "Show calendar",
  shows: "Shows",
  bookings: "Bookings",
  door: "Door",
  invoices: "Invoicing",
  partners: "Partners",
  hotels: "Hotels",
  buses: "Bus board",
  outlook: "Outlook",
  reports: "Reports",
  lists: "Night lists",
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
  office: ["dashboard", "calendar", "bookings", "door", "lists", "buses", "outlook", "reports"],
  finance: [
    "dashboard", "calendar", "bookings", "door", "lists",
    "buses", "outlook", "reports", "invoices",
  ],
  admin: [...SHOW_OPS_PAGE_KEYS],
  owner: [...SHOW_OPS_PAGE_KEYS],
};

/** Explicit page grants override defaults, but cannot raise the member's role. */
export function showOpsAllowedPages(
  role: string,
  allowedPages?: string[] | null,
): ShowOpsPageKey[] {
  // The partner portal never grants staff access, even with stale saved page keys.
  if (role === "seller") return [];
  const valid = (keys: readonly string[]) => {
    const out: ShowOpsPageKey[] = [];
    for (const k of keys) {
      const resolved = resolveShowOpsPageKey(k);
      if (resolved && !out.includes(resolved)) out.push(resolved);
    }
    return out;
  };

  if (allowedPages && allowedPages.length) {
    const picked = valid(allowedPages);
    return role === "owner" || role === "admin" ? picked : picked.filter((k) =>
      !SHOW_OPS_SENIOR_PAGE_KEYS.includes(k) && (k !== "invoices" || role === "finance"),
    );
  }
  return ROLE_DEFAULT_PAGES[role] ?? ROLE_DEFAULT_PAGES.booker;
}

export function canSeeShowOpsPage(
  role: string,
  allowedPages: string[] | null | undefined,
  key: ShowOpsPageKey | ShowOpsLegacyPageKey,
): boolean {
  const resolved = resolveShowOpsPageKey(key);
  return resolved != null && showOpsAllowedPages(role, allowedPages).includes(resolved);
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
