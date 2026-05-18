"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  CreditCard,
  Euro,
  Inbox,
  LayoutDashboard,
  Mic2,
  PhoneCall,
  Radar,
  Settings2,
  Sparkles,
} from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import type { ResolvedPlatformCapabilities } from "@/lib/platform-capabilities";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; key: string };

function buildSidebarNav(cap: ResolvedPlatformCapabilities): NavItem[] {
  const items: NavItem[] = [];

  items.push({
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
    key: "home",
  });

  items.push({
    href: "/dashboard/bookings",
    label: "Bookings hub",
    icon: Inbox,
    key: "bookings",
  });

  items.push({
    href: "/dashboard/setup/bookings",
    label: "Booking setup",
    icon: ClipboardList,
    key: "booking-setup",
  });

  if (cap.ai_receptionist) {
    items.push({
      href: "/dashboard/setup/voice",
      label: "AI receptionist",
      icon: Mic2,
      key: "voice",
    });
    items.push({ href: "/dashboard/calls", label: "Calls", icon: PhoneCall, key: "calls" });
  }

  if (cap.lead_generation) {
    items.push({ href: "/dashboard/leads", label: "Leads", icon: Radar, key: "leads" });
  }

  items.push({ href: "/dashboard/payments", label: "Payments", icon: CreditCard, key: "pay" });
  items.push({ href: "/dashboard/analytics", label: "Analytics", icon: BarChart3, key: "analytics" });
  items.push({ href: "/dashboard/pricing", label: "Plans", icon: Euro, key: "plans" });
  items.push({ href: "/dashboard/settings", label: "Settings", icon: Settings2, key: "settings" });

  return items;
}

export type DashboardSidebarProps = {
  capabilities: ResolvedPlatformCapabilities;
};

export function DashboardSidebar({ capabilities }: DashboardSidebarProps) {
  const pathname = usePathname();
  const nav = buildSidebarNav(capabilities);

  function active(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 border-b border-[#ebe7f7]/90 px-5 py-5 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[#7c3aed]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#a78bfa] text-sm font-bold text-white shadow-sm shadow-[#7c3aed]/25">
          S
        </span>
        <span className="truncate text-lg font-semibold tracking-tight text-[#0f172a]">Solvio</span>
        <Sparkles className="ml-auto h-4 w-4 shrink-0 text-[#a78bfa]" aria-hidden />
      </Link>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-5" aria-label="Dashboard">
        {nav.map((item) => {
          const Icon = item.icon;
          const isOn = active(item.href, item.exact);
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                isOn
                  ? "bg-[#f5f3ff] text-[#5b21b6] shadow-[inset_0_0_0_1px_rgba(167,139,250,0.35)]"
                  : "text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]",
              )}
            >
              <Icon className={cn("h-5 w-5 shrink-0", isOn ? "text-[#7c3aed]" : "text-[#94a3b8]")} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[#ebe7f7]/90 px-4 py-4">
        <SignOutButton className="w-full rounded-xl border-[#ebe7f7] font-semibold" />
      </div>
    </div>
  );
}
