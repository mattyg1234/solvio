import { Resend } from "resend";

import { formatShowOpsMoney } from "@/lib/show-ops/calc";
import { filterShowOpsOutboundTo, showOpsOutboundHeldResult } from "@/lib/show-ops/outbound";
import type { ShowOpsCurrency } from "@/lib/show-ops/types";

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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function gatedTo(raw: string | string[]): string[] | ReturnType<typeof showOpsOutboundHeldResult> {
  const to = filterShowOpsOutboundTo(raw);
  if (!to.length) return showOpsOutboundHeldResult();
  return to;
}

export async function sendShowOpsPaymentLinkEmail(opts: {
  guestEmail: string;
  guestName: string;
  merchantName: string;
  bookingRef: string;
  showName: string;
  showDate: string;
  amount: number;
  currency: ShowOpsCurrency;
  payUrl: string;
}): Promise<NotificationSendResult> {
  const client = resendClient();
  const gated = gatedTo(opts.guestEmail);
  if (!Array.isArray(gated)) return gated;
  const to = gated[0] ?? "";
  if (!client) {
    return { ok: false, reason: "not_configured", message: "Email is not configured on this deployment." };
  }
  if (!to || !to.includes("@")) {
    return { ok: false, reason: "invalid_recipient", message: "Guest email is missing." };
  }

  const money = formatShowOpsMoney(opts.amount, opts.currency);
  const subject = `Payment for ${opts.showName} · ${opts.bookingRef}`;
  const { data, error } = await client.emails.send({
    from: fromAddr(),
    to,
    subject,
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
        <p style="font-size:16px">Hi ${escapeHtml(opts.guestName.split(" ")[0] || opts.guestName)},</p>
        <p style="font-size:15px;line-height:1.5">
          ${escapeHtml(opts.merchantName)} has sent a secure payment link for
          <strong>${escapeHtml(opts.showName)}</strong> on ${escapeHtml(opts.showDate)}
          (ref ${escapeHtml(opts.bookingRef)}).
        </p>
        <p style="font-size:22px;font-weight:700;margin:20px 0">${escapeHtml(money)} due</p>
        <p>
          <a href="${escapeHtml(opts.payUrl)}"
             style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">
            Pay now
          </a>
        </p>
        <p style="color:#64748b;font-size:13px;margin-top:28px">If the button does not work, copy this link:<br />${escapeHtml(opts.payUrl)}</p>
      </div>
    `,
    text: `Hi ${opts.guestName},\n\n${opts.merchantName} — ${opts.showName} on ${opts.showDate} (${opts.bookingRef}).\nAmount due: ${money}\n\nPay here: ${opts.payUrl}\n`,
  });

  if (error) {
    console.error("[show-ops-email] Resend error:", error.message);
    return { ok: false, reason: "provider_error", message: error.message };
  }
  return { ok: true, id: data?.id };
}

/** The partner's private booking link. No password: the link itself identifies them. */
export async function sendShowOpsPartnerLinkEmail(opts: {
  to: string;
  partnerName: string;
  merchantName: string;
  linkUrl: string;
}): Promise<NotificationSendResult> {
  const client = resendClient();
  const gated = gatedTo(opts.to);
  if (!Array.isArray(gated)) return gated;
  const to = gated[0] ?? "";
  if (!client) {
    return { ok: false, reason: "not_configured", message: "Email is not configured on this deployment." };
  }
  if (!to.includes("@")) {
    return { ok: false, reason: "invalid_recipient", message: "Invalid email address." };
  }
  const subject = `${opts.merchantName} — your booking link for ${opts.partnerName}`;
  const { data, error } = await client.emails.send({
    from: fromAddr(),
    to,
    subject,
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
        <p style="font-size:16px">Hi,</p>
        <p style="font-size:15px;line-height:1.5">
          Here is the private booking link for <strong>${escapeHtml(opts.partnerName)}</strong> with ${escapeHtml(opts.merchantName)}.
          Open it to book guests at your contracted rate and see the bookings you have made. No password needed.
        </p>
        <p style="margin:24px 0">
          <a href="${escapeHtml(opts.linkUrl)}"
             style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">
            Open your booking page
          </a>
        </p>
        <p style="font-size:13px;line-height:1.5;color:#475569">
          Save this email or bookmark the link. It is unique to ${escapeHtml(opts.partnerName)}, so please do not forward it outside your team.
          Link: <a href="${escapeHtml(opts.linkUrl)}" style="color:#7c3aed">${escapeHtml(opts.linkUrl)}</a>
        </p>
      </div>
    `,
    text: `Your private booking link for ${opts.partnerName} with ${opts.merchantName}:\n${opts.linkUrl}\n\nOpen it to book guests at your contracted rate and see your bookings. No password needed. It is unique to you, so do not forward it outside your team.`,
  });
  if (error) {
    console.error("[show-ops-email] partner link:", error.message);
    return { ok: false, reason: "provider_error", message: error.message };
  }
  return { ok: true, id: data?.id };
}

