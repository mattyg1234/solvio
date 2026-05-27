import {
  CalendarClock,
  CalendarDays,
  Globe2,
  Hourglass,
  PhoneIncoming,
} from "lucide-react";

import { BOOKING_MONTHLY_GBP, PRO_MONTHLY_GBP } from "@/lib/solvio-pricing";
import { Card } from "@/components/ui/card";

const blocks = [
  {
    title: "Never miss a booking",
    body: "Your /book link works 24/7 — guests enquire even when you're closed. Pro adds an AI receptionist on the phone.",
    stat: "More after-hours requests",
    icon: PhoneIncoming,
  },
  {
    title: "Speak multiple languages",
    body: "Perfect for busy high streets in the UK and Ireland — greet guests in English (and more with Pro).",
    stat: "More inbound captured",
    icon: Globe2,
  },
  {
    title: "Automatic appointments",
    body: "Guests pick slots on your link — confirmed in your diary with email and text when you're not charging a deposit.",
    stat: "Less back-and-forth",
    icon: CalendarClock,
  },
  {
    title: "Less time on the phone",
    body: "Fewer repetitive calls when guests self-serve on your link — free your crew for the floor.",
    stat: "~6 hrs/week saved (example)",
    icon: Hourglass,
  },
  {
    title: "One booking inbox",
    body: "Requests, optional deposits, and confirmations in one place — no spreadsheet chasing.",
    stat: "Deposits optional",
    icon: CalendarDays,
  },
];

export function GrowthSection() {
  return (
    <section id="growth" className="border-b border-[#ebe7f7]/70 bg-[#f8fafc] py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#94a3b8]">Built for outcomes</p>
          <h2 className="mt-4 text-[clamp(1.95rem,4vw,2.85rem)] font-semibold tracking-tight text-[#0f172a]">
            Growth feels effortless — because the boring stuff disappears.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-[#64748b]">
            No dashboards to babysit. Booking (£{BOOKING_MONTHLY_GBP}/mo) gives you the public link, calendar, and optional
            online deposits. Pro (£{PRO_MONTHLY_GBP}/mo) adds the AI receptionist with a limited monthly minute cap.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {blocks.map((block) => (
            <Card
              key={block.title}
              className="h-full rounded-[26px] border border-[#ebe7f7] bg-white p-8 shadow-[0_28px_90px_-58px_rgba(124,58,237,0.55)] transition-shadow hover:shadow-[0_34px_110px_-54px_rgba(124,58,237,0.48)]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
                <block.icon className="h-6 w-6" aria-hidden />
              </div>
              <h3 className="mt-7 text-xl font-semibold tracking-tight text-[#0f172a]">{block.title}</h3>
              <p className="mt-4 text-[15px] leading-relaxed text-[#64748b]">{block.body}</p>
              <p className="mt-4 inline-flex rounded-full bg-[#faf5ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5b21b6] ring-1 ring-[#ede9fe]">
                Example: {block.stat}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
