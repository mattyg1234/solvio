"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Megaphone,
  Mic2,
  MoreHorizontal,
  Phone,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";

import type { ResolvedPlatformCapabilities } from "@/lib/platform-capabilities";
import { trialDaysRemaining } from "@/lib/solvio-pricing";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  key: string;
  badge?: string;
};

function buildPrimaryNav(
  cap: ResolvedPlatformCapabilities,
  campaignsEnabled: boolean,
): NavItem[] {
  const items: NavItem[] = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard, exact: true, key: "home" },
    { href: "/dashboard/bookings", label: "Bookings", icon: CalendarDays, key: "bookings" },
    { href: "/dashboard/payments", label: "Pay", icon: CreditCard, key: "pay" },
  ];

  if (cap.ai_receptionist) {
    items.push({ href: "/dashboard/receptionist", label: "Voice", icon: Mic2, key: "receptionist" });
  } else if (campaignsEnabled) {
    items.push({ href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone, key: "campaigns" });
  }

  return items;
}

function buildMoreLinks(
  cap: ResolvedPlatformCapabilities,
  campaignsEnabled: boolean,
  plansBadge?: string | null,
): NavItem[] {
  const links: NavItem[] = [
    { href: "/dashboard/setup/bookings", label: "Booking setup", icon: ClipboardList, key: "setup" },
    {
      href: "/dashboard/pricing",
      label: "Plans & billing",
      icon: CreditCard,
      key: "pricing",
      badge: plansBadge ?? undefined,
    },
    { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3, key: "analytics" },
    { href: "/dashboard/settings", label: "Settings", icon: Settings2, key: "settings" },
    { href: "/dashboard/ask", label: "Ask Solvio", icon: Sparkles, key: "ask" },
  ];

  if (cap.lead_generation) {
    links.push({ href: "/dashboard/leads", label: "Leads", icon: Users, key: "leads" });
  }
  if (cap.ai_receptionist) {
    links.push({ href: "/dashboard/calls", label: "Call history", icon: Phone, key: "calls" });
    links.push({ href: "/dashboard/phone", label: "Phone numbers", icon: Phone, key: "phone" });
  }
  if (campaignsEnabled && cap.ai_receptionist) {
    links.push({ href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone, key: "campaigns" });
  }

  return links;
}

export type DashboardMobileNavProps = {
  capabilities: ResolvedPlatformCapabilities;
  campaignsEnabled?: boolean;
  subscriptionTier?: string;
  businessCreatedAt?: string | null;
};

export function DashboardMobileNav({
  capabilities,
  campaignsEnabled = false,
  subscriptionTier = "trial",
  businessCreatedAt = null,
}: DashboardMobileNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const plansBadge =
    subscriptionTier === "trial" && businessCreatedAt
      ? `${trialDaysRemaining(businessCreatedAt)}d left`
      : undefined;
  const primary = buildPrimaryNav(capabilities, campaignsEnabled);
  const moreLinks = buildMoreLinks(capabilities, campaignsEnabled, plansBadge);

  function navActive(href: string, exact?: boolean) {
    const pathOnly = href.split("#")[0] ?? href;
    if (exact) return pathname === pathOnly;
    return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
  }

  const moreActive = moreLinks.some((item) => navActive(item.href));

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-40 bg-[#0f172a]/20 backdrop-blur-[1px] md:hidden" onClick={() => setMoreOpen(false)} aria-hidden />
      ) : null}

      {moreOpen ? (
        <div className="fixed bottom-[4.5rem] left-3 right-3 z-50 rounded-2xl border border-[#ebe7f7] bg-white p-3 shadow-xl md:hidden">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">More</p>
          <ul className="grid gap-1">
            {moreLinks.map((item) => {
              const Icon = item.icon;
              const on = navActive(item.href);
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold",
                      on ? "bg-[#f5f3ff] text-[#5b21b6]" : "text-[#475569] hover:bg-[#f8fafc]",
                    )}
                    onClick={() => setMoreOpen(false)}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    <span className="flex flex-1 items-center justify-between gap-2">
                      {item.label}
                      {item.badge ? (
                        <span className="rounded-full bg-[#ede9fe] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#5b21b6]">
                          {item.badge}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t border-[#ebe7f7]/90 bg-white/95 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden"
        aria-label="Dashboard mobile"
      >
        {primary.map((item) => {
          const Icon = item.icon;
          const on = navActive(item.href, item.exact);
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex min-w-[3rem] flex-col items-center gap-1 rounded-xl px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                on ? "text-[#7c3aed]" : "text-[#94a3b8]",
              )}
            >
              <Icon className={cn("h-5 w-5", on ? "text-[#7c3aed]" : "text-[#94a3b8]")} aria-hidden />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          className={cn(
            "flex min-w-[3rem] flex-col items-center gap-1 rounded-xl px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
            moreOpen || moreActive ? "text-[#7c3aed]" : "text-[#94a3b8]",
          )}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((o) => !o)}
        >
          <MoreHorizontal className={cn("h-5 w-5", moreOpen || moreActive ? "text-[#7c3aed]" : "text-[#94a3b8]")} aria-hidden />
          More
        </button>
      </nav>
    </>
  );
}
