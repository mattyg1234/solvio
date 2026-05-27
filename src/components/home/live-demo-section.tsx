import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { bookingDemoHref } from "@/lib/marketing-links";
import { cn } from "@/lib/utils";

const topics = [
  "How AI receptionists handle calls after hours",
  "Bookings, tables, and event nights on one page",
  "Optional card deposits for your venue",
  "What setup looks like for restaurants, salons, and tours",
];

export function LiveDemoSection({ liveVoice = false }: { liveVoice?: boolean }) {
  return (
    <section
      id="demo"
      className="relative overflow-hidden border-b border-[#ebe7f7]/70 bg-gradient-to-b from-[#faf7ff] via-white to-[#f8fafc] py-20 sm:py-28"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_25%,rgba(167,139,250,0.18),transparent_56%),radial-gradient(circle_at_82%_70%,rgba(124,58,237,0.09),transparent_46%)]" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#94a3b8]">How we help</p>
          <h2 className="mt-4 text-[clamp(1.95rem,4vw,2.85rem)] font-semibold tracking-tight text-[#0f172a]">
            {liveVoice ? "Ask our receptionist anything about Solvio." : "See how Solvio fits your venue."}
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-[#64748b]">
            {liveVoice
              ? "Tap the purple microphone at the top of the page — you'll talk live to our AI receptionist demo."
              : "Try the live booking demo below, or scroll up for a scripted voice preview when live AI isn't configured."}
          </p>
        </div>

        <ul className="mx-auto mt-12 grid max-w-2xl gap-3 sm:grid-cols-2">
          {topics.map((topic) => (
            <li
              key={topic}
              className="rounded-2xl border border-[#ebe7f7]/90 bg-white/80 px-5 py-4 text-left text-sm font-medium leading-relaxed text-[#475569] shadow-sm"
            >
              {topic}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href={bookingDemoHref()}
            className={cn(
              buttonVariants({ variant: "default", size: "lg" }),
              "h-12 rounded-full px-9 text-base font-semibold shadow-lg shadow-[#7c3aed]/25",
            )}
          >
            Try live booking demo
          </Link>
          <Link
            href="/#live-ai-receptionist"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-12 rounded-full px-6 text-base font-semibold text-[#64748b] hover:bg-white/70",
            )}
          >
            {liveVoice ? "Talk to AI receptionist" : "Voice preview"}
          </Link>
        </div>
      </div>
    </section>
  );
}
