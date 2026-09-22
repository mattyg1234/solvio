"use server";
import { requireShowOpsRole } from "@/lib/show-ops/access";
import { hasShowOpsModule } from "@/lib/show-ops/config";
import { canSeeShowOpsPage } from "@/lib/show-ops/nav";
import { sendShowOpsHtmlEmail } from "@/lib/notifications/show-ops-emails";
import { loadNightListPdf, parseNightListPdfRequest } from "@/lib/show-ops/night-list-pdf-data";
import { filterShowOpsOutboundTo } from "@/lib/show-ops/outbound";

/** Joel (17 Sept): the special meals list goes to the chefs. One email, the PDF attached, the diets in the body too. */
export async function sendMealsListAction(form: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireShowOpsRole("office");
    if (!canSeeShowOpsPage(ctx.role, ctx.allowedPages, "lists") || !hasShowOpsModule(ctx.config, ctx.tier, "lists")) {
      throw new Error("Night list access is required.");
    }
    const raw = String(form.get("booking_ids") ?? "[]");
    if (raw.length > 260000) throw new Error("Filter this list by island first.");
    const req = parseNightListPdfRequest({
      date: String(form.get("date") ?? ""),
      view: "meals",
      island: String(form.get("island") ?? ""),
      showName: String(form.get("show_name") ?? ""),
      bookingIds: JSON.parse(raw),
    });
    if (!req.bookingIds.length) throw new Error("There are no special meals on this list to send.");
    const recipients = String(form.get("recipients") ?? "")
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (!recipients.length || recipients.some((r) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r))) throw new Error("Enter one or more valid email addresses.");
    if (filterShowOpsOutboundTo(recipients).length !== recipients.length) throw new Error("Not sent: email is in test mode for one of those addresses.");
    const { data: me } = await ctx.supabase.from("profiles").select("full_name,email").eq("id", ctx.user.id).maybeSingle();
    const printedBy = (me?.full_name && String(me.full_name).trim()) || String(me?.email ?? ctx.user.email ?? "office").split("@")[0];
    const bytes = await loadNightListPdf(
      ctx.supabase,
      { businessId: ctx.business.id, businessName: ctx.branding.displayName, config: ctx.config, printedBy },
      req,
    );
    const label = `${req.date}${req.island ? ` · ${req.island}` : ""}${req.showName ? ` · ${req.showName}` : ""}`;
    const result = await sendShowOpsHtmlEmail({
      to: recipients,
      subject: `Special meals · ${label}`,
      html: `<p>Special meals for <strong>${label}</strong> are attached (${req.bookingIds.length} booking${req.bookingIds.length === 1 ? "" : "s"}). Every dietary requirement is written out in full on the sheet.</p>`,
      text: `Special meals for ${label} are attached (${req.bookingIds.length} bookings). Every dietary requirement is written out in full on the sheet.`,
      attachments: [{ filename: `special-meals-${req.date}.pdf`, content: Buffer.from(bytes).toString("base64") }],
    });
    if (!result.ok) throw new Error(`Not sent: ${result.message || "email delivery failed."}`);
    return { ok: true, message: `Special meals list sent to ${recipients.join(", ")}.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Not sent. Please retry." };
  }
}
