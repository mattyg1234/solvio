import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const stories = [
  {
    biz: "The Corner Table · Manchester",
    quote:
      "Bookings jumped after we shared one /book link — mostly guests booking after hours when nobody was on the phone.",
    owner: "Example outcome",
    metric: "+32% bookings",
  },
  {
    biz: "Bark Barber Studio · Leeds",
    quote:
      "Clients pick stylist slots online and pay a deposit before they arrive — fewer no-shows on Saturday.",
    owner: "Example outcome",
    metric: "Fewer no-shows",
  },
  {
    biz: "Glow Salon · Dublin",
    quote:
      "Weekend chaos finally feels manageable — one calendar for the team instead of DMs and missed calls.",
    owner: "Example outcome",
    metric: "Calmer weekends",
  },
];

export function SocialProofSection() {
  return (
    <section id="proof" className="border-b border-[#ebe7f7]/70 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#94a3b8]">Example outcomes</p>
            <h2 className="text-[clamp(1.95rem,4vw,2.75rem)] font-semibold tracking-tight text-[#0f172a]">
              Built for busy storefronts like yours.
            </h2>
            <p className="text-[17px] leading-relaxed text-[#64748b]">
              Illustrative scenarios — not verified customer reviews. Your results will vary.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Badge className="rounded-full bg-[#7c3aed] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white hover:bg-[#7c3aed]">
              Example: +32% bookings
            </Badge>
            <Badge variant="outline" className="rounded-full border-[#ebe7f7] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#64748b]">
              Fewer no-shows
            </Badge>
          </div>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {stories.map((story) => (
            <Card
              key={story.biz}
              className="relative flex h-full flex-col rounded-[26px] border border-[#ebe7f7] bg-[#fafbff] p-8 shadow-none ring-1 ring-[#f5f3ff]"
            >
              <span className="absolute right-4 top-4 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8] ring-1 ring-[#ebe7f7]">
                Illustrative
              </span>
              <p className="mt-6 text-[15px] leading-relaxed text-[#0f172a]">{story.quote}</p>
              <div className="mt-auto pt-8">
                <p className="text-sm font-semibold text-[#0f172a]">{story.biz}</p>
                <p className="text-xs uppercase tracking-[0.26em] text-[#94a3b8]">{story.owner}</p>
                <p className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
                  {story.metric}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
