/**
 * Solvio hospitality outreach — Nova demo sites + fake booking preview (no DB).
 * See docs/solvio-outreach-gtm.md
 */

import {
  outreachPreviewLang,
  outreachPreviewMode,
  outreachPreviewWhatsAppFinishMessage,
  type OutreachPreviewLang,
  type OutreachPreviewMode,
} from "@/lib/outreach-booking-preview-copy";

const DEFAULT_SITE = "https://www.solviosystems.com";

import { isLikelyWhatsAppE164 } from "@/lib/whatsapp-phone";

export { isLikelyWhatsAppE164 };

export function outreachSiteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE).replace(/\/$/, "");
}

/** Campaign id for UTM (URL-safe from business name). */
export function outreachCampaignId(businessName: string): string {
  const base = businessName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "outreach-demo";
}

/** @deprecated Use outreachBookingEmbedSrc — no per-lead Supabase rows. */
export function outreachBookingSlug(businessName: string): string {
  return `outreach-${outreachCampaignId(businessName)}`;
}

export type OutreachBookingEmbedOpts = {
  businessName: string;
  /** `es` for Spanish demo sites, `en` for UK/English sites. */
  lang: OutreachPreviewLang;
  /** `table` for restaurants (default). `appointment` for barber/salon demos only. */
  mode?: OutreachPreviewMode;
  /** WhatsApp digits (E.164 without +) — success screen opens wa.me to finish setup. */
  whatsapp?: string;
  logoUrl?: string;
};

/** iframe src: fake booking UI that matches Solvio /book (no real reservations). */
export function outreachBookingEmbedSrc(opts: OutreachBookingEmbedOpts): string {
  const mode = opts.mode ?? "table";
  const params = new URLSearchParams({
    lang: opts.lang,
    mode,
    name: opts.businessName,
  });
  const wa = opts.whatsapp?.replace(/\D/g, "");
  if (wa && isLikelyWhatsAppE164(wa)) params.set("wa", wa);
  if (opts.logoUrl?.trim()) params.set("logo", opts.logoUrl.trim());
  return `${outreachSiteOrigin()}/book/preview?${params.toString()}`;
}

/** Parse mode from an existing preview iframe URL (for docs/tests). */
export function outreachPreviewModeFromUrl(url: string): OutreachPreviewMode {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return outreachPreviewMode(u.searchParams.get("mode") ?? undefined);
  } catch {
    return "table";
  }
}

/** @deprecated */
export function outreachBookingHref(slug: string): string {
  return `${outreachSiteOrigin()}/book/${encodeURIComponent(slug)}`;
}

/** Login CTA after they want to buy — not linked from fake booking success (use WhatsApp first). */
export function outreachActivateHref(campaignId: string): string {
  const params = new URLSearchParams({
    utm_source: "outreach",
    utm_medium: "demo_site",
    utm_campaign: campaignId,
  });
  return `${outreachSiteOrigin()}/login?${params.toString()}`;
}

export function whatsAppHref(phoneOrWaLink: string, message: string): string {
  const trimmed = phoneOrWaLink.trim();
  if (trimmed.includes("wa.me/")) {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    url.searchParams.set("text", message);
    return url.toString();
  }
  const digits = trimmed.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** WhatsApp pitch — demo site + try the booking preview, close on WhatsApp. */
export function outreachWhatsAppPitch(opts: {
  businessName: string;
  demoSiteUrl: string;
  lang?: OutreachPreviewLang;
  mode?: OutreachPreviewMode;
  whatsappDigits?: string;
  senderName?: string;
}): string {
  const who = opts.senderName?.trim() || "Matty";
  const lang = opts.lang ?? "en";
  const appointment = (opts.mode ?? "table") === "appointment";
  if (lang === "es") {
    return (
      `Hola — ${who} de Solvio. Hemos preparado una vista previa gratis para ${opts.businessName}: ` +
      `${opts.demoSiteUrl}\n\n` +
      `Baja a *Reservar mesa* y prueba la reserva de mesa (demo en tu móvil). Si quieres activarla: 100 € setup + 50 €/mes — ` +
      `respóndeme por WhatsApp y lo dejamos listo.\n\n` +
      `Sin compromiso.`
    );
  }
  const bookSection = appointment ? "*Book online*" : "*Reserve a table*";
  const flowLine = appointment
    ? "try the booking flow — pick a package, date and time (demo on your phone)"
    : "try the table booking flow on your phone (demo — looks like the real thing)";
  return (
    `Hi — ${who} from Solvio. We built a free preview for ${opts.businessName}: ` +
    `${opts.demoSiteUrl}\n\n` +
    `Scroll to ${bookSection} and ${flowLine}. ` +
    `To go live: £100 setup + £50/month — reply here on WhatsApp and we'll finish setup.\n\n` +
    `No obligation.`
  );
}

export function outreachPreviewFinishWhatsAppMessage(
  businessName: string,
  lang?: string,
  mode?: string,
): string {
  return outreachPreviewWhatsAppFinishMessage(
    outreachPreviewLang(lang),
    businessName,
    outreachPreviewMode(mode),
  );
}