export async function sendShowOpsSellerInviteEmail(opts: {
  to: string;
  sellerName: string;
  merchantName: string;
  loginUrl: string;
  email: string;
  invitedBy?: string | null;
}): Promise<NotificationSendResult> {
  const client = resendClient();
  const gated = gatedTo(opts.to);
  if (!Array.isArray(gated)) return gated;
  const to = gated[0] ?? "";
  if (!client) {
    return { ok: false, reason: "not_configured", message: "Email is not configured on this deployment." };
  }
  if (!to.includes("@")) {
    return { ok: false, reason: "invalid_recipient", message: "Invalid email address." };
  }

  const who = opts.invitedBy?.trim()
    ? `${opts.invitedBy.trim()} at ${opts.sellerName}`
    : opts.merchantName;
  const subject = `${opts.merchantName} — your booking login`;
  const { data, error } = await client.emails.send({
    from: fromAddr(),
    to,
    subject,
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
        <p style="font-size:16px">Hi,</p>
        <p style="font-size:15px;line-height:1.5">
          ${escapeHtml(who)} has given you a seller page for ${escapeHtml(opts.sellerName)} to make bookings with
          ${escapeHtml(opts.merchantName)} at your contracted rate.
        </p>
        <p style="font-size:15px;line-height:1.5">Use the secure one-time link below to sign in as ${escapeHtml(opts.email)}. You can then set a password if you wish. Existing account passwords remain unchanged.</p>
        <p style="margin:24px 0">
          <a href="${escapeHtml(opts.loginUrl)}"
             style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">
            Sign in to your booking page
          </a>
        </p>
      </div>
    `,
    text: `${who} invited you to the seller page for ${opts.sellerName}.\nSign in as ${opts.email} with this secure one-time link: ${opts.loginUrl}\nYou can then set a password if you wish. Existing account passwords remain unchanged.\nIf the link expires, ask your administrator to resend the invitation.`,
  });

  if (error) {
    console.error("[show-ops-email] seller invite:", error.message);
    return { ok: false, reason: "provider_error", message: error.message };
  }
  return { ok: true, id: data?.id };
}

export async function sendShowOpsInvoiceEmail(opts: {
  to: string;
  cc?: string | null;
  replyTo?: string | null;
  merchantName: string;
  supplierName: string;
  verifactuNumber: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string | null;
  totalAmount: number;
  currency: ShowOpsCurrency;
  paid: boolean;
  invoiceAttachment: { filename: string; content: string };
  ticketAttachments?: Array<{ filename: string; content: string }>;
  lines: Array<{
    showDate: string;
    guestName: string;
    bookingRef: string;
    ticketNumber: string | null;
    adultNett: number;
    childNett: number;
    lineTotal: number;
  }>;
}): Promise<NotificationSendResult> {
  const client = resendClient();
  const gated = gatedTo(opts.to);
  if (!Array.isArray(gated)) return gated;
  const to = gated[0] ?? "";
  if (!client) {
    return { ok: false, reason: "not_configured", message: "Email is not configured on this deployment." };
  }
  if (!to.includes("@")) {
    return { ok: false, reason: "invalid_recipient", message: "Supplier email is missing or invalid." };
  }

  const money = (n: number) => formatShowOpsMoney(n, opts.currency);
  const subject = `Invoice ${opts.verifactuNumber} · ${opts.supplierName} · ${money(opts.totalAmount)}`;
  const status = opts.paid ? "PAID" : "UNPAID";
  const lineRows = opts.lines
    .map(
      (l) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${escapeHtml(l.showDate)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${escapeHtml(l.guestName)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-family:ui-monospace,monospace;font-size:12px">${escapeHtml(l.bookingRef)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${escapeHtml(l.ticketNumber || "—")}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${escapeHtml(money(l.adultNett))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${escapeHtml(money(l.childNett))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">${escapeHtml(money(l.lineTotal))}</td>
      </tr>`,
    )
    .join("");

  const textLines = opts.lines
    .map(
      (l) =>
        `${l.showDate}  ${l.guestName}  ${l.bookingRef}  ${l.ticketNumber || "—"}  ${money(l.lineTotal)}`,
    )
    .join("\n");
  const cc = filterShowOpsOutboundTo(opts.cc || "").filter((address) => address !== to);

  const { data, error } = await client.emails.send({
    from: fromAddr(),
    to,
    cc: cc.length ? cc : undefined,
    replyTo: opts.replyTo && opts.replyTo.includes("@") ? opts.replyTo : undefined,
    subject,
    attachments: [opts.invoiceAttachment, ...(opts.ticketAttachments || [])],
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:720px;margin:0 auto;color:#0f172a">
        <p style="font-size:16px">Hello ${escapeHtml(opts.supplierName)},</p>
        <p style="font-size:15px;line-height:1.5">
          Please find invoice <strong>${escapeHtml(opts.verifactuNumber)}</strong> from
          ${escapeHtml(opts.merchantName)} for ${escapeHtml(opts.periodStart)} to ${escapeHtml(opts.periodEnd)}. The invoice PDF is attached${opts.ticketAttachments?.length ? ` with ${opts.ticketAttachments.length} ticket photo(s)` : ""}.
        </p>
        <p style="font-size:13px;color:#64748b;margin:16px 0 8px">
          Invoice date ${escapeHtml(opts.invoiceDate)}
          ${opts.dueDate ? ` · due ${escapeHtml(opts.dueDate)}` : ""}
          · ${status}
        </p>
        <p style="font-size:28px;font-weight:700;letter-spacing:0.02em;margin:8px 0 20px">${escapeHtml(opts.verifactuNumber)}</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="text-align:left;color:#64748b;font-size:11px;text-transform:uppercase">
              <th style="padding:6px 8px;border-bottom:2px solid #cbd5e1">Date</th>
              <th style="padding:6px 8px;border-bottom:2px solid #cbd5e1">Description</th>
              <th style="padding:6px 8px;border-bottom:2px solid #cbd5e1">Ref</th>
              <th style="padding:6px 8px;border-bottom:2px solid #cbd5e1">Ticket</th>
              <th style="padding:6px 8px;border-bottom:2px solid #cbd5e1;text-align:right">Adult nett</th>
              <th style="padding:6px 8px;border-bottom:2px solid #cbd5e1;text-align:right">Child nett</th>
              <th style="padding:6px 8px;border-bottom:2px solid #cbd5e1;text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>${lineRows}</tbody>
        </table>
        <p style="text-align:right;font-size:18px;font-weight:700;margin:20px 0">${escapeHtml(money(opts.totalAmount))}</p>
        <p style="color:#64748b;font-size:13px;margin-top:28px">
          This is a Verifactu invoice from ${escapeHtml(opts.merchantName)}. Please settle by the due date and quote ${escapeHtml(opts.verifactuNumber)} on payment.
        </p>
      </div>
    `,
    text: `${opts.merchantName} invoice ${opts.verifactuNumber} for ${opts.supplierName}\nPeriod ${opts.periodStart} to ${opts.periodEnd}\nDue ${opts.dueDate || "—"}\n${status}\nTotal ${money(opts.totalAmount)}\n\n${textLines}\n`,
  });

  if (error) {
    console.error("[show-ops-email] invoice:", error.message);
    return { ok: false, reason: "provider_error", message: error.message };
  }
  return { ok: true, id: data?.id };
}

export async function sendShowOpsHtmlEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: string }[];
}): Promise<NotificationSendResult> {
  const client = resendClient();
  const gated = gatedTo(opts.to);
  if (!Array.isArray(gated)) return gated;
  const to = gated;
  if (!client) {
    return { ok: false, reason: "not_configured", message: "Email is not configured on this deployment." };
  }
  if (!to.length) {
    return { ok: false, reason: "invalid_recipient", message: "No valid email addresses." };
  }
  const { data, error } = await client.emails.send({
    from: fromAddr(),
    to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments: opts.attachments,
  });
  if (error) {
    console.error("[show-ops-email] html:", error.message);
    return { ok: false, reason: "provider_error", message: error.message };
  }
  return { ok: true, id: data?.id };
}
