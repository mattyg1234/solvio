import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BookingsFirstRunBannerProps = {
  postSetupPath: string;
  publicBookingUrl: string | null;
};

export function BookingsFirstRunBanner({ postSetupPath, publicBookingUrl }: BookingsFirstRunBannerProps) {
  return (
    <section className="rounded-[24px] border border-[#ddd6fe] bg-gradient-to-br from-[#faf5ff] to-white p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xl space-y-3">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#5b21b6]">
            <Sparkles className="h-4 w-4" aria-hidden />
            First guest booking
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-[#0f172a] md:text-2xl">
            Your flow is saved — now give guests something to book.
          </h2>
          <p className="text-[15px] leading-relaxed text-[#64748b]">
            Add at least one table, event, or appointment window. Then copy your link and send yourself a test booking.
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-[#475569]">
            <li>Add inventory below (tables, events, or hours)</li>
            <li>Copy your guest link and open it on your phone</li>
            <li>Submit a test request — it lands in Incoming requests</li>
          </ol>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Link
            href={postSetupPath}
            className={cn(
              buttonVariants({ variant: "default" }),
              "inline-flex h-11 items-center gap-2 rounded-full px-6 font-semibold shadow-md shadow-[#7c3aed]/20",
            )}
          >
            Add your first offering
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          {publicBookingUrl ? (
            <Link
              href="#booking-links"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "inline-flex h-10 rounded-full border-[#c4b5fd] px-5 text-sm font-semibold text-[#5b21b6]",
              )}
            >
              Jump to guest link
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
