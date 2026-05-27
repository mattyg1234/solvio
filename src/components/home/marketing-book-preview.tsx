import Link from "next/link";
import { CalendarCheck, CreditCard, Lock } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { bookingDemoHref } from "@/lib/marketing-links";
import { cn } from "@/lib/utils";

/** Static mockup — shows merchants what guests see on /book (no screenshot asset required). */
export function MarketingBookPreview() {
  return (
    <section className="border-b border-[#ebe7f7]/70 bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div className="space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#94a3b8]">What guests see</p>
            <h2 className="text-[clamp(1.75rem,3.5vw,2.35rem)] font-semibold tracking-tight text-[#0f172a]">
              One branded page — pick a service, pay a deposit, get confirmed.
            </h2>
            <p className="text-[17px] leading-relaxed text-[#64748b]">
              Your logo, address, and phone at the top. Step-by-step booking for tables, appointments, or events. Stripe
              checkout when you want deposits online.
            </p>
            <Link
              href={bookingDemoHref()}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "inline-flex h-11 rounded-full border-[#c4b5fd] px-6 font-semibold text-[#5b21b6] hover:bg-[#ede9fe]",
              )}
            >
              Open live booking demo →
            </Link>
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <div className="pointer-events-none absolute -inset-4 rounded-[32px] bg-[#ede9fe]/40 blur-2xl" aria-hidden />
            <div className="relative overflow-hidden rounded-[28px] border border-[#ebe7f7] bg-[#fafbff] shadow-[0_32px_90px_-48px_rgba(124,58,237,0.45)]">
              <div className="border-b border-[#ebe7f7] bg-white px-5 py-4 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ede9fe] text-lg font-bold text-[#5b21b6]">
                  CA
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#94a3b8]">Book with Café Aurora</p>
                <p className="mt-1 text-lg font-semibold text-[#0f172a]">Request an appointment</p>
                <p className="mt-1 text-[12px] text-[#64748b]">12 High Street · +44 7700 900123</p>
              </div>
              <div className="space-y-3 p-4">
                {[
                  { step: "1", title: "Choose a service", body: "Haircut · 45 min · £35" },
                  { step: "2", title: "Which day?", body: "Highlighted dates available" },
                  { step: "3", title: "Your details", body: "Name, email, phone" },
                ].map((row) => (
                  <div key={row.step} className="rounded-xl border border-[#ebe7f7] bg-white px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ede9fe] text-xs font-bold text-[#5b21b6]">
                        {row.step}
                      </span>
                      <div>
                        <p className="text-[13px] font-semibold text-[#0f172a]">{row.title}</p>
                        <p className="text-[12px] text-[#64748b]">{row.body}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-center gap-2 rounded-full bg-[#7c3aed] px-4 py-3 text-[13px] font-semibold text-white shadow-md shadow-[#7c3aed]/25">
                  <Lock className="h-3.5 w-3.5" aria-hidden />
                  Continue · pay £10 deposit
                </div>
                <p className="flex items-center justify-center gap-1.5 text-[11px] text-[#94a3b8]">
                  <CreditCard className="h-3 w-3" aria-hidden />
                  Paid securely via Stripe
                </p>
              </div>
              <div className="border-t border-[#ebe7f7] bg-white px-4 py-3 text-center text-[10px] text-[#94a3b8]">
                <CalendarCheck className="mx-auto mb-1 h-4 w-4 text-[#7c3aed]" aria-hidden />
                Email confirmation after submit
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
