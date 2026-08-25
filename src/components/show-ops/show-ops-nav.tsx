"use client";

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  Bus,
  CalendarDays,
  ChevronDown,
  FileText,
  Handshake,
  Home,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Percent,
  PieChart,
  ScanLine,
  Settings2,
  Ticket,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  SHOW_OPS_MOBILE_PRIMARY_KEYS,
  SHOW_OPS_NAV_SECTIONS,
  SHOW_OPS_SIDEBAR_LINKS,
  showOpsNavActive,
  type ShowOpsNavItem,
} from "@/lib/show-ops/nav";
import { cn } from "@/lib/utils";

const NAV_ICONS: Record<string, LucideIcon> = {
  dashboard: Home,
  calendar: CalendarDays,
  shows: Ticket,
  bookings: CalendarDays,
  door: ScanLine,
  invoices: FileText,
  partners: Handshake,
  hotels: Building2,
  buses: Bus,
  rates: Percent,
  outlook: CalendarDays,
  reports: BarChart3,
  stats: PieChart,
  lists: ListChecks,
  settings: Settings2,
};

function initials(userName: string, org: string): string {
  const a = userName.trim().split(/\s+/)[0]?.[0] ?? "A";
  const b = org.trim().split(/\s+/)[0]?.[0] ?? "M";
  return `${a}${b}`.toUpperCase();
}

function orgLabel(displayName?: string): string {
  const raw = (displayName || "Show Ops").replace(/\s*show\s*ops\s*/i, " ").trim();
  return raw || displayName || "Show Ops";
}

function NavLink({ item, on, onClick }: { item: ShowOpsNavItem; on: boolean; onClick?: () => void }) {
  const Icon = NAV_ICONS[item.key] ?? LayoutDashboard;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
        on
          ? "bg-[#f5f3ff] text-[#5b21b6] shadow-[inset_0_0_0_1px_rgba(167,139,250,0.35)]"
          : "text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]",
      )}
    >
      <Icon className={cn("h-4.5 w-4.5 h-[18px] w-[18px] shrink-0", on ? "text-[#7c3aed]" : "text-[#94a3b8]")} aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function ShowOpsSignOut() {
  const router = useRouter();

  async function signOut() {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } finally {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-[#334155] ring-1 ring-[#e2e8f0] transition hover:bg-[#f8fafc] hover:ring-[#cbd5f5]"
    >
      <LogOut className="h-4 w-4 text-[#64748b]" aria-hidden />
      Log out
    </button>
  );
}

function ShowOpsSidebarInner({ displayName, userName }: { displayName?: string; userName?: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const tab = search.get("tab");
  const org = orgLabel(displayName);
  const admin = userName?.trim() || "Admin";

  return (
    <div className="flex h-full flex-col border-r border-[#ebe7f7]/90 bg-white">
      <Link
        href="/dashboard/show-ops"
        className="flex items-center gap-3 border-b border-[#ebe7f7]/90 px-5 py-5 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[#7c3aed]"
      >
        <span className="block h-9 w-9 shrink-0 overflow-hidden rounded-xl shadow-sm shadow-[#7c3aed]/25">
          <Image src="/brand/icon-192.png" alt="" width={72} height={72} className="h-full w-full" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-lg font-semibold tracking-tight text-[#0f172a]">Solvio</span>
          <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
            {displayName || "Show Ops"}
          </span>
        </span>
      </Link>

      <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-5" aria-label="Show Ops">
        {SHOW_OPS_NAV_SECTIONS.map((section, i) => (
          <div key={section.id} className={i > 0 ? "mt-5 border-t border-[#f1f5f9] pt-5" : undefined}>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">
              {section.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavLink key={item.key} item={item} on={showOpsNavActive(pathname, tab, item)} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-4">
        <div className="rounded-2xl bg-[#faf9ff] p-3 ring-1 ring-[#ebe7f7]">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#7c3aed] text-xs font-bold text-white">
              {initials(admin, org)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-[#0f172a]">{admin}</span>
              <span className="block truncate text-xs text-[#94a3b8]">Administrator · {org}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[#94a3b8]" aria-hidden />
          </div>
          <ShowOpsSignOut />
        </div>
      </div>
    </div>
  );
}

export function ShowOpsSidebar({ displayName, userName }: { displayName?: string; userName?: string }) {
  return (
    <Suspense fallback={<div className="h-full bg-white" />}>
      <ShowOpsSidebarInner displayName={displayName} userName={userName} />
    </Suspense>
  );
}

function ShowOpsMobileInner() {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = SHOW_OPS_MOBILE_PRIMARY_KEYS.map((key) =>
    SHOW_OPS_SIDEBAR_LINKS.find((l) => l.key === key),
  ).filter((item): item is (typeof SHOW_OPS_SIDEBAR_LINKS)[number] => Boolean(item));
  const more = SHOW_OPS_SIDEBAR_LINKS.filter((l) => !(SHOW_OPS_MOBILE_PRIMARY_KEYS as readonly string[]).includes(l.key));
  const moreActive = more.some((item) => showOpsNavActive(pathname, tab, item));

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-900/20 md:hidden" onClick={() => setMoreOpen(false)} aria-hidden />
      ) : null}
      {moreOpen ? (
        <div className="fixed bottom-[4.5rem] left-3 right-3 z-50 rounded-2xl bg-white p-3 text-slate-900 shadow-xl ring-1 ring-slate-200 md:hidden">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">More</p>
          <ul className="grid gap-1">
            {more.map((item) => {
              const on = showOpsNavActive(pathname, tab, item);
              return (
                <li key={item.key}>
                  <NavLink item={item} on={on} onClick={() => setMoreOpen(false)} />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t border-[#ebe7f7] bg-white pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 md:hidden"
        aria-label="Show Ops mobile"
      >
        {primary.map((item) => {
          const on = showOpsNavActive(pathname, tab, item);
          const Icon = NAV_ICONS[item.key] ?? LayoutDashboard;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex min-w-[3rem] flex-col items-center gap-1 rounded-xl px-2 py-1 text-[10px] font-semibold",
                on ? "text-[#7c3aed]" : "text-slate-400",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          className={cn(
            "flex min-w-[3rem] flex-col items-center gap-1 rounded-xl px-2 py-1 text-[10px] font-semibold",
            moreOpen || moreActive ? "text-[#7c3aed]" : "text-slate-400",
          )}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((o) => !o)}
        >
          <ListChecks className="h-5 w-5" aria-hidden />
          More
        </button>
      </nav>
    </>
  );
}

export function ShowOpsMobileNav() {
  return (
    <Suspense fallback={null}>
      <ShowOpsMobileInner />
    </Suspense>
  );
}
