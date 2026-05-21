"use server";

import { redirect } from "next/navigation";

import { isSolvioAdminEmail } from "@/lib/solvio-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  hasTwilioCredentials,
  purchaseTwilioNumber,
  searchAvailableNumbers,
  type TwilioAvailableNumber,
  type TwilioCountryCode,
  type TwilioOwnedNumber,
} from "@/lib/twilio-phone-numbers";

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isSolvioAdminEmail(user.email ?? null)) {
    redirect("/dashboard");
  }
}

export type TwilioSearchResult =
  | { ok: true; configured: true; numbers: TwilioAvailableNumber[] }
  | { ok: false; configured: false }
  | { ok: false; configured: true; message: string };

export async function searchTwilioNumbersAction(input: {
  country: string;
  areaCode?: string;
}): Promise<TwilioSearchResult> {
  await requireAdmin();
  if (!hasTwilioCredentials()) return { ok: false, configured: false };

  const country = input.country.trim().toUpperCase();
  const res = await searchAvailableNumbers({
    country: country as TwilioCountryCode,
    areaCode: input.areaCode?.trim() || undefined,
  });
  if (!res.ok) return { ok: false, configured: true, message: res.message };
  return { ok: true, configured: true, numbers: res.numbers };
}

export type TwilioBuyResult =
  | { ok: true; number: TwilioOwnedNumber }
  | { ok: false; message: string };

export async function buyTwilioNumberAction(input: {
  phoneNumber: string;
  friendlyName?: string;
}): Promise<TwilioBuyResult> {
  await requireAdmin();
  if (!hasTwilioCredentials()) {
    return { ok: false, message: "Set SOLVIO_TWILIO_ACCOUNT_SID + SOLVIO_TWILIO_AUTH_TOKEN on Vercel first." };
  }

  return purchaseTwilioNumber({
    phoneNumber: input.phoneNumber,
    friendlyName: input.friendlyName,
  });
}
