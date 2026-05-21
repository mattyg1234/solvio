"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  type PhoneCountryCode,
  purchaseInboundNumber,
  releaseInboundNumber,
  SUPPORTED_PHONE_COUNTRIES,
} from "@/lib/vapi-phone-numbers";

const SUPPORTED_CODES = new Set(SUPPORTED_PHONE_COUNTRIES.map((c) => c.code));

function isSupportedCountry(c: string): c is PhoneCountryCode {
  return SUPPORTED_CODES.has(c as PhoneCountryCode);
}

type AuthedBusiness = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  business: {
    id: string;
    name: string;
    vapi_assistant_id: string | null;
    vapi_phone_number_id: string | null;
    phone_number_e164: string | null;
    phone_number_country: string | null;
  };
};

async function loadOwnedBusiness(businessId: string): Promise<
  { ok: true; data: AuthedBusiness } | { ok: false; message: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("businesses")
    .select("id,name,voice_receptionist_details,vapi_phone_number_id,phone_number_e164,phone_number_country")
    .eq("id", businessId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "Business not found." };

  const details = data.voice_receptionist_details as Record<string, unknown> | null;
  const assistantId =
    details && typeof details.vapi_assistant_id === "string" && details.vapi_assistant_id.trim()
      ? details.vapi_assistant_id.trim()
      : null;

  return {
    ok: true,
    data: {
      supabase,
      business: {
        id: data.id as string,
        name: (data.name as string) ?? "",
        vapi_assistant_id: assistantId,
        vapi_phone_number_id: (data.vapi_phone_number_id as string | null) ?? null,
        phone_number_e164: (data.phone_number_e164 as string | null) ?? null,
        phone_number_country: (data.phone_number_country as string | null) ?? null,
      },
    },
  };
}

export type PhoneActionResult =
  | { ok: true; phoneE164: string }
  | { ok: false; message: string };

/** Buy + attach a dedicated inbound number for this business's receptionist. */
export async function purchaseBusinessPhoneNumberAction(input: {
  businessId: string;
  country: string;
}): Promise<PhoneActionResult> {
  const country = input.country.trim().toUpperCase();
  if (!isSupportedCountry(country)) {
    return { ok: false, message: "That country isn't in the list of supported regions yet." };
  }

  const auth = await loadOwnedBusiness(input.businessId);
  if (!auth.ok) return auth;
  const { supabase, business } = auth.data;

  if (business.vapi_phone_number_id && business.phone_number_e164) {
    return {
      ok: false,
      message: `You already have a dedicated number (${business.phone_number_e164}). Release it before buying another.`,
    };
  }

  if (!business.vapi_assistant_id) {
    return {
      ok: false,
      message: "Set up your AI receptionist first — save it once so we know what to attach the number to.",
    };
  }

  const purchase = await purchaseInboundNumber({
    country,
    assistantId: business.vapi_assistant_id,
    name: `${business.name || "Solvio"} receptionist`,
  });
  if (!purchase.ok) return purchase;

  const { record } = purchase;
  const e164 = record.number?.trim() ?? "";

  const { error: updateErr } = await supabase
    .from("businesses")
    .update({
      vapi_phone_number_id: record.id,
      phone_number_e164: e164 || null,
      phone_number_country: country,
      phone_number_provisioned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", business.id);

  if (updateErr) {
    // We have a number on Vapi but couldn't persist locally — release it so we don't bill for a ghost.
    await releaseInboundNumber(record.id).catch(() => {});
    return { ok: false, message: `Couldn't save your number: ${updateErr.message}` };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/phone");
  revalidatePath("/dashboard/setup/voice");
  return { ok: true, phoneE164: e164 || record.id };
}

/** Release the business's dedicated number — frees it on Vapi and stops the monthly carry. */
export async function releaseBusinessPhoneNumberAction(input: {
  businessId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = await loadOwnedBusiness(input.businessId);
  if (!auth.ok) return auth;
  const { supabase, business } = auth.data;

  if (!business.vapi_phone_number_id) {
    return { ok: false, message: "No number to release — you don't have one yet." };
  }

  const release = await releaseInboundNumber(business.vapi_phone_number_id);
  if (!release.ok) return release;

  const { error } = await supabase
    .from("businesses")
    .update({
      vapi_phone_number_id: null,
      phone_number_e164: null,
      phone_number_country: null,
      phone_number_provisioned_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", business.id);

  if (error) return { ok: false, message: `Released on Vapi but couldn't clear locally: ${error.message}` };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/phone");
  revalidatePath("/dashboard/setup/voice");
  return { ok: true };
}
