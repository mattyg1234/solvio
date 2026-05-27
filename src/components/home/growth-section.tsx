import {
  CalendarClock,
  CalendarDays,
  Globe2,
  Hourglass,
  PhoneIncoming,
} from "lucide-react";

import { Card } from "@/components/ui/card";

const blocks = [
  {
    title: "Never miss a booking",
    body: "AI answers calls 24/7 so tables stay full — even when your team is slammed.",
    stat: "+28% more covers",
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
    body: "Bookings handled on the spot with confirmations guests actually receive.",
    stat: "−35% admin back-and-forth",
    icon: CalendarClock,
  },
  {
    title: "Less time on the phone",
    body: "Free your crew to focus on hospitality, not repetitive phone loops.",
    stat: "~6 hrs/week saved",
    icon: Hourglass,
  },
  {
    title: "One booking inbox",
    body: "Requests, deposits and confirmations in one place — no spreadsheet chasing.",
    stat: "£1.8k/mo deposits (example)",
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
            No dashboards to babysit. Booking (£50/mo) gives you the public link, calendar, and Stripe deposits — Pro adds
            the full AI receptionist for after-hours calls.
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
