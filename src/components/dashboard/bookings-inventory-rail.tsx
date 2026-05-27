import Link from "next/link";
import { Armchair, ArrowRight, ListOrdered, PartyPopper, Scissors, Settings2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const OFFER_LINKS = [
  {
    tab: "appointments",
    eyebrow: "Timed visits",
    label: "Appointment slots",
    detail:
      "This is what appears when guests choose appointments on your link — weekly hours, slot size (15 / 30 min), and blocked slots.",
    Icon: Scissors,
  },
  {
    tab: "tables",
    eyebrow: "Seated bookings",
    label: "Tables & seating",
    detail:
      "Your floor plan and table names — capacities, pricing, and optional questions guests answer before they enquire.",
    Icon: Armchair,
  },
  {
    tab: "events",
    eyebrow: "Shows & nights",
    label: "Hosted events",
    detail:
      "Ticket-style listings — guests match your listing then tap highlighted nights on the calendar.",
    Icon: PartyPopper,
  },
] as const;

export function BookingsInventoryRail() {
  return (
    <Card id="bookable-offerings" className="scroll-mt-28 rounded-[28px] border border-[#ede9fe] bg-gradient-to-b from-[#fafbff] to-white shadow-[0_24px_80px_-52px_rgba(124,58,237,0.35)]">
      <CardHeader className="space-y-3 pb-4 pt-8 px-6 md:px-10 md:pt-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#94a3b8]">Guest-facing inventory</p>
        <CardTitle className="text-xl font-semibold tracking-tight text-[#0f172a] md:text-2xl">
          Big tiles — tap what you want to edit on your public booking link
        </CardTitle>
        <CardDescription className="max-w-3xl text-[15px] leading-relaxed text-[#64748b]">
          You choose what appears on your public link — Solvio keeps it obvious with large tiles. Edit anytime; guests always see the
          latest version you saved (no surprise CMS somewhere else).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8 pb-8 px-6 md:px-10">
        <div className="grid gap-5 md:gap-6 lg:grid-cols-3">
          {OFFER_LINKS.map(({ tab, eyebrow, label, detail, Icon }) => (
            <Link
              key={tab}
              href={`/dashboard/bookings?tab=offerings&view=${tab}`}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "group relative flex min-h-[13.5rem] flex-col items-start gap-4 rounded-[24px] border-[#ebe7f7] bg-white px-6 py-6 text-left shadow-md shadow-[#ede9fe]/40 transition-all hover:border-[#c4b5fd] hover:bg-[#f5f3ff]/50 hover:shadow-lg hover:shadow-[#ddd6fe]/50 md:min-h-[15rem]",
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">{eyebrow}</span>
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7] transition-colors group-hover:bg-[#ede9fe]">
                <Icon className="h-7 w-7" aria-hidden />
              </span>
              <span className="text-lg font-semibold leading-snug text-[#0f172a]">{label}</span>
              <span className="text-[14px] font-normal leading-relaxed text-[#64748b]">{detail}</span>
              <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-[13px] font-semibold text-[#7c3aed]">
                Open editor
                <ArrowRight className="h-4 w-4 opacity-70 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
        <div className="rounded-[24px] border border-dashed border-[#c4b5fd]/80 bg-[#fafbff] px-6 py-6 md:flex md:items-start md:justify-between md:gap-8 md:px-8 md:py-7">
          <div className="max-w-2xl space-y-3">
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">
              <ListOrdered className="h-5 w-5 text-[#7c3aed]" aria-hidden />
              Walk-in enquiries
            </span>
            <p className="text-[15px] font-semibold text-[#0f172a]">Not shown above — configured in Booking setup</p>
            <p className="text-[14px] leading-relaxed text-[#475569]">
              Walk-in wording lives under{" "}
              <Link href="/dashboard/setup/bookings" className="font-semibold text-[#5b21b6] underline decoration-[#ddd6fe] underline-offset-2">
                booking setup
              </Link>
              . When guests send walk-in requests, they arrive under{" "}
              <strong className="font-semibold text-[#0f172a]">Guests &amp; replies → Inbox requests</strong> so you can message them back.
            </p>
          </div>
          <Link
            href="/dashboard/setup/bookings"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "mt-6 inline-flex h-12 shrink-0 items-center gap-2 rounded-full border-[#ddd6fe] px-6 text-sm font-semibold text-[#5b21b6] md:mt-0",
            )}
          >
            <Settings2 className="h-4 w-4" aria-hidden />
            Booking setup
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
