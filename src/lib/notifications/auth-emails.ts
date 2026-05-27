import { Resend } from "resend";

import type { NotificationSendResult } from "@/lib/notifications/booking-emails";

function resendClient(): Resend | null {
  const apiKey =
    process.env.SOLVIO_RESEND_API_KEY?.trim() || process.env.RESEND_API_KEY?.trim() || process.env.RESEND_API_TOKEN?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function fromAddr(): string {
  return (
    process.env.SOLVIO_MAIL_FROM?.trim() ||
    process.env.RESEND_MAIL_FROM?.trim() ||
    "Solvio <hello@solviosystems.com>"
  );
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  confirmUrl: string;
}): Promise<NotificationSendResult> {
  const client = resendClient();
  const to = opts.to.trim();
  if (!client) {
    return { ok: false, reason: "not_configured", message: "Email is not configured on this deployment." };
  }
  if (!to.includes("@")) {
    return { ok: false, reason: "invalid_recipient", message: "Invalid email address." };
  }

  const subject = "Reset your Solvio password";
  const text = `Choose a new password for your Solvio account:\n\n${opts.confirmUrl}\n\nIf you didn't request this, you can ignore this email.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
      <p style="font-size:16px;line-height:1.5">Choose a new password for your Solvio account:</p>
      <p style="margin:24px 0">
        <a href="${opts.confirmUrl}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:999px">Reset password</a>
      </p>
      <p style="font-size:13px;color:#64748b;line-height:1.5">Or copy this link:<br><span style="word-break:break-all">${opts.confirmUrl}</span></p>
      <p style="font-size:13px;color:#94a3b8;margin-top:24px">If you didn't request this, ignore this email.</p>
    </div>`;

  const { data, error } = await client.emails.send({ from: fromAddr(), to, subject, html, text });
  if (error) {
    console.error("[auth-email] password reset:", error.message);
    return { ok: false, reason: "provider_error", message: error.message };
  }
  return { ok: true, id: data?.id };
}

export async function sendSignupConfirmEmail(opts: {
  to: string;
  confirmUrl: string;
}): Promise<NotificationSendResult> {
  const client = resendClient();
  const to = opts.to.trim();
  if (!client) {
    return { ok: false, reason: "not_configured", message: "Email is not configured on this deployment." };
  }
  if (!to.includes("@")) {
    return { ok: false, reason: "invalid_recipient", message: "Invalid email address." };
  }

  const subject = "Confirm your Solvio account";
  const text = `Confirm your email to finish setting up Solvio:\n\n${opts.confirmUrl}\n\nIf you didn't sign up, ignore this email.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
      <p style="font-size:16px;line-height:1.5">Confirm your email to finish setting up Solvio:</p>
      <p style="margin:24px 0">
        <a href="${opts.confirmUrl}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:999px">Confirm email</a>
      </p>
      <p style="font-size:13px;color:#64748b;line-height:1.5">Or copy this link:<br><span style="word-break:break-all">${opts.confirmUrl}</span></p>
    </div>`;

  const { data, error } = await client.emails.send({ from: fromAddr(), to, subject, html, text });
  if (error) {
    console.error("[auth-email] signup confirm:", error.message);
    return { ok: false, reason: "provider_error", message: error.message };
  }
  return { ok: true, id: data?.id };
}
