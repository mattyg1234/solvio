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
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  MessageCircle,
  MessagesSquare,
  Percent,
  PieChart,
  ScanLine,
  Settings2,
  Sheet,
  Ticket,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { useChatUnread } from "@/components/show-ops/chat/use-chat-unread";
import { useInboxUnread } from "@/components/show-ops/inbox/use-inbox-unread";
import { formatUnreadBadge } from "@/lib/show-ops/chat/logic";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  SHOW_OPS_MOBILE_PRIMARY_KEYS,
  SHOW_OPS_NAV_SECTIONS,
  type ShowOpsNavSection,
  SHOW_OPS_SIDEBAR_LINKS,
  showOpsNavActive,
  type ShowOpsNavItem,
} from "@/lib/show-ops/nav";
import type { HubBrand } from "@/lib/show-ops/hub-brand";
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
  "email-bookings": Mail,
  chat: MessageCircle,
  inbox: MessagesSquare,
  sheets: Sheet,
  "my-inbox": Inbox,
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

function NavLink({
  item,
  on,
  onClick,
  badge = 0,
  hub = null,
}: {
  item: ShowOpsNavItem;
  on: boolean;
  onClick?: () => void;
  /** Unread count shown on the right (Chat, Customer inbox). */
  badge?: number;
  /** Dark MHT sidebar styling. */
  hub?: HubBrand | null;
}) {
  const Icon = NAV_ICONS[item.key] ?? LayoutDashboard;
  if (hub) {
    return (
      <Link
        href={item.href}
        onClick={onClick}
        aria-label={badge > 0 ? `${item.label}, ${badge} unread` : undefined}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
          on ? "text-white" : "text-white/65 hover:bg-white/10 hover:text-white",
        )}
        style={on ? { background: `linear-gradient(90deg, ${hub.primaryColor}55, ${hub.primaryColor}22)`, boxShadow: `inset 3px 0 0 ${hub.accentColor}` } : undefined}
      >
        <Icon
          className="h-[18px] w-[18px] shrink-0"
          style={{ color: on ? hub.accentColor : "rgba(255,255,255,0.45)" }}
          aria-hidden
        />
        <span className="truncate">{item.label}</span>
        {badge > 0 ? (
          <span
            aria-hidden
            className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums text-[#14051a]"
            style={{ backgroundColor: hub.accentColor }}
          >
            {formatUnreadBadge(badge)}
          </span>
        ) : null}
      </Link>
    );
  }
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-label={badge > 0 ? `${item.label}, ${badge} unread` : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
        on
          ? "bg-[#f5f3ff] text-[#5b21b6] shadow-[inset_0_0_0_1px_rgba(167,139,250,0.35)]"
          : "text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]",
      )}
    >
      <Icon className={cn("h-4.5 w-4.5 h-[18px] w-[18px] shrink-0", on ? "text-[#7c3aed]" : "text-[#94a3b8]")} aria-hidden />
      <span className="truncate">{item.label}</span>
      {badge > 0 ? (
        <span
          aria-hidden
          className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold tabular-nums text-white"
        >
          {formatUnreadBadge(badge)}
        </span>
      ) : null}
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
      router.push("/login");
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

