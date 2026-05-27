import {
  CalendarX,
  CreditCard,
  Mail,
  Phone,
  Scissors,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const capabilities = [
  { title: "Takes enquiries", body: "Your /book link accepts requests 24/7 — tables, stylists, events, or walk-ins." },
  { title: "Takes bookings", body: "Guests pick slots; you confirm from one inbox with your team." },
  { title: "Collects deposits", body: "Optional card prepayments when you enable them — shown clearly to guests." },
  { title: "Confirms visits", body: "Email confirmations guests actually open." },
  { title: "Handles changes", body: "Cancellations and closed days stay in sync on your calendar." },
];

export function CommerceSection() {
  return (
    <section
      id="commerce"
      className="relative overflow-hidden border-b border-[#ebe7f7]/70 bg-gradient-to-b from-white via-[#fafbff] to-[#f8fafc] py-20 sm:py-28"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_-20%,rgba(167,139,250,0.12),transparent_50%),radial-gradient(ellipse_at_10%_80%,rgba(124,58,237,0.06),transparent_45%)]" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#94a3b8]">Bookings &amp; payments</p>
          <h2 className="mt-4 text-[clamp(1.95rem,4vw,2.85rem)] font-semibold tracking-tight text-[#0f172a]">
            Guest books a slot → optional deposit → payout to you.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-[#64748b]">
            One booking link for your venue — tables, stylists or ticketed nights. Start with free enquiries; turn on card
            deposits when you&apos;re ready. Pro adds the full AI receptionist for after-hours calls.
          </p>
        </div>

        <div className="mx-auto mt-10 flex justify-center">
          <Badge className="rounded-full bg-[#ede9fe] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5b21b6] hover:bg-[#ede9fe]">
            Payouts go to you
          </Badge>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <Card className="h-full rounded-[26px] border border-[#ebe7f7] bg-white/95 p-8 shadow-[0_28px_90px_-58px_rgba(124,58,237,0.45)] backdrop-blur-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
              <CreditCard className="h-6 w-6" aria-hidden />
            </div>
            <h3 className="mt-6 text-xl font-semibold tracking-tight text-[#0f172a]">Guests pay you directly</h3>
            <p className="mt-4 text-[15px] leading-relaxed text-[#64748b]">
              Guests book with <span className="font-medium text-[#0f172a]">your venue</span>, not a third-party marketplace.
              When deposits are on, card payments route to your payout account — Solvio runs the page, calendar, and
              confirmations and keeps a small platform fee on each deposit.
            </p>
            <ul className="mt-6 space-y-3 text-[15px] leading-relaxed text-[#64748b]">
              <li className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#7c3aed]" aria-hidden />
                Share one link — Instagram, Google, voicemail, wherever guests find you.
              </li>
              <li className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#a78bfa]" aria-hidden />
                Deposits are optional — start with free enquiries if you prefer.
              </li>
            </ul>
          </Card>

          <Card className="h-full rounded-[26px] border border-[#ebe7f7] bg-white/95 p-8 shadow-[0_28px_90px_-58px_rgba(124,58,237,0.45)] backdrop-blur-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
              <Sparkles className="h-6 w-6" aria-hidden />
            </div>
            <h3 className="mt-6 text-xl font-semibold tracking-tight text-[#0f172a]">Pricing that grows when you grow</h3>
            <p className="mt-4 text-[15px] leading-relaxed text-[#64748b]">
              <span className="font-medium text-[#0f172a]">£50/month</span> launch pricing for the Booking tier — public link,
              operations hub, online deposits, and guest email. Pro adds AI receptionist from £150/mo when you&apos;re ready.
            </p>
            <p className="mt-4 text-[14px] leading-relaxed text-[#94a3b8]">
              Launch pricing £50/mo for early venues — £89/mo after the first 50 sign up.
            </p>
          </Card>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((item) => (
            <Card
              key={item.title}
              className="h-full rounded-[22px] border border-[#ebe7f7]/90 bg-white/90 p-6 shadow-none ring-1 ring-[#f5f3ff]"
            >
              <p className="text-[15px] font-semibold text-[#0f172a]">{item.title}</p>
              <p className="mt-2 text-[14px] leading-relaxed text-[#64748b]">{item.body}</p>
            </Card>
          ))}
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          <Card className="h-full rounded-[26px] border border-[#ebe7f7] bg-[#fafbff] p-8 ring-1 ring-[#ede9fe]/80">
            <div className="flex items-center gap-3 text-[#7c3aed]">
              <UtensilsCrossed className="h-6 w-6 shrink-0" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-[0.26em] text-[#64748b]">Restaurant flow</span>
            </div>
            <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-[#475569]">
              <p>
                <span className="font-semibold text-[#0f172a]">Caller:</span> “Table for four tonight at eight.”
              </p>
              <p>
                <span className="font-semibold text-[#0f172a]">Solvio:</span> checks live availability → holds the request →
                can send a deposit link if you use them → confirms and notifies your front-of-house team.
              </p>
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[#64748b]">
                <Phone className="h-4 w-4 text-[#7c3aed]" aria-hidden />
                Voice booking
                <span aria-hidden className="text-[#cbd5e1]">
                  ·
                </span>
                <CreditCard className="h-4 w-4 text-[#7c3aed]" aria-hidden />
                Paid to you
                <span aria-hidden className="text-[#cbd5e1]">
                  ·
                </span>
                <Mail className="h-4 w-4 text-[#7c3aed]" aria-hidden />
                Guest confirmation
              </p>
            </div>
          </Card>

          <Card className="h-full rounded-[26px] border border-[#ebe7f7] bg-[#fafbff] p-8 ring-1 ring-[#ede9fe]/80">
            <div className="flex items-center gap-3 text-[#7c3aed]">
              <Scissors className="h-6 w-6 shrink-0" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-[0.26em] text-[#64748b]">Salon flow</span>
            </div>
            <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-[#475569]">
              <p>
                <span className="font-semibold text-[#0f172a]">Caller:</span> “Haircut tomorrow afternoon.”
              </p>
              <p>
                <span className="font-semibold text-[#0f172a]">Solvio:</span> shows available calendar days → guest picks stylist
                &amp; time → can pay an optional deposit → email confirmation lands instantly.
              </p>
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[#64748b]">
                <CreditCard className="h-4 w-4 text-[#7c3aed]" aria-hidden />
                Online deposit
                <span aria-hidden className="text-[#cbd5e1]">
                  ·
                </span>
                <Mail className="h-4 w-4 text-[#7c3aed]" aria-hidden />
                Email confirm
                <span aria-hidden className="text-[#cbd5e1]">
                  ·
                </span>
                <CalendarX className="h-4 w-4 text-[#7c3aed]" aria-hidden />
                Closed days blocked
              </p>
            </div>
          </Card>
        </div>

        <div className="mx-auto mt-14 max-w-2xl rounded-[22px] border border-[#ebe7f7] bg-white px-6 py-8 text-center shadow-[0_18px_60px_-44px_rgba(124,58,237,0.35)] sm:px-10">
          <p className="text-[15px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">Dashboard layer</p>
          <p className="mt-4 text-[17px] leading-relaxed text-[#475569]">
            Operators still deserve clarity — every booking, payment and confirmation in one calm workspace while Solvio
            handles the phone lines.
          </p>
        </div>
      </div>
    </section>
  );
}
