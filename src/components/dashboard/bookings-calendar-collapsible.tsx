"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { BookingsOverviewCalendar } from "@/components/dashboard/bookings-overview-calendar";
import { cn } from "@/lib/utils";

type CalendarProps = React.ComponentProps<typeof BookingsOverviewCalendar>;

export function BookingsCalendarCollapsible(props: CalendarProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-[22px] border border-[#ebe7f7]/90 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-[#f1eefc] px-4 py-3 md:hidden">
        <div>
          <p className="text-sm font-semibold text-[#0f172a]">Booking calendar</p>
          <p className="text-xs text-[#64748b]">Confirmed diary + hosted events</p>
        </div>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-[#ebe7f7] px-3 py-1.5 text-xs font-semibold text-[#475569]",
          )}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <>
              Hide
              <ChevronUp className="h-4 w-4" aria-hidden />
            </>
          ) : (
            <>
              Show
              <ChevronDown className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
      </div>
      <div className={cn("md:block", open ? "block" : "hidden md:block")}>
        <BookingsOverviewCalendar {...props} />
      </div>
    </div>
  );
}