function ShowOpsSidebarInner({
  displayName,
  userName,
  sections,
  hub = null,
}: {
  displayName?: string;
  userName?: string;
  sections?: ShowOpsNavSection[];
  hub?: HubBrand | null;
}) {
  const navSections = sections ?? SHOW_OPS_NAV_SECTIONS;
  const pathname = usePathname();
  const search = useSearchParams();
  const tab = search.get("tab");
  const org = orgLabel(displayName);
  const admin = userName?.trim() || "Admin";
  const chatUnread = useChatUnread(navSections.some((section) => section.items.some((item) => item.key === "chat")));
  const inboxUnread = useInboxUnread(navSections.some((section) => section.items.some((item) => item.key === "inbox")));

  if (hub) {
    return (
      <div
        className="relative flex h-full flex-col overflow-hidden text-white"
        style={{ background: `linear-gradient(180deg, #3a0b47 0%, #1d0626 55%, #12041a 100%)` }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1"
          style={{ background: `linear-gradient(90deg, ${hub.primaryColor}, ${hub.accentColor}, ${hub.primaryColor})` }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full blur-3xl"
          style={{ backgroundColor: `${hub.primaryColor}40` }}
        />
        <Link
          href="/dashboard/show-ops"
          className="relative flex items-center gap-3 border-b border-white/10 px-5 py-5 outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white p-1"
            style={{ boxShadow: `0 0 0 2px ${hub.primaryColor}, 0 0 22px -4px ${hub.primaryColor}` }}
          >
            <Image src={hub.logoUrl} alt="" width={96} height={96} unoptimized className="h-full w-full object-contain" />
          </span>
          <span className="min-w-0">
            <span className="hub-display block truncate text-xl leading-tight" style={{ color: hub.accentColor }}>
              {hub.name}
            </span>
            <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
              {hub.islands.join(" · ")}
            </span>
          </span>
        </Link>

        <nav className="relative flex flex-1 flex-col overflow-y-auto px-3 py-5" aria-label="Show Ops">
          {navSections.map((section, i) => (
            <div key={section.id} className={i > 0 ? "mt-5 border-t border-white/10 pt-5" : undefined}>
              <p
                className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em]"
                style={{ color: `${hub.primaryColor}cc` }}
              >
                {section.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.key}
                    item={item}
                    on={showOpsNavActive(pathname, tab, item)}
                    badge={item.key === "chat" ? chatUnread : item.key === "inbox" ? inboxUnread : 0}
                    hub={hub}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="relative px-3 py-4">
          <div className="rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10">
            <div className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[#14051a]"
                style={{ backgroundColor: hub.primaryColor }}
              >
                {initials(admin, org)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{admin}</span>
                <span className="block truncate text-xs text-white/50">Powered by Solvio</span>
              </span>
            </div>
            <ShowOpsSignOut />
          </div>
        </div>
      </div>
    );
  }

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
          <span className="block truncate text-lg font-semibold tracking-tight text-[#0f172a]">
            {displayName || "Show Ops"}
          </span>
          <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
            Powered by Solvio
          </span>
        </span>
      </Link>

      <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-5" aria-label="Show Ops">
        {navSections.map((section, i) => (
          <div key={section.id} className={i > 0 ? "mt-5 border-t border-[#f1f5f9] pt-5" : undefined}>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">
              {section.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.key}
                  item={item}
                  on={showOpsNavActive(pathname, tab, item)}
                  badge={item.key === "chat" ? chatUnread : item.key === "inbox" ? inboxUnread : 0}
                />
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

export function ShowOpsSidebar({
  displayName,
  userName,
  sections,
  hub = null,
}: {
  displayName?: string;
  userName?: string;
  sections?: ShowOpsNavSection[];
  hub?: HubBrand | null;
}) {
  return (
    <Suspense fallback={<div className={hub ? "h-full bg-[#1d0626]" : "h-full bg-white"} />}>
      <ShowOpsSidebarInner displayName={displayName} userName={userName} sections={sections} hub={hub} />
    </Suspense>
  );
}

function ShowOpsMobileInner({ accent = null }: { accent?: string | null }) {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = SHOW_OPS_MOBILE_PRIMARY_KEYS.map((key) =>
    SHOW_OPS_SIDEBAR_LINKS.find((l) => l.key === key),
  ).filter((item): item is (typeof SHOW_OPS_SIDEBAR_LINKS)[number] => Boolean(item));
  const more = SHOW_OPS_SIDEBAR_LINKS.filter((l) => !(SHOW_OPS_MOBILE_PRIMARY_KEYS as readonly string[]).includes(l.key));
  const moreActive = more.some((item) => showOpsNavActive(pathname, tab, item));
  const chatUnread = useChatUnread(more.some((item) => item.key === "chat"));
  const inboxUnread = useInboxUnread(more.some((item) => item.key === "inbox"));
  const moreUnread = chatUnread + inboxUnread;

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
                  <NavLink
                    item={item}
                    on={on}
                    onClick={() => setMoreOpen(false)}
                    badge={item.key === "chat" ? chatUnread : item.key === "inbox" ? inboxUnread : 0}
                  />
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
              style={on && accent ? { color: accent } : undefined}
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
          aria-label={moreUnread > 0 ? `More, ${moreUnread} unread messages` : undefined}
          onClick={() => setMoreOpen((o) => !o)}
        >
          <span className="relative">
            <ListChecks className="h-5 w-5" aria-hidden />
            {moreUnread > 0 ? (
              <span
                aria-hidden
                className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold tabular-nums text-white"
              >
                {formatUnreadBadge(moreUnread)}
              </span>
            ) : null}
          </span>
          More
        </button>
      </nav>
    </>
  );
}

export function ShowOpsMobileNav({ accent = null }: { accent?: string | null }) {
  return (
    <Suspense fallback={null}>
      <ShowOpsMobileInner accent={accent} />
    </Suspense>
  );
}
