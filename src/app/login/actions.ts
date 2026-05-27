"use server";

import { sendPasswordResetEmail } from "@/lib/notifications/auth-emails";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type PasswordResetState = { ok: true } | { ok: false; message: string };

/** Sends a cross-device-safe reset link via Resend (token_hash), not Supabase PKCE mail. */
export async function requestPasswordResetAction(email: string): Promise<PasswordResetState> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    return { ok: false, message: "Enter a valid email address." };
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || (await getSiteUrl())).replace(/\/$/, "");
  const admin = createSupabaseServiceRoleClient();

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: trimmed,
  });

  if (error) {
    // Avoid leaking whether the account exists.
    console.error("[password-reset] generateLink:", error.message);
    return { ok: true };
  }

  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) {
    console.error("[password-reset] missing hashed_token");
    return { ok: true };
  }

  const confirmUrl = `${siteUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
  const sent = await sendPasswordResetEmail({ to: trimmed, confirmUrl });

  if (!sent.ok) {
    return { ok: false, message: sent.message };
  }

  return { ok: true };
}
