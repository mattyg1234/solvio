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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
