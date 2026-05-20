"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, CalendarClock, CalendarDays, Layers, LayoutGrid, Loader2 } from "lucide-react";

import { saveBookingFlowSetup, type BookingFlowDetails } from "@/app/dashboard/setup/actions";
import { buttonVariants } from "@/components/ui/button";
import {
  BOOKING_GUEST_MODE_LABELS,
  type BookingGuestMode,
  isBookingGuestMode,
} from "@/lib/booking-guest-modes";
import { cn } from "@/lib/utils";

export type BookingFlowKind =
  | "restaurant_tables"
  | "hosted_events"
  | "salon_appointments"
  | "mixed"
  | "walk_in_waitlist";

const MODE_ORDER: BookingGuestMode[] = ["appointment", "event", "table", "walk_in"];

function bookingsHubPostSetupPath(kind: BookingFlowKind): string {
  switch (kind) {
    case "restaurant_tables":
      return "/dashboard/bookings?tab=offerings&view=tables";
    case "salon_appointments":
      return "/dashboard/bookings?tab=offerings&view=appointments";
    case "hosted_events":
      return "/dashboard/bookings?tab=offerings&view=events";
    case "walk_in_waitlist":
      return "/dashboard/bookings?tab=guests&view=inbox";
    case "mixed":
      return "/dashboard/bookings?tab=offerings&view=appointments";
    default:
      return "/dashboard/bookings?tab=offerings&view=appointments";
  }
}

function sortModesAsc(a: BookingGuestMode, b: BookingGuestMode) {
  return MODE_ORDER.indexOf(a) - MODE_ORDER.indexOf(b);
}

function defaultModesForKind(k: BookingFlowKind): BookingGuestMode[] {
  switch (k) {
    case "restaurant_tables":
      return ["table"];
    case "salon_appointments":
      return ["appointment"];
    case "hosted_events":
      return ["event"];
    case "walk_in_waitlist":
      return ["walk_in"];
    case "mixed":
      return ["appointment", "event", "table", "walk_in"];
    default:
      return ["appointment", "table", "walk_in"];
  }
}

function coerceModes(saved: unknown, kind: BookingFlowKind): BookingGuestMode[] {
  if (Array.isArray(saved)) {
    const parsed = [...new Set(saved.filter((x): x is BookingGuestMode => typeof x === "string" && isBookingGuestMode(x)))];
    if (parsed.length) return parsed.sort(sortModesAsc);
  }
  return defaultModesForKind(kind).slice().sort(sortModesAsc);
}

const kinds: {
  id: BookingFlowKind;
  title: string;
  description: string;
  icon: typeof LayoutGrid;
}[] = [
  {
    id: "restaurant_tables",
    title: "Table bookings",
    description:
      "Reserved seats or covers with party sizes — when guests choose a seating area or table group for a specific visit.",
    icon: LayoutGrid,
  },
  {
    id: "hosted_events",
    title: "Events",
    description:
      "Ticketed or hosted happenings — comedy nights, supper clubs, workshops, or any dated listing guests pick from your events calendar.",
    icon: CalendarDays,
  },
  {
    id: "salon_appointments",
    title: "Appointments",
    description: "Timed slots with start times and durations — consultations, sessions, visits, or any calendar-style booking.",
    icon: CalendarClock,
  },
  {
    id: "mixed",
    title: "Mixed operations",
    description:
      "Combine table bookings, appointments, and hosted events — for teams that operate more than one guest flow.",
    icon: Layers,
  },
];

type BookingFlowSetupWizardProps = {
  businessId: string;
  businessName: string;
  initialKind: BookingFlowKind | null;
  initialDetails: BookingFlowDetails | null;
};

