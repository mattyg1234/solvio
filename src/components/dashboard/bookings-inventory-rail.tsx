import Link from "next/link";
import { Armchair, CalendarDays, ListOrdered, PartyPopper, Settings2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const OFFER_LINKS = [
  {
    tab: "appointments",
    label: "Appointment slots",
    detail: "Set weekly hours and slot length so guests grab timed visits from your shared link.",
    Icon: CalendarDays,
  },
  {
    tab: "tables",
    label: "Tables & seating",
    detail: "Name tables or sections, capacities, and questions for seated bookings.",
    Icon: Armchair,
  },
  {
    tab: "events",
    label: "Hosted events",
    detail:
      "Comedy nights, workshops — first occurrence plus repeats (for example weekly Wednesdays). Guests see them on your public Solvio booking link.",
    Icon: PartyPopper,
  },
] as const;

export function BookingsInventoryRail() {
  return (
    <Card id="bookable-offerings" className="scroll-mt-28 rounded-[22px] border border-[#ede9fe] bg-[#fafbff]/90 shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-[1.05rem] text-[#0f172a]">Choose what appears on your guest link</CardTitle>
        <CardDescription className="text-[13px] leading-relaxed text-[#64748b]">
          After booking setup is done, flesh out calendars and inventory here. Saved appointment hours, tables, and event series
          are what Solvio publishes for customers — no extra CMS required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pb-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {OFFER_LINKS.map(({ tab, label, detail, Icon }) => (
            <Link
              key={tab}
              href={`/dashboard/bookings?tab=offerings&view=${tab}`}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "flex h-auto min-h-[7.25rem] flex-col items-start gap-3 rounded-[18px] border-[#ebe7f7] bg-white px-5 py-4 text-left shadow-sm transition-colors hover:border-[#c4b5fd] hover:bg-[#f5f3ff]/60",
              )}
            >
              <Icon className="h-8 w-8 shrink-0 text-[#7c3aed]" aria-hidden />
              <span className="text-[15px] font-semibold text-[#0f172a]">{label}</span>
              <span className="text-[13px] font-normal leading-relaxed text-[#64748b]">{detail}</span>
            </Link>
          ))}
        </div>
        <div className="rounded-2xl border border-dashed border-[#ebe7f7] bg-white/70 px-4 py-4 text-sm leading-relaxed text-[#475569]">
          <span className="inline-flex items-center gap-2 font-semibold text-[#0f172a]">
            <ListOrdered className="h-4 w-4 text-[#7c3aed]" aria-hidden />
            Customer waitlists
          </span>
          <p className="mt-2">
            Walk-in queues and waitlist wording are wired from your{" "}
            <Link href="/dashboard/setup/bookings" className="font-semibold text-[#5b21b6] underline decoration-[#ddd6fe] underline-offset-2">
              booking setup
            </Link>{" "}
            guest-path choices. Incoming requests stay under <strong>Guests &amp; replies</strong> · <strong>Inbox requests</strong> so you can text them back instantly.
          </p>
          <Link
            href="/dashboard/setup/bookings"
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "mt-3 inline-flex h-10 gap-2 rounded-full px-0 text-[13px] font-semibold text-[#7c3aed]",
            )}
          >
            <Settings2 className="h-4 w-4" aria-hidden />
            Adjust appointments / tables / events / waitlists on booking setup
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
