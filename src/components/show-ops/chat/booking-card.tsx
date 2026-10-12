"use client";

import { Bus, CalendarDays, Lock, Ticket, Users } from "lucide-react";
import Link from "next/link";

import type { ChatBookingCard } from "@/lib/show-ops/chat/types";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  neutral: "bg-slate-100 text-slate-700",
  good: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  warn: "bg-amber-50 text-amber-900 ring-1 ring-amber-200",
  bad: "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
};

function showDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(d);
}

function paxWords(adults: number, children: number, infants: number): string {
  const part = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [part(adults, "adult", "adults"), part(children, "child", "children"), part(infants, "infant", "infants")].join(" · ");
}

/**
 * A booking in chat. Details are live and never include money; someone who
 * cannot open the booking sees only its reference.
 */
export function ChatBookingCardView({ card, className }: { card: ChatBookingCard; className?: string }) {
  if (card.access === "ref") {
    return (
      <div
        className={cn(
          "mt-1 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200",
          className,
        )}
      >
        <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
        <span className="min-w-0 truncate">
          Booking <span className="font-mono font-semibold">{card.ref}</span>
        </span>
      </div>
    );
  }
  const d = card.details;
  return (
    <Link
      href={`/dashboard/show-ops/bookings/${card.bookingId}`}
      className={cn(
        "mt-1 block min-w-0 rounded-xl bg-white p-3 text-left text-slate-900 ring-1 ring-slate-200 transition hover:ring-[color:var(--show-ops-primary,#7c3aed)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--show-ops-primary,#7c3aed)]",
        className,
      )}
      aria-label={`Open booking ${d.ref}, ${d.guestName}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block font-mono text-xs font-semibold text-slate-500">{d.ref}</span>
          <span className="block truncate text-sm font-semibold">{d.guestName}</span>
        </span>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE[d.statusTone])}>
          {d.status}
        </span>
      </span>
      <span className="mt-2 grid gap-1 text-xs text-slate-600">
        <span className="flex min-w-0 items-center gap-1.5">
          <Ticket className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          <span className="truncate">
            {d.showName}
            {d.island ? ` · ${d.island}` : ""}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          {showDay(d.showDate)}
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          {paxWords(d.adults, d.children, d.infants)}
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <Bus className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          <span className="truncate">{d.pickup}</span>
        </span>
      </span>
    </Link>
  );
}
