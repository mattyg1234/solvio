import { Resend } from "resend";

export type NotificationSendResult =
  | { ok: true; id?: string }
  | { ok: false; reason: "not_configured" | "invalid_recipient" | "provider_error"; message: string };

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
    "Solvio Bookings <hello@solviosystems.com>"
  );
}

async function sendViaResend(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<NotificationSendResult> {
  const client = resendClient();
  const to = args.to.trim();
  if (!client) {
    return { ok: false, reason: "not_configured", message: "SOLVIO_RESEND_API_KEY is not set on this deployment." };
  }
  if (!to || !to.includes("@")) {
    return { ok: false, reason: "invalid_recipient", message: "Guest email address is missing or invalid." };
  }

  const { data, error } = await client.emails.send({
    from: fromAddr(),
    to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  });

  if (error) {
    console.error("[booking-email] Resend error:", error.message);
    return { ok: false, reason: "provider_error", message: error.message };
  }

  return { ok: true, id: data?.id };
}

/** Guest receipt immediately after submitting /book/[slug]. */
export async function sendBookingRequestReceivedEmail(opts: {
  guestEmail: string;
  guestName: string;
  merchantName: string;
  siteUrl: string;
  bookingKind?: string;
  requestedDate?: string;
  preferredTime?: string;
  serviceName?: string;
  staffName?: string;
  guestCount?: string;
  paymentNote?: string;
}): Promise<NotificationSendResult> {
  const kind = opts.bookingKind?.replace(/_/g, " ").trim() || "booking";
  const detailRows = [
    opts.serviceName ? `<tr><td style="padding:4px 8px 4px 0;color:#64748b;font-size:14px">Service</td><td style="padding:4px 0;font-size:14px;font-weight:600">${escapeHtml(opts.serviceName)}</td></tr>` : "",
    opts.requestedDate ? `<tr><td style="padding:4px 8px 4px 0;color:#64748b;font-size:14px">Date</td><td style="padding:4px 0;font-size:14px;font-weight:600">${escapeHtml(opts.requestedDate)}</td></tr>` : "",
    opts.preferredTime ? `<tr><td style="padding:4px 8px 4px 0;color:#64748b;font-size:14px">Time</td><td style="padding:4px 0;font-size:14px;font-weight:600">${escapeHtml(opts.preferredTime)}</td></tr>` : "",
    opts.staffName ? `<tr><td style="padding:4px 8px 4px 0;color:#64748b;font-size:14px">Stylist</td><td style="padding:4px 0;font-size:14px;font-weight:600">${escapeHtml(opts.staffName)}</td></tr>` : "",
    opts.guestCount ? `<tr><td style="padding:4px 8px 4px 0;color:#64748b;font-size:14px">Party</td><td style="padding:4px 0;font-size:14px;font-weight:600">${escapeHtml(opts.guestCount)} guest${opts.guestCount === "1" ? "" : "s"}</td></tr>` : "",
  ]
    .filter(Boolean)
    .join("");

  const paymentBlock = opts.paymentNote
    ? `<p style="margin:16px 0 0;padding:12px 14px;border-radius:12px;background:#f5f3ff;border:1px solid #ddd6fe;font-size:14px;color:#5b21b6">${escapeHtml(opts.paymentNote)}</p>`
    : "";

  return sendViaResend({
    to: opts.guestEmail,
    subject: `${opts.merchantName} · your ${kind} request`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
        <p>Hi ${escapeHtml(opts.guestName)},</p>
        <p>Thanks — <strong>${escapeHtml(opts.merchantName)}</strong> has your <strong>${escapeHtml(kind)}</strong> details.</p>
        ${detailRows ? `<table style="border-collapse:collapse;margin:16px 0 8px;width:100%">${detailRows}</table>` : ""}
        ${paymentBlock}
        <p style="margin-top:20px;font-size:14px;color:#64748b">They'll confirm using the contact details you shared. If you started a Stripe payment, finish that step to secure your slot.</p>
        <p style="margin-top:1.5rem;color:#64748b;font-size:14px;">
          Hosted on Solvio · <a href="${escapeHtml(opts.siteUrl)}">Open site</a>
        </p>
      </div>
    `,
    text: `Hi ${opts.guestName},\n\nThanks — ${opts.merchantName} has your ${kind} request.\n${opts.requestedDate ? `Date: ${opts.requestedDate}\n` : ""}${opts.preferredTime ? `Time: ${opts.preferredTime}\n` : ""}${opts.serviceName ? `Service: ${opts.serviceName}\n` : ""}${opts.paymentNote ? `\n${opts.paymentNote}\n` : ""}\nThey'll confirm soon.\n`,
  });
}

/** When staff confirms from the dashboard. */
export async function sendBookingConfirmedEmail(opts: {
  guestEmail: string;
  guestName: string;
  merchantName: string;
  title: string;
  startsIso: string;
  endsIso: string;
  timeZone: string;
  siteUrl: string;
}): Promise<NotificationSendResult> {
  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: opts.timeZone || "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const startLine = formatter.format(new Date(opts.startsIso));
  const endLine = formatter.format(new Date(opts.endsIso));

  return sendViaResend({
    to: opts.guestEmail,
    subject: `Confirmed · ${opts.merchantName}`,
    html: `
      <p>Hi ${escapeHtml(opts.guestName)},</p>
      <p>You&apos;re confirmed for <strong>${escapeHtml(opts.title)}</strong> at <strong>${escapeHtml(opts.merchantName)}</strong>.</p>
      <p><strong>${escapeHtml(startLine)}</strong> → <strong>${escapeHtml(endLine)}</strong></p>
      <p style="color:#64748b;font-size:14px;margin-top:1rem;">
        (${escapeHtml(opts.timeZone)})
      </p>
      <p style="margin-top:1.5rem;color:#64748b;font-size:14px;">
        Powered by Solvio · <a href="${escapeHtml(opts.siteUrl)}">Home</a>
      </p>
    `,
    text: `Hi ${opts.guestName},\n\nYou're confirmed for "${opts.title}" at ${opts.merchantName}.\n${startLine} → ${endLine}\n`,
  });
}

/** Merchant alert when a new guest booking request arrives via /book/[slug]. */
export async function sendNewBookingNotificationEmail(opts: {
  merchantEmail: string;
  merchantName: string;
  guestName: string;
  guestEmail: string;
  bookingKind: string;
  requestedDate?: string;
  preferredTime?: string;
  guestCount?: string;
  notes?: string;
  dashboardUrl: string;
}): Promise<NotificationSendResult> {
  const kindLabel = opts.bookingKind
    ? opts.bookingKind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Booking";

  const detailRows = [
    opts.requestedDate ? `<tr><td style="padding:4px 0;color:#64748b;font-size:14px;min-width:110px">Date</td><td style="padding:4px 0;font-size:14px;font-weight:600">${escapeHtml(opts.requestedDate)}</td></tr>` : "",
    opts.preferredTime ? `<tr><td style="padding:4px 0;color:#64748b;font-size:14px">Time</td><td style="padding:4px 0;font-size:14px;font-weight:600">${escapeHtml(opts.preferredTime)}</td></tr>` : "",
    opts.guestCount ? `<tr><td style="padding:4px 0;color:#64748b;font-size:14px">Guests</td><td style="padding:4px 0;font-size:14px;font-weight:600">${escapeHtml(opts.guestCount)}</td></tr>` : "",
    opts.guestEmail ? `<tr><td style="padding:4px 0;color:#64748b;font-size:14px">Email</td><td style="padding:4px 0;font-size:14px">${escapeHtml(opts.guestEmail)}</td></tr>` : "",
    opts.notes ? `<tr><td style="padding:4px 0;color:#64748b;font-size:14px;vertical-align:top">Notes</td><td style="padding:4px 0;font-size:14px">${escapeHtml(opts.notes.slice(0, 400))}</td></tr>` : "",
  ].filter(Boolean).join("");

  return sendViaResend({
    to: opts.merchantEmail,
    subject: `New ${kindLabel} request — ${escapeHtml(opts.guestName)}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
        <p style="font-size:15px;color:#0f172a">
          <strong>${escapeHtml(opts.guestName)}</strong> just submitted a
          <strong>${escapeHtml(kindLabel.toLowerCase())}</strong> request via your Solvio booking page.
        </p>
        <table style="border-collapse:collapse;margin:16px 0 24px;width:100%">
          ${detailRows}
        </table>
        <a href="${escapeHtml(opts.dashboardUrl)}/dashboard/bookings"
           style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:11px 24px;border-radius:999px;font-size:14px;font-weight:600">
          Review in dashboard →
        </a>
        <p style="margin-top:28px;color:#94a3b8;font-size:12px">
          Powered by Solvio · <a href="${escapeHtml(opts.dashboardUrl)}" style="color:#94a3b8">Open dashboard</a>
        </p>
      </div>
    `,
    text: `New ${kindLabel} request from ${opts.guestName}\n\nDate: ${opts.requestedDate || "—"}\nTime: ${opts.preferredTime || "—"}\nGuests: ${opts.guestCount || "—"}\nEmail: ${opts.guestEmail}\nNotes: ${opts.notes || "—"}\n\nReview: ${opts.dashboardUrl}/dashboard/bookings`,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
