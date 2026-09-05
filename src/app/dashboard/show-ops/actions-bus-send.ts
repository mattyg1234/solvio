"use server";
import { requireShowOpsRole } from "@/lib/show-ops/access";
import { hasShowOpsModule } from "@/lib/show-ops/config";
import { canSeeShowOpsPage } from "@/lib/show-ops/nav";
import { parseBusPdfRequest } from "@/lib/show-ops/bus-pdf";
import { loadBusListPdf } from "@/lib/show-ops/bus-pdf-data";
import { deliverBusList } from "@/lib/show-ops/bus-delivery";
import { filterShowOpsOutboundTo } from "@/lib/show-ops/outbound";
import { sendShowOpsHtmlEmail } from "@/lib/notifications/show-ops-emails";
export async function sendBusListAction(
  form: FormData,
): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireShowOpsRole("office");
    if (
      !canSeeShowOpsPage(ctx.role, ctx.allowedPages, "lists") ||
      !hasShowOpsModule(ctx.config, ctx.tier, "lists")
    )
      throw new Error("Night list access is required.");
    const raw = String(form.get("booking_ids") ?? "[]");
    if (raw.length > 220000)
      throw new Error("Filter this list by island first.");
    const request = parseBusPdfRequest({
      date: String(form.get("date") ?? ""),
      bookingIds: JSON.parse(raw),
    });
    const recipient = String(form.get("recipient") ?? "")
      .trim()
      .toLowerCase();
    await deliverBusList(
      { ...request, recipient },
      {
        allowed: (email) => filterShowOpsOutboundTo(email).length === 1,
        build: () =>
          loadBusListPdf(
            ctx.supabase,
            ctx.business.id,
            ctx.branding.displayName,
            request,
          ),
        send: (attachment) =>
          sendShowOpsHtmlEmail({
            to: recipient,
            subject: `Bus list · ${request.date}`,
            html: "<p>The bus list is attached, including the saved pickup order and guide notes.</p>",
            text: "The bus list is attached, including the saved pickup order and guide notes.",
            attachments: [attachment],
          }),
      },
    );
    return { ok: true, message: "Bus list submitted to the email provider." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Bus list not sent. Please retry.",
    };
  }
}
