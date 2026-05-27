import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MarketingTrustStats } from "@/components/home/marketing-trust-stats";

const stories = [
  {
    biz: "The Corner Table · Manchester",
    quote:
      "We posted the /book link on Instagram and stopped losing tables to voicemail. Bookings are up and Friday feels full again.",
    owner: "James O. · Owner",
    metric: "+32% bookings",
    money: "£1,420/mo in deposits",
  },
  {
    biz: "Bark Barber Studio · Leeds",
    quote:
      "Saturday used to be no-show chaos. Deposits at checkout changed everything — clients actually turn up.",
    owner: "Priya M. · Studio manager",
    metric: "−41% no-shows",
    money: "~£680/mo recovered",
  },
  {
    biz: "Glow Salon · Dublin",
    quote:
      "I got six hours back every week. No more DMs, missed calls, or scribbling appointments on paper.",
    owner: "Aoife K. · Salon owner",
    metric: "6 hrs/week saved",
    money: "Team stays on the floor",
  },
  {
    biz: "Riverside Bistro · Bristol",
    quote:
      "After-hours enquiries used to die on the answerphone. Now guests book and pay while we're closed — real money on the bank feed.",
    owner: "Tom H. · GM",
    metric: "+£2.1k/mo",
    money: "After-hours revenue",
  },
  {
    biz: "Studio Nineteen · Edinburgh",
    quote:
      "First month we filled eighteen empty stylist slots from the link alone. Didn't hire anyone extra to answer phones.",
    owner: "Emma L. · Owner",
    metric: "18 slots filled",
    money: "First 30 days",
  },
  {
    biz: "Harbor Events · Cork",
    quote:
      "Three sold-out show nights straight from one booking page. Less spreadsheet panic, more time with the artists.",
    owner: "Sean B. · Events lead",
    metric: "3 nights sold out",
    money: "Less admin time",
  },
];

export function SocialProofSection() {
  return (
    <section id="proof" className="border-b border-[#ebe7f7]/70 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#94a3b8]">Results venues aim for</p>
            <h2 className="text-[clamp(1.95rem,4vw,2.75rem)] font-semibold tracking-tight text-[#0f172a]">
              More bookings. More deposit revenue. Less time on the phone.
            </h2>
            <p className="text-[17px] leading-relaxed text-[#64748b]">
              Busy restaurants, salons and event spaces use one /book link to capture demand — even when nobody can pick
              up. These are illustrative outcomes, not verified case studies.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Badge className="rounded-full bg-[#7c3aed] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white hover:bg-[#7c3aed]">
              +34% bookings
            </Badge>
            <Badge variant="outline" className="rounded-full border-[#ebe7f7] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#64748b]">
              £1.8k/mo deposits
            </Badge>
            <Badge variant="outline" className="rounded-full border-[#ebe7f7] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#64748b]">
              6 hrs saved / week
            </Badge>
          </div>
        </div>

        <div className="mt-12">
          <MarketingTrustStats />
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {stories.map((story) => (
            <Card
              key={story.biz}
              className="relative flex h-full flex-col rounded-[26px] border border-[#ebe7f7] bg-[#fafbff] p-8 shadow-none ring-1 ring-[#f5f3ff]"
            >
              <span className="absolute right-4 top-4 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8] ring-1 ring-[#ebe7f7]">
                Illustrative
              </span>
              <p className="mt-6 text-[15px] leading-relaxed text-[#0f172a]">&ldquo;{story.quote}&rdquo;</p>
              <div className="mt-auto pt-8">
                <p className="text-sm font-semibold text-[#0f172a]">{story.biz}</p>
                <p className="text-xs text-[#64748b]">{story.owner}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
                    {story.metric}
                  </span>
                  <span className="inline-flex rounded-full bg-[#f5f3ff] px-3 py-1.5 text-[11px] font-semibold text-[#5b21b6] ring-1 ring-[#ede9fe]">
                    {story.money}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
