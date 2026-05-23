import Link from "next/link";
import {
  Armchair,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  Columns3,
  Inbox,
  Link2,
  PartyPopper,
} from "lucide-react";

import type { BookingGuestsSub, BookingHubPrimary, BookingOfferingsSub } from "@/lib/bookings-hub-query";
import { cn } from "@/lib/utils";

export type BookingsCommandCenterProps = {
  inboxCount: number;
  confirmedCount: number;
  activePrimary: BookingHubPrimary;
  activeGuestsSub: BookingGuestsSub;
  activeOfferingsSub: BookingOfferingsSub;
  bookingFlowComplete: boolean;
};

type TileDef = {
  href: string;
  label: string;
  hint: string;
  Icon: typeof Inbox;
  active: boolean;
  badge?: number;
  disabled?: boolean;
};

function CommandTile({ href, label, hint, Icon, active, badge, disabled }: TileDef) {
  const inner = (
    <>
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
        <Icon className="h-7 w-7" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold leading-snug text-[#0f172a]">{label}</span>
          {typeof badge === "number" && badge > 0 ? (
            <span className="rounded-full bg-[#7c3aed] px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </div>
        <p className="text-[13px] leading-relaxed text-[#64748b]">{hint}</p>
      </div>
    </>
  );

  const className = cn(
    "flex min-h-[7.5rem] items-start gap-4 rounded-[22px] border px-5 py-5 text-left transition-all md:min-h-[8rem] md:px-6 md:py-6",
    disabled && "pointer-events-none opacity-50",
    active
      ? "border-[#7c3aed] bg-[#f5f3ff] shadow-md shadow-[#ede9fe]/70 ring-2 ring-[#ddd6fe]/80"
      : "border-[#ebe7f7] bg-white hover:border-[#c4b5fd] hover:bg-[#fafbff] hover:shadow-md hover:shadow-[#f5f3ff]/80",
  );

  if (disabled) {
    return <div className={className}>{inner}</div>;
  }

  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}

export function BookingsCommandCenter({
  inboxCount,
  confirmedCount,
  activePrimary,
  activeGuestsSub,
  activeOfferingsSub,
  bookingFlowComplete,
}: BookingsCommandCenterProps) {
  const findTiles: TileDef[] = [
    {
      href: "/dashboard/bookings#booking-calendar",
      label: "Booking calendar",
      hint: "Month view with guest headcount — tap a day to manage bookings and call guests.",
      Icon: CalendarRange,
      active: false,
    },
    {
      href: "/dashboard/bookings?tab=guests&view=inbox#bookings-workspace",
      label: "Incoming requests",
      hint: "Guests who submitted your booking link — reply here, then confirm onto the diary.",
      Icon: Inbox,
      active: activePrimary === "guests" && activeGuestsSub === "inbox",
      badge: inboxCount,
    },
    {
      href: "/dashboard/bookings?tab=guests&view=confirmed#bookings-workspace",
      label: "Confirmed diary",
      hint: "Slots you’ve locked in — call, text, or cancel from one list.",
      Icon: CalendarCheck,
      active: activePrimary === "guests" && activeGuestsSub === "confirmed",
      badge: confirmedCount,
    },
    {
      href: "/dashboard/bookings?tab=guests&view=planner#bookings-workspace",
      label: "Week planner",
      hint: "See every booking on a time grid — assign staff and spot gaps at a glance.",
      Icon: Columns3,
      active: activePrimary === "guests" && activeGuestsSub === "planner",
    },
  ];

  const createTiles: TileDef[] = [
    {
      href: "/dashboard/bookings?tab=offerings&view=appointments#bookings-workspace",
      label: "Appointment hours",
      hint: "Weekly open times and slot length — what guests pick on timed bookings.",
      Icon: CalendarDays,
      active: activePrimary === "offerings" && activeOfferingsSub === "appointments",
      disabled: !bookingFlowComplete,
    },
    {
      href: "/dashboard/bookings?tab=offerings&view=events#bookings-workspace",
      label: "Hosted events",
      hint: "Shows and nights — guests choose your listing, then tap purple dates on the calendar.",
      Icon: PartyPopper,
      active: activePrimary === "offerings" && activeOfferingsSub === "events",
      disabled: !bookingFlowComplete,
    },
    {
      href: "/dashboard/bookings?tab=offerings&view=tables#bookings-workspace",
      label: "Tables & floor plan",
      hint: "Add tables, rename them anytime, set shapes, colours, and seating questions for table enquiries.",
      Icon: Armchair,
      active: activePrimary === "offerings" && activeOfferingsSub === "tables",
      disabled: !bookingFlowComplete,
    },
    {
      href: "/dashboard/bookings#booking-links",
      label: "Guest booking link",
      hint: "Copy the URL you share — everything above is what appears on that page.",
      Icon: Link2,
      active: false,
    },
  ];

  return (
    <section className="space-y-8 rounded-[28px] border border-[#ebe7f7] bg-white p-6 shadow-sm md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[#0f172a] md:text-[1.65rem]">Bookings</h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
          Tap a section — find guest requests, manage your diary, or edit what people can book on your link.
        </p>
      </div>

      <div className="space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#94a3b8]">1 · Find bookings</p>
        <div className="grid gap-4 md:grid-cols-2">
          {findTiles.map((t) => (
            <CommandTile key={t.href} {...t} />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#94a3b8]">2 · Create &amp; edit what guests can book</p>
        {!bookingFlowComplete ? (
          <p className="rounded-xl border border-amber-200 bg-[#fffbeb] px-4 py-3 text-[13px] text-[#92400e]">
            Finish{" "}
            <Link href="/dashboard/setup/bookings" className="font-semibold underline underline-offset-2">
              booking setup
            </Link>{" "}
            first — then the tiles below unlock your appointment, event, and table editors.
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {createTiles.map((t) => (
            <CommandTile key={t.href} {...t} />
          ))}
        </div>
      </div>
    </section>
  );
}
