"use server";

import { uploadBusinessLogo, validateLogoFile } from "@/lib/business-logo";
import { sendSignupConfirmEmail } from "@/lib/notifications/auth-emails";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type SignUpActionState =
  | { ok: true; needsEmailConfirm: false }
  | { ok: true; needsEmailConfirm: true }
  | { ok: false; message: string };

function buildConfirmUrl(siteUrl: string, tokenHash: string, type: "signup" | "recovery"): string {
  return `${siteUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${type}`;
}

/**
 * Creates the account and sends a cross-device-safe confirm link via Resend.
 * Takes FormData because the logo is a required file: it is stored in the
 * business-logos bucket and printed on every invoice the business sends.
 */
export async function signUpAction(formData: FormData): Promise<SignUpActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const businessName = String(formData.get("business_name") ?? "").trim();
  const merchantPhone = String(formData.get("merchant_phone") ?? "").trim();
  const businessCategory = String(formData.get("business_category") ?? "").trim();

  if (!email.includes("@")) {
    return { ok: false, message: "Enter a valid email address." };
  }
  if (password.length < 8) {
    return { ok: false, message: "Use a password with at least 8 characters." };
  }
  if (!businessName) {
    return { ok: false, message: "Enter your business name." };
  }
  if (!merchantPhone.startsWith("+") || merchantPhone.length < 10) {
    return { ok: false, message: "Enter a valid mobile number for booking alerts." };
  }

  // Validate the logo before touching auth so a bad file never leaves a half-made account.
  let logo;
  try {
    logo = await validateLogoFile(formData.get("logo"));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Upload your logo as a PNG or JPEG." };
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || (await getSiteUrl())).replace(/\/$/, "");
  const admin = createSupabaseServiceRoleClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: {
      business_name: businessName,
      merchant_phone: merchantPhone,
      ...(businessCategory ? { business_category: businessCategory } : {}),
    },
  });

  if (createErr) {
    const msg = createErr.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return { ok: false, message: "An account with this email already exists — try logging in." };
    }
    return { ok: false, message: createErr.message };
  }

  // The auth trigger created the business row; attach the logo to it now.
  if (created.user?.id) {
    const { data: business } = await admin
      .from("businesses")
      .select("id")
      .eq("owner_id", created.user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (business?.id) {
      try {
        const { publicUrl } = await uploadBusinessLogo(admin.storage, business.id, logo);
        const { error: logoErr } = await admin
          .from("businesses")
          .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
          .eq("id", business.id);
        if (logoErr) console.error("[signup] logo_url update:", logoErr.message);
      } catch (error) {
        // The account exists and works; the logo can be re-added under Settings.
        console.error("[signup] logo upload:", error instanceof Error ? error.message : error);
      }
    } else {
      console.error("[signup] no business row for new user", created.user.id);
    }
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
