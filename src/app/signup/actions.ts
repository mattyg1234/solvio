"use server";

import { sendSignupConfirmEmail } from "@/lib/notifications/auth-emails";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type SignUpActionInput = {
  email: string;
  password: string;
  businessName: string;
  websiteUrl?: string;
  logoUrl?: string;
  businessCategory?: string;
};

export type SignUpActionState =
  | { ok: true; needsEmailConfirm: false }
  | { ok: true; needsEmailConfirm: true }
  | { ok: false; message: string };

function buildConfirmUrl(siteUrl: string, tokenHash: string, type: "signup" | "recovery"): string {
  return `${siteUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${type}`;
}

/** Creates the account and sends a cross-device-safe confirm link via Resend. */
export async function signUpAction(input: SignUpActionInput): Promise<SignUpActionState> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const businessName = input.businessName.trim();

  if (!email.includes("@")) {
    return { ok: false, message: "Enter a valid email address." };
  }
  if (password.length < 8) {
    return { ok: false, message: "Use a password with at least 8 characters." };
  }
  if (!businessName) {
    return { ok: false, message: "Enter your business name." };
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || (await getSiteUrl())).replace(/\/$/, "");
  const admin = createSupabaseServiceRoleClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: {
      business_name: businessName,
      ...(input.websiteUrl?.trim() ? { website_url: input.websiteUrl.trim() } : {}),
      ...(input.logoUrl?.trim() ? { logo_url: input.logoUrl.trim() } : {}),
      ...(input.businessCategory?.trim() ? { business_category: input.businessCategory.trim() } : {}),
    },
  });

  if (createErr) {
    const msg = createErr.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return { ok: false, message: "An account with this email already exists — try logging in." };
    }
    return { ok: false, message: createErr.message };
  }

  if (created.user?.email_confirmed_at) {
    return { ok: true, needsEmailConfirm: false };
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
  });

  if (linkErr || !linkData.properties?.hashed_token) {
    console.error("[signup] generateLink:", linkErr?.message ?? "missing token");
    return { ok: false, message: "Account created but we could not send confirmation email — contact support." };
  }

  const sent = await sendSignupConfirmEmail({
    to: email,
    confirmUrl: buildConfirmUrl(siteUrl, linkData.properties.hashed_token, "signup"),
  });

  if (!sent.ok) {
    return { ok: false, message: sent.message };
  }

  return { ok: true, needsEmailConfirm: true };
}
