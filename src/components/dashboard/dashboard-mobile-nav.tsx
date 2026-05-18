"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardList, CreditCard, LayoutDashboard, PhoneCall, Settings2 } from "lucide-react";

import type { ResolvedPlatformCapabilities } from "@/lib/platform-capabilities";
import { cn } from "@/lib/utils";

function buildMobileNav(cap: ResolvedPlatformCapabilities, bookingSetupComplete: boolean): { href: string; label: string; icon: LucideIcon; exact?: boolean; key: string }[] {
  const items: {
    href: string;
    label: string;
    icon: LucideIcon;
    exact?: boolean;
    key: string;
  }[] = [{ href: "/dashboard", label: "Home", icon: LayoutDashboard, exact: true, key: "home" }];

  items.push({ href: "/dashboard/bookings", label: "Bookings", icon: CalendarDays, key: "bookings" });

  items.push(
    bookingSetupComplete
      ? { href: "/dashboard/bookings", label: "Offerings", icon: ClipboardList, key: "booking-offerings" }
      : { href: "/dashboard/setup/bookings", label: "Setup", icon: ClipboardList, key: "booking-setup" },
  );

  items.push({ href: "/dashboard/payments", label: "Pay", icon: CreditCard, key: "pay" });

  if (cap.ai_receptionist) {
    items.push({ href: "/dashboard/calls", label: "Calls", icon: PhoneCall, key: "calls" });
  }

  items.push({ href: "/dashboard/settings", label: "More", icon: Settings2, key: "settings" });

  return items;
}

export type DashboardMobileNavProps = {
  capabilities: ResolvedPlatformCapabilities;
  bookingSetupComplete?: boolean;
};

export function DashboardMobileNav({ capabilities, bookingSetupComplete }: DashboardMobileNavProps) {
  const pathname = usePathname();
  const items = buildMobileNav(capabilities, Boolean(bookingSetupComplete));

  function navActive(href: string, exact?: boolean) {
    const pathOnly = href.split("#")[0] ?? href;
    if (exact) return pathname === pathOnly;
    return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t border-[#ebe7f7]/90 bg-white/95 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden"
      aria-label="Dashboard mobile"
    >
      {items.map((item) => {
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
    </nav>
  );
}
