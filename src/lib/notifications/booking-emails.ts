import { Resend } from "resend";

function resend(): Resend | null {
  const apiKey =
    process.env.SOLVIO_RESEND_API_KEY?.trim() || process.env.RESEND_API_KEY?.trim() || process.env.RESEND_API_TOKEN?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function fromAddr(): string {
  return (
    process.env.SOLVIO_MAIL_FROM?.trim() ||
    process.env.RESEND_MAIL_FROM?.trim() ||
    "Solvio <onboarding@resend.dev>"
  );
}

/** Guest receipt immediately after submitting /book/[slug]. */
export async function sendBookingRequestReceivedEmail(opts: {
  guestEmail: string;
  guestName: string;
  merchantName: string;
  siteUrl: string;
}) {
  const client = resend();
  const to = opts.guestEmail.trim();
  if (!client || !to) return;

  await client.emails.send({
    from: fromAddr(),
    to,
    subject: `${opts.merchantName} · we received your request`,
    html: `
      <p>Hi ${escapeHtml(opts.guestName)},</p>
      <p>Thanks — <strong>${escapeHtml(opts.merchantName)}</strong> has your booking details and will reply soon.</p>
      <p style="margin-top:1.5rem;color:#64748b;font-size:14px;">
        Hosted on Solvio · <a href="${escapeHtml(opts.siteUrl)}">Open site</a>
      </p>
    `,
    text: `Hi ${opts.guestName},\n\nThanks — ${opts.merchantName} has your booking details and will reply soon.\n`,
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
}) {
  const client = resend();
  const to = opts.guestEmail.trim();
  if (!client || !to) return;

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

  await client.emails.send({
    from: fromAddr(),
    to,
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
}) {
  const client = resend();
  const to = opts.merchantEmail.trim();
  if (!client || !to) return;

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

  await client.emails.send({
    from: fromAddr(),
    to,
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
