"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Layers, LayoutGrid, Loader2, Scissors } from "lucide-react";

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
      return ["appointment", "table"];
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
    title: "Tables",
    description: "Guests pick a date, party size, and leave their details — like a normal restaurant reservation.",
    icon: LayoutGrid,
  },
  {
    id: "hosted_events",
    title: "Events",
    description: "Guests book a specific night or show — comedy, supper club, workshop, etc.",
    icon: CalendarDays,
  },
  {
    id: "salon_appointments",
    title: "Appointments",
    description: "Guests pick a date and time slot — haircuts, treatments, consultations.",
    icon: Scissors,
  },
  {
    id: "mixed",
    title: "More than one",
    description: "You take tables, appointments, and/or events — turn on whichever you need on the next step.",
    icon: Layers,
  },
];

type BookingFlowSetupWizardProps = {
  businessId: string;
  businessName: string;
  initialKind: BookingFlowKind | null;
  initialDetails: BookingFlowDetails | null;
  fromOnboarding?: boolean;
};

export function BookingFlowSetupWizard({
  businessId,
  businessName,
  initialKind,
  initialDetails,
  fromOnboarding = false,
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
  const [guestMessage, setGuestMessage] = useState(initialDetails?.guest_message ?? "");
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
    }
    return base;
  }

  function submit() {
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          await saveBookingFlowSetup(businessId, kind, buildDetails());
          if (fromOnboarding) {
            router.push("/dashboard/onboarding?step=2&booking=done");
          } else {
            router.push(`${bookingsHubPostSetupPath(kind)}&saved=1`);
          }
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
          href={fromOnboarding ? "/dashboard/onboarding?step=1" : "/dashboard"}
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "inline-flex h-10 items-center gap-2 px-2 text-sm font-semibold text-[#64748b] hover:text-[#0f172a]",
          )}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {fromOnboarding ? "Back to onboarding" : "Dashboard"}
        </Link>
        <span className="rounded-full bg-[#ede9fe] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5b21b6]">
          Step {step + 1} / 4
        </span>
      </div>

      <div className="rounded-[24px] border border-[#ebe7f7] bg-white p-8 shadow-sm md:p-10">
        {step === 0 ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-[#0f172a]">How do guests book {businessName}?</h1>
              <p className="text-[15px] leading-relaxed text-[#64748b]">
                Choose the closest match. You&apos;ll get a link like <strong className="font-semibold text-[#475569]">yoursite.com/book/your-venue</strong> to
                share on Instagram, Google, and your website.
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
            <h2 className="text-xl font-semibold text-[#0f172a]">Your booking link</h2>
            <p className="text-sm leading-relaxed text-[#64748b]">
              Turn on what guests can request. You can change this anytime. Opening hours and closed days are set later in{" "}
              <Link href="/dashboard/bookings" className="font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
                Bookings
              </Link>
              .
            </p>

            <div className="rounded-2xl border border-[#ede9fe] bg-[#fafbff]/90 px-4 py-4">
              <p className="text-sm font-semibold text-[#0f172a]">Guests can book…</p>
              <p className="mt-1 text-xs leading-relaxed text-[#64748b]">Tap to turn each option on or off.</p>
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
              <p className="mt-2 text-[11px] font-medium text-[#94a3b8]">Keep at least one option on.</p>
            </div>

            {(kind === "restaurant_tables" || kind === "mixed") && (
              <div className="space-y-2">
                <label htmlFor="party" className="text-sm font-semibold text-[#0f172a]">
                  Usual group size <span className="font-normal text-[#94a3b8]">(optional hint for guests)</span>
                </label>
                <input
                  id="party"
                  value={typicalPartySize}
                  onChange={(e) => setTypicalPartySize(e.target.value)}
                  placeholder="e.g. 2–4 people"
                  className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                />
              </div>
            )}

            {kind === "salon_appointments" && (
              <div className="space-y-2">
                <label htmlFor="slot" className="text-sm font-semibold text-[#0f172a]">
                  How long is a typical appointment?
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
                  Guests will pick a start time in {appointmentSlotMinutes}-minute steps. Fine-tune hours per day in Bookings after you save.
                </p>
              </div>
            )}

            {(kind === "restaurant_tables" ||
              kind === "hosted_events" ||
              kind === "salon_appointments" ||
              kind === "walk_in_waitlist" ||
              kind === "mixed") && (
              <div className="space-y-2">
                <label htmlFor="peak" className="text-sm font-semibold text-[#0f172a]">
                  Extra message for guests <span className="font-normal text-[#94a3b8]">(optional)</span>
                </label>
                <textarea
                  id="peak"
                  value={peakHoursNote}
                  onChange={(e) => setPeakHoursNote(e.target.value)}
                  rows={3}
                  placeholder='e.g. "We reply within 2 hours. Large groups may need a deposit."'
                  className="w-full rounded-xl border border-[#ebe7f7] bg-white px-4 py-3 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
                />
                <p className="text-[11px] font-medium leading-relaxed text-[#94a3b8]">
                  Shows on your public booking page. Skip if you don&apos;t need it.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {step === messageStepIndex ? (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold text-[#0f172a]">Welcome message</h2>
            <p className="text-sm leading-relaxed text-[#64748b]">
              The first thing guests read on your booking page — say hello and set expectations.
            </p>
            <textarea
              value={guestMessage}
              onChange={(e) => setGuestMessage(e.target.value)}
              rows={5}
              placeholder={`Thanks for booking ${businessName}. We confirm by email — usually within an hour.`}
              className="w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            />
          </div>
        ) : null}

        {step === reviewStepIndex ? (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold text-[#0f172a]">Check and save</h2>
            <dl className="space-y-4 rounded-2xl border border-[#f1eefc] bg-[#fafbff] px-5 py-5 text-sm">
              <div>
                <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Type</dt>
                <dd className="mt-1 text-[#0f172a]">{kinds.find((x) => x.id === kind)?.title}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Guests can book</dt>
                <dd className="mt-1 text-[#475569]">
                  {guestModes.map((m) => BOOKING_GUEST_MODE_LABELS[m]).join(" · ")}
                </dd>
              </div>
              {(kind === "restaurant_tables" || kind === "mixed") && (
                <div>
                  <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Group size</dt>
                  <dd className="mt-1 text-[#475569]">{typicalPartySize.trim() || "—"}</dd>
                </div>
              )}
              {kind === "salon_appointments" && (
                <div>
                  <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Appointment length</dt>
                  <dd className="mt-1 text-[#475569]">{appointmentSlotMinutes} minutes</dd>
                </div>
              )}
              {(peakHoursNote.trim() || kind === "hosted_events" || kind === "walk_in_waitlist") && (
                <div>
                  <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Extra message</dt>
                  <dd className="mt-1 text-[#475569]">{peakHoursNote.trim() || "—"}</dd>
                </div>
              )}
              <div>
                <dt className="font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Welcome message</dt>
                <dd className="mt-1 whitespace-pre-wrap text-[#475569]">{guestMessage.trim() || "—"}</dd>
              </div>
            </dl>
            <div className="rounded-2xl border border-[#ede9fe] bg-[#faf5ff]/90 px-5 py-4 text-sm leading-relaxed text-[#475569]">
              <p className="font-semibold text-[#0f172a]">After you save</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                <li>
                  Add your tables, events, or time slots in{" "}
                  <Link href={bookingsHubPostSetupPath(kind)} className="font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
                    Bookings
                  </Link>
                </li>
                <li>
                  Copy your guest link in{" "}
                  <Link href="/dashboard/bookings#booking-links" className="font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
                    Bookings → Guest link
                  </Link>
                </li>
                <li>
                  Optional:{" "}
                  <Link href="/dashboard/payments" className="font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
                    Connect Stripe
                  </Link>{" "}
                  for deposits ·{" "}
                  <Link href="/dashboard/pricing" className="font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
                    add card
                  </Link>{" "}
                  before trial ends
                </li>
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
