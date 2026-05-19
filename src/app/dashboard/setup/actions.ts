"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { mergeVoiceReceptionistDetails, type VoiceReceptionistSaveInput } from "@/lib/voice-receptionist";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BookingFlowDetails = {
  typical_party_size?: string;
  appointment_slot_minutes?: number;
  peak_hours_note?: string;
  guest_message?: string;
  mixed_notes?: string;
  /** Allowed booking kinds on the public link: appointment | table | walk_in */
  guest_booking_modes?: string[];
  /** When Tables + Hosted events are both enabled, hides free-form table enquires any night a show occurrence runs */
  block_public_table_when_hosted_event_date?: boolean;
};

async function assertOwnBusiness(businessId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const { data: row } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!row) {
    throw new Error("Business not found.");
  }
  return { supabase, user };
}

export async function saveVoiceReceptionistSetup(businessId: string, details: VoiceReceptionistSaveInput) {
  const { supabase } = await assertOwnBusiness(businessId);
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("businesses")
    .select("voice_receptionist_details")
    .eq("id", businessId)
    .maybeSingle();

  const prev =
    existing?.voice_receptionist_details && typeof existing.voice_receptionist_details === "object"
      ? (existing.voice_receptionist_details as Record<string, unknown>)
      : {};

  const merged = mergeVoiceReceptionistDetails(prev, details);

  const { error } = await supabase
    .from("businesses")
    .update({
      voice_receptionist_completed_at: now,
      voice_receptionist_details: merged,
      updated_at: now,
    })
    .eq("id", businessId);

  if (error) {
    throw new Error(error.message);
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/setup/voice");
}

export async function saveBookingFlowSetup(
  businessId: string,
  kind: "restaurant_tables" | "hosted_events" | "salon_appointments" | "walk_in_waitlist" | "mixed",
  details: BookingFlowDetails,
) {
  await assertOwnBusiness(businessId);
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("businesses")
    .update({
      booking_flow_kind: kind,
      booking_flow_completed_at: now,
      booking_flow_details: details as unknown as Record<string, unknown>,
      updated_at: now,
    })
    .eq("id", businessId);

  if (error) {
    throw new Error(error.message);
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/setup/bookings");
  revalidatePath("/dashboard/bookings");
}