export function BookingFlowSetupWizard({
  businessId,
  businessName,
  initialKind,
  initialDetails,
}: BookingFlowSetupWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<BookingFlowKind>(() => {
    if (initialKind === "walk_in_waitlist") return "hosted_events";
    return initialKind ?? "restaurant_tables";
  });
  const [typicalPartySize, setTypicalPartySize] = useState(initialDetails?.typical_party_size ?? "2–4 guests");
  const [appointmentSlotMinutes, setAppointmentSlotMinutes] = useState(initialDetails?.appointment_slot_minutes ?? 30);
  const [peakHoursNote, setPeakHoursNote] = useState(initialDetails?.peak_hours_note ?? "");
  const [mixedNotes, setMixedNotes] = useState(initialDetails?.mixed_notes ?? "");
  const [guestMessage, setGuestMessage] = useState(initialDetails?.guest_message ?? "");
  const [blockTableWhenHostedNight, setBlockTableWhenHostedNight] = useState(
    Boolean(initialDetails?.block_public_table_when_hosted_event_date),
  );
  const [guestModes, setGuestModes] = useState<BookingGuestMode[]>(() =>
    coerceModes(initialDetails?.guest_booking_modes, initialKind ?? "restaurant_tables"),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const detailStepIndex = 1;
  const messageStepIndex = 2;
  const reviewStepIndex = 3;

  function toggleGuestMode(m: BookingGuestMode) {
    setGuestModes((prev) => {
      if (prev.includes(m)) {
        const next = prev.filter((x) => x !== m);
        return next.length ? next.sort(sortModesAsc) : prev;
      }
      return [...prev, m].sort(sortModesAsc);
    });
  }

  function advanceStep() {
    if (step === detailStepIndex && guestModes.length === 0) {
      setError("Choose at least one booking path guests can use.");
      return;
    }
    setError(null);
    setStep((s) => Math.min(reviewStepIndex, s + 1));
  }

  function buildDetails(): BookingFlowDetails {
    const base: BookingFlowDetails = {
      guest_message: guestMessage.trim() || undefined,
      guest_booking_modes: guestModes,
      block_public_table_when_hosted_event_date:
        guestModes.includes("table") && guestModes.includes("event") ? blockTableWhenHostedNight : false,
    };
    if (kind === "restaurant_tables") {
      base.typical_party_size = typicalPartySize.trim() || undefined;
      base.peak_hours_note = peakHoursNote.trim() || undefined;
    }
    if (kind === "salon_appointments") {
      base.appointment_slot_minutes = appointmentSlotMinutes;
      base.peak_hours_note = peakHoursNote.trim() || undefined;
    }
    if (kind === "hosted_events") {
      base.peak_hours_note = peakHoursNote.trim() || undefined;
    }
    if (kind === "walk_in_waitlist") {
      base.peak_hours_note = peakHoursNote.trim() || undefined;
    }
    if (kind === "mixed") {
      base.typical_party_size = typicalPartySize.trim() || undefined;
      base.peak_hours_note = peakHoursNote.trim() || undefined;
      base.mixed_notes = mixedNotes.trim() || undefined;
    }
    return base;
  }

  function submit() {
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          await saveBookingFlowSetup(businessId, kind, buildDetails());
          router.push(bookingsHubPostSetupPath(kind));
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save.");
        }
      })();
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/dashboard"
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "inline-flex h-10 items-center gap-2 px-2 text-sm font-semibold text-[#64748b] hover:text-[#0f172a]",
          )}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Dashboard
        </Link>
        <span className="rounded-full bg-[#ede9fe] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5b21b6]">
          Step {step + 1} / 4
        </span>
      </div>

      <div className="rounded-[24px] border border-[#ebe7f7] bg-white p-8 shadow-sm md:p-10">
        {step === 0 ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-[#0f172a]">How does {businessName} take bookings?</h1>
              <p className="text-[15px] leading-relaxed text-[#64748b]">
                Pick the closest fit — Solvio adjusts intake on your hosted booking link. To collect table deposits, connect
                Stripe and publish your link from the dashboard launch checklist after you save.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {kinds.map((k) => {
                const Icon = k.icon;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => {
                      setKind(k.id);
                      setGuestModes(defaultModesForKind(k.id).slice().sort(sortModesAsc));
                    }}
                    className={cn(
                      "flex flex-col rounded-2xl border px-4 py-4 text-left transition-colors",
                      kind === k.id
                        ? "border-[#a78bfa] bg-[#f5f3ff] shadow-[inset_0_0_0_1px_rgba(167,139,250,0.45)]"
                        : "border-[#ebe7f7] bg-[#fafbff] hover:border-[#ddd6fe]",
                    )}
                  >
                    <Icon className="h-6 w-6 text-[#7c3aed]" aria-hidden />
                    <p className="mt-3 font-semibold text-[#0f172a]">{k.title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-[#64748b]">{k.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === detailStepIndex ? (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-[#0f172a]">Tune defaults</h2>
            <p className="text-sm text-[#64748b]">
              These hints train Solvio&apos;s wording — switch anytime under Bookings setup.
            </p>

            <div className="rounded-2xl border border-[#ede9fe] bg-[#fafbff]/90 px-4 py-4">
              <p className="text-sm font-semibold text-[#0f172a]">What can guests book on your link?</p>
              <p className="mt-1 text-xs leading-relaxed text-[#64748b]">
                Toggle paths guests see on your link — appointments, events, tables, or walk-in enquiries (pick any combo).
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {MODE_ORDER.map((m) => {
                  const active = guestModes.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleGuestMode(m)}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                        active
                          ? "border-[#a78bfa] bg-[#f5f3ff] text-[#5b21b6]"
                          : "border-[#ebe7f7] bg-white text-[#64748b] hover:border-[#ddd6fe]",
                      )}
                    >
                      {BOOKING_GUEST_MODE_LABELS[m]}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] font-medium text-[#94a3b8]">
                At least one mode must stay on — Solvio hides disabled paths from guests on your booking link automatically.
              </p>

              {guestModes.includes("table") && guestModes.includes("event") ? (
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#e9d5ff] bg-white px-4 py-3 text-sm text-[#475569]">
                  <input
                    type="checkbox"
                    checked={blockTableWhenHostedNight}
                    onChange={(e) => setBlockTableWhenHostedNight(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-[#d4d4d8]"
                  />
                  <span className="space-y-1">
                    <span className="block font-semibold text-[#0f172a]">Block informal table enquires during hosted-show nights</span>
                    <span className="text-[12px] leading-relaxed text-[#64748b]">
                      Keeps diners from requesting free-style tables while a comedy night, supper club, or other ticketed hosted listing occupies the diary — still bookable via the Events tab.
                    </span>
                  </span>
                </label>
              ) : null}
            </div>

            {(kind === "restaurant_tables" || kind === "mixed") && (
              <div className="space-y-2">
                <label htmlFor="party" className="text-sm font-semibold text-[#0f172a]">
                  Typical party size
                </label>
                <input
                  id="party"
                  value={typicalPartySize}
                  onChange={(e) => setTypicalPartySize(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                />
              </div>
            )}

            {kind === "salon_appointments" && (
              <div className="space-y-2">
                <label htmlFor="slot" className="text-sm font-semibold text-[#0f172a]">
                  Default appointment length
                </label>
                <select
                  id="slot"
                  value={appointmentSlotMinutes}
                  onChange={(e) => setAppointmentSlotMinutes(Number(e.target.value))}
                  className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                >
                  {[15, 30, 45, 60, 90].map((m) => (
                    <option key={m} value={m}>
                      {m} minutes
                    </option>
                  ))}
                </select>
                <p className="text-[12px] leading-relaxed text-[#64748b]">
                  Guests pick discrete start slots on your public booking page — length defaults to{' '}
                  <span className="font-semibold text-[#475569]">30&nbsp;minute</span> steps unless each weekday overrides it in{' '}
                  <Link href="/dashboard/bookings" className="font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
                    Dashboard → Bookings
                  </Link>
                  .
                </p>
              </div>
            )}

            {(kind === "restaurant_tables" ||
              kind === "hosted_events" ||
              kind === "salon_appointments" ||
              kind === "walk_in_waitlist" ||
              kind === "mixed") && (
              <div className="space-y-3 rounded-2xl border border-[#f1eefc] bg-[#fafbff]/80 px-4 py-4">
                <p className="text-[13px] leading-relaxed text-[#475569]">
                  <strong className="font-semibold text-[#0f172a]">Availability & blackout dates</strong> are managed inside{' '}
                  <Link href="/dashboard/bookings" className="font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
                    Bookings
                  </Link>{' '}
                  (weekly grids + blocked days). Appointment bookings use{' '}
                  <span className="font-semibold">a date plus a timed slot</span> generated from those hours. Ticketed or
                  one-off happenings are configured as <span className="font-semibold">Events</span> so guests can choose those
                  instead of a plain slot.
                </p>
                <div className="space-y-2">
                  <label htmlFor="peak" className="text-sm font-semibold text-[#0f172a]">
                    Optional note shown on booking page<span className="font-normal text-[#94a3b8]"> (marketing / caveats)</span>
                  </label>
                  <textarea
                    id="peak"
                    value={peakHoursNote}
                    onChange={(e) => setPeakHoursNote(e.target.value)}
                    rows={3}
                    placeholder="Example: &quot;We open next month&apos;s bookings every Friday.&quot; — blackout days live in Dashboard → Bookings inventory."
                    className="w-full rounded-xl border border-[#ebe7f7] bg-white px-4 py-3 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                  />
                  <p className="text-[11px] font-medium leading-relaxed text-[#94a3b8]">
                    Tip: Leave this blank if you rely on purely structured hours + automated slots below.
                  </p>
                </div>
              </div>
            )}

            {kind === "mixed" && (
              <div className="space-y-2">
                <label htmlFor="mixed" className="text-sm font-semibold text-[#0f172a]">
                  Describe the hybrid flow
                </label>
                <textarea
                  id="mixed"
                  value={mixedNotes}
                  onChange={(e) => setMixedNotes(e.target.value)}
                  rows={3}
                  placeholder="Example: weekdays are walk-ins only — weekends reserve tables ahead; mention anything staff should remember."
                  className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                />
              </div>
            )}
          </div>
        ) : null}

        {step === messageStepIndex ? (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold text-[#0f172a]">Guest-facing greeting</h2>
            <p className="text-sm leading-relaxed text-[#64748b]">
              Appears near the top of your Solvio booking page so guests know what to expect before they share contact details.
            </p>
            <textarea
              value={guestMessage}
              onChange={(e) => setGuestMessage(e.target.value)}
              rows={5}
              placeholder={`Example: Thanks for choosing ${businessName}. We confirm by message within an hour — larger groups may need a deposit.`}
              className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            />
          </div>
        ) : null}

        {step === reviewStepIndex ? (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold text-[#0f172a]">Review booking setup</h2>
            <dl className="space-y-4 rounded-2xl border border-[#f1eefc] bg-[#fafbff] px-5 py-5 text-sm">
              <div>
                <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Flow</dt>
                <dd className="mt-1 text-[#0f172a]">{kinds.find((x) => x.id === kind)?.title}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Guest booking paths</dt>
                <dd className="mt-1 text-[#475569]">
                  {guestModes.map((m) => BOOKING_GUEST_MODE_LABELS[m]).join(" · ")}
                </dd>
              </div>
              {(kind === "restaurant_tables" || kind === "mixed") && (
                <div>
                  <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Party size hint</dt>
                  <dd className="mt-1 text-[#475569]">{typicalPartySize.trim() || "—"}</dd>
                </div>
              )}
              {kind === "salon_appointments" && (
                <div>
                  <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Slot length</dt>
                  <dd className="mt-1 text-[#475569]">{appointmentSlotMinutes} minutes</dd>
                </div>
              )}
              {(peakHoursNote.trim() || kind === "hosted_events" || kind === "walk_in_waitlist") && (
                <div>
                  <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Guest-visible note</dt>
                  <dd className="mt-1 text-[#475569]">{peakHoursNote.trim() || "—"}</dd>
                </div>
              )}
              {guestModes.includes("table") && guestModes.includes("event") ? (
                <div>
                  <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Hosted vs table clashes</dt>
                  <dd className="mt-1 text-[#475569]">
                    {blockTableWhenHostedNight
                      ? "Table path pauses anytime a hosted show lands on that calendar night."
                      : "Table path stays open even when hosted happenings exist — revisit setup if you prefer to block clashes."}
                  </dd>
                </div>
              ) : null}
              {kind === "mixed" && (
                <div>
                  <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Hybrid notes</dt>
                  <dd className="mt-1 text-[#475569]">{mixedNotes.trim() || "—"}</dd>
                </div>
              )}
              <div>
                <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Guest message</dt>
                <dd className="mt-1 whitespace-pre-wrap text-[#475569]">{guestMessage.trim() || "—"}</dd>
              </div>
            </dl>
            <div className="rounded-2xl border border-[#ede9fe] bg-[#faf5ff]/90 px-5 py-4 text-sm leading-relaxed text-[#475569]">
              <p className="font-semibold text-[#0f172a]">After you save</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                <li>
                  <Link href="/dashboard/payments" className="font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
                    Connect Stripe
                  </Link>{" "}
                  so guests can pay table deposits
                </li>
                <li>
                  Publish your booking slug under{" "}
                  <Link href="/dashboard/bookings" className="font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
                    Bookings
                  </Link>
                </li>
                <li>Add at least one table, event, or appointment slot for guests to choose</li>
              </ol>
            </div>
            {error ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-900">{error}</p> : null}
          </div>
        ) : null}

        <div className="mt-10 flex flex-wrap justify-between gap-3 border-t border-[#f1eefc] pt-8">
          <button
            type="button"
            disabled={step === 0 || pending}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "rounded-full border-[#ebe7f7] px-6 font-semibold disabled:opacity-40",
            )}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </button>
          {step < reviewStepIndex ? (
            <button
              type="button"
              className={cn(
                buttonVariants({ variant: "default" }),
                "rounded-full px-6 font-semibold shadow-md shadow-[#7c3aed]/25",
              )}
              onClick={() => advanceStep()}
            >
              Continue
              <ArrowRight className="ml-2 inline h-4 w-4" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              className={cn(
                buttonVariants({ variant: "default" }),
                "rounded-full px-6 font-semibold shadow-md shadow-[#7c3aed]/25",
              )}
              onClick={() => submit()}
            >
              {pending ? (
                <>
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                <>
                  Save booking flow
                  <ArrowRight className="ml-2 inline h-4 w-4" aria-hidden />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
