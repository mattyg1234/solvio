"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { pickUniqueBookingSlug } from "@/lib/booking-slug-server";
import { isBookingGuestMode, type BookingGuestMode } from "@/lib/booking-guest-modes";
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
  /** Optional staff roster shown on public appointment bookings */
  staff_members?: { id: string; name: string }[];
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
  const { supabase } = await assertOwnBusiness(businessId);
  const { data: biz } = await supabase
    .from("businesses")
    .select("name,booking_slug,booking_flow_details")
    .eq("id", businessId)
    .maybeSingle();

  const prevDetails =
    biz?.booking_flow_details && typeof biz.booking_flow_details === "object" && !Array.isArray(biz.booking_flow_details)
      ? (biz.booking_flow_details as Record<string, unknown>)
      : {};

  const mergedDetails = {
    ...prevDetails,
    ...(details as unknown as Record<string, unknown>),
  };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    booking_flow_kind: kind,
    booking_flow_completed_at: now,
    booking_flow_details: mergedDetails,
    updated_at: now,
  };

  if (!biz?.booking_slug?.trim()) {
    patch.booking_slug = await pickUniqueBookingSlug(supabase, biz?.name ?? "book", businessId);
  }

  const { error } = await supabase.from("businesses").update(patch).eq("id", businessId);

  if (error) {
    throw new Error(error.message);
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/setup/bookings");
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/settings");
}

export async function saveGuestBookingModesAction(
  businessId: string,
  modes: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const cleaned = [...new Set(modes.filter((m): m is BookingGuestMode => typeof m === "string" && isBookingGuestMode(m)))];
  if (!cleaned.length) {
    return { ok: false, message: "Turn on at least one booking option for guests." };
  }

  const { supabase } = await assertOwnBusiness(businessId);
  const { data: biz } = await supabase
    .from("businesses")
    .select("booking_slug,booking_flow_details")
    .eq("id", businessId)
    .maybeSingle();

  const prevDetails =
    biz?.booking_flow_details && typeof biz.booking_flow_details === "object" && !Array.isArray(biz.booking_flow_details)
      ? (biz.booking_flow_details as Record<string, unknown>)
      : {};

  const { error } = await supabase
    .from("businesses")
    .update({
      booking_flow_details: {
        ...prevDetails,
        guest_booking_modes: cleaned,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", businessId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/setup/bookings");
  revalidatePath("/dashboard/settings");
  if (biz?.booking_slug?.trim()) {
    revalidatePath(`/book/${biz.booking_slug.trim()}`);
  }

  return { ok: true };
}
