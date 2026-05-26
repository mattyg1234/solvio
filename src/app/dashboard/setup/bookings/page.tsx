import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BookingFlowSetupWizard, type BookingFlowKind } from "@/components/dashboard/booking-flow-setup-wizard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Booking setup · Dashboard · Solvio",
};

const bookingKinds: BookingFlowKind[] = ["restaurant_tables", "hosted_events", "salon_appointments", "mixed"];

function parseBookingKind(raw: string | null): BookingFlowKind | null {
  if (!raw) return null;
  if (raw === "walk_in_waitlist") return "walk_in_waitlist";
  return bookingKinds.includes(raw as BookingFlowKind) ? (raw as BookingFlowKind) : null;
}

export default async function BookingFlowSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const sp = await searchParams;
  const fromOnboarding = sp.from === "onboarding";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: biz } = await supabase
    .from("businesses")
    .select("id,name,booking_flow_kind,booking_flow_details")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!biz) {
    redirect("/dashboard/settings");
  }

  const initialKind = parseBookingKind((biz.booking_flow_kind as string | null) ?? null);
  const rawDetails = biz.booking_flow_details as Record<string, unknown> | null;
  const guestBookingModesRaw = rawDetails?.guest_booking_modes;
  const guestBookingModes =
    Array.isArray(guestBookingModesRaw) && guestBookingModesRaw.every((x) => typeof x === "string")
      ? (guestBookingModesRaw as string[])
      : undefined;

  const bpth = rawDetails?.block_public_table_when_hosted_event_date;

  const initialDetails =
    rawDetails && typeof rawDetails === "object"
      ? {
          typical_party_size: typeof rawDetails.typical_party_size === "string" ? rawDetails.typical_party_size : undefined,
          appointment_slot_minutes:
            typeof rawDetails.appointment_slot_minutes === "number" ? rawDetails.appointment_slot_minutes : undefined,
          peak_hours_note: typeof rawDetails.peak_hours_note === "string" ? rawDetails.peak_hours_note : undefined,
          guest_message: typeof rawDetails.guest_message === "string" ? rawDetails.guest_message : undefined,
          mixed_notes: typeof rawDetails.mixed_notes === "string" ? rawDetails.mixed_notes : undefined,
          guest_booking_modes: guestBookingModes,
          block_public_table_when_hosted_event_date:
            typeof bpth === "boolean" ? bpth : typeof bpth === "string" ? ["true", "1", "yes"].includes(bpth.trim().toLowerCase()) : undefined,
        }
      : null;

  return (
    <BookingFlowSetupWizard
      businessId={biz.id}
      businessName={biz.name}
      initialKind={initialKind}
      initialDetails={initialDetails}
      fromOnboarding={fromOnboarding}
    />
  );
}
