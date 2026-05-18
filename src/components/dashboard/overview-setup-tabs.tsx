"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarRange, CheckCircle2, Mic2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const flowLabels: Record<string, string> = {
  restaurant_tables: "Restaurant · table bookings",
  salon_appointments: "Salon & appointments",
  walk_in_waitlist: "Walk-ins & waitlist",
  mixed: "Mixed operations",
};

type OverviewSetupTabsProps = {
  hasBusiness: boolean;
  voiceComplete: boolean;
  bookingComplete: boolean;
  bookingFlowKind: string | null;
};

export function OverviewSetupTabs({
  hasBusiness,
  voiceComplete,
  bookingComplete,
  bookingFlowKind,
}: OverviewSetupTabsProps) {
  const defaultTab = useMemo<"voice" | "bookings">(() => {
    if (!voiceComplete) return "voice";
    if (!bookingComplete) return "bookings";
    return "voice";
  }, [voiceComplete, bookingComplete]);

  const [tab, setTab] = useState<"voice" | "bookings">(defaultTab);

  if (!hasBusiness) {
    return (
      <section className="rounded-[22px] border border-dashed border-[#ddd6fe] bg-[#fafbff]/90 px-6 py-8 md:px-10">
        <p className="text-sm font-semibold text-[#0f172a]">Add a business to unlock setup</p>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#64748b]">
          Finish signup with your venue name, or add one from Settings — then you can launch voice reception and your booking link from here.
        </p>
        <Link
          href="/dashboard/settings"
          className={cn(
            buttonVariants({ variant: "default" }),
            "mt-5 inline-flex h-11 rounded-full px-6 font-semibold shadow-md shadow-[#7c3aed]/20",
          )}
        >
          Open settings
        </Link>
      </section>
    );
  }

  const bothDone = voiceComplete && bookingComplete;

  return (
    <section className="overflow-hidden rounded-[24px] border border-[#ebe7f7]/90 bg-white shadow-[0_24px_80px_-56px_rgba(124,58,237,0.35)]">
      <div className="flex flex-col gap-1 border-b border-[#f1eefc] bg-[#fafbff]/80 px-4 pt-4 md:flex-row md:items-center md:justify-between md:px-6">
        <p className="px-1 pb-3 text-xs font-semibold uppercase tracking-[0.26em] text-[#94a3b8] md:pb-4">
          {bothDone ? "Setup status" : "Finish setup"}
        </p>
      </div>

      <div className="flex gap-2 border-b border-[#f1eefc] px-4 pb-0 pt-2 md:px-6" role="tablist" aria-label="Workspace setup">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "voice"}
          className={cn(
            "relative flex flex-1 items-center justify-center gap-2 rounded-t-xl px-3 py-3 text-sm font-semibold transition-colors md:flex-none md:justify-start md:px-5",
            tab === "voice"
              ? "bg-white text-[#5b21b6] shadow-[inset_0_-2px_0_0_#7c3aed]"
              : "text-[#64748b] hover:bg-white/60 hover:text-[#0f172a]",
          )}
          onClick={() => setTab("voice")}
        >
          <Mic2 className="h-4 w-4 shrink-0" aria-hidden />
          Voice receptionist
          {voiceComplete ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden /> : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "bookings"}
          className={cn(
            "relative flex flex-1 items-center justify-center gap-2 rounded-t-xl px-3 py-3 text-sm font-semibold transition-colors md:flex-none md:justify-start md:px-5",
            tab === "bookings"
              ? "bg-white text-[#5b21b6] shadow-[inset_0_-2px_0_0_#7c3aed]"
              : "text-[#64748b] hover:bg-white/60 hover:text-[#0f172a]",
          )}
          onClick={() => setTab("bookings")}
        >
          <CalendarRange className="h-4 w-4 shrink-0" aria-hidden />
          Taking bookings
          {bookingComplete ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden /> : null}
        </button>
      </div>

      <div className="p-6 md:p-8">
        {tab === "voice" ? (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold tracking-tight text-[#0f172a]">
              {voiceComplete ? "AI voice receptionist is configured" : "Create your AI voice receptionist"}
            </h3>
            {!voiceComplete ? (
              <>
                <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
                  Train Solvio how to greet callers, when to escalate to your team, and which tone fits your brand — speech and
                  calls use Solvio-managed Vapi + ElevenLabs when telephony is enabled.
                </p>
                <ul className="list-inside list-disc space-y-1.5 text-sm text-[#475569] marker:text-[#a78bfa]">
                  <li>Brand-safe greetings & language hints</li>
                  <li>Human handoff number for urgent tables</li>
                  <li>Preview scripts before you publish a number</li>
                </ul>
                <Link
                  href="/dashboard/setup/voice"
                  className={cn(
                    buttonVariants({ variant: "default" }),
                    "inline-flex h-11 rounded-full px-6 font-semibold shadow-lg shadow-[#7c3aed]/25",
                  )}
                >
                  Start voice setup
                </Link>
              </>
            ) : (
              <>
                <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
                  Your reception profile is saved. Fine-tune transcripts and routing inside Calls as telephony rolls out — no
                  merchant API keys required.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/dashboard/setup/voice"
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "h-11 rounded-full border-[#ebe7f7] px-6 font-semibold",
                    )}
                  >
                    Edit voice setup
                  </Link>
                  <Link
                    href="/dashboard/calls"
                    className={cn(buttonVariants({ variant: "ghost" }), "h-11 rounded-full px-6 font-semibold text-[#7c3aed]")}
                  >
                    Open Calls workspace
                  </Link>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold tracking-tight text-[#0f172a]">
              {bookingComplete ? "Booking flow saved" : "Start taking bookings"}
            </h3>
            {!bookingComplete ? (
              <>
                <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
                  Tell us whether you seat tables, run timed appointments, manage walk-in queues, or mix modes — we tailor intake copy and
                  defaults before guests hit your Solvio link.
                </p>
                <ul className="list-inside list-disc space-y-1.5 text-sm text-[#475569] marker:text-[#a78bfa]">
                  <li>Restaurant covers vs salon chairs vs hybrid flows</li>
                  <li>Party sizes, slot lengths, peak-hour hints</li>
                  <li>Optional guest-facing note on your booking page</li>
                </ul>
                <Link
                  href="/dashboard/setup/bookings"
                  className={cn(
                    buttonVariants({ variant: "default" }),
                    "inline-flex h-11 rounded-full px-6 font-semibold shadow-lg shadow-[#7c3aed]/25",
                  )}
                >
                  Start booking setup
                </Link>
              </>
            ) : (
              <>
                <p className="max-w-xl text-[15px] leading-relaxed text-[#64748b]">
                  Flow type:{" "}
                  <span className="font-semibold text-[#0f172a]">
                    {(bookingFlowKind && flowLabels[bookingFlowKind]) || bookingFlowKind || "Saved"}
                  </span>
                  . Publish your link under Bookings whenever you&apos;re ready.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/dashboard/setup/bookings"
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "h-11 rounded-full border-[#ebe7f7] px-6 font-semibold",
                    )}
                  >
                    Edit booking flow
                  </Link>
                  <Link
                    href="/dashboard/bookings"
                    className={cn(buttonVariants({ variant: "ghost" }), "h-11 rounded-full px-6 font-semibold text-[#7c3aed]")}
                  >
                    Open Bookings workspace
                  </Link>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
