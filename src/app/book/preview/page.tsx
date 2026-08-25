import type { Metadata } from "next";

import { OutreachBookingPreview } from "./outreach-booking-preview";
import {
  outreachPreviewCopy,
  outreachPreviewLang,
  outreachPreviewMode,
} from "@/lib/outreach-booking-preview-copy";

type PageProps = {
  searchParams?: Promise<{
    lang?: string;
    mode?: string;
    name?: string;
    wa?: string;
    logo?: string;
  }>;
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = searchParams ? await searchParams : {};
  const lang = outreachPreviewLang(sp.lang);
  const mode = outreachPreviewMode(sp.mode);
  const name = sp.name?.trim() || (lang === "es" ? "Tu negocio" : "Your business");
  const copy = outreachPreviewCopy(lang, name, mode);
  return {
    title: copy.pageTitle,
    description: copy.hint,
    robots: { index: false, follow: false },
  };
}

/** Fake Solvio booking UI for outreach demo sites — no DB writes; finish on WhatsApp. */
export default async function OutreachBookingPreviewPage({ searchParams }: PageProps) {
  const sp = searchParams ? await searchParams : {};
  const lang = outreachPreviewLang(sp.lang);
  const mode = outreachPreviewMode(sp.mode);
  const businessName = sp.name?.trim() || (lang === "es" ? "Tu negocio" : "Your business");
  const whatsappDigits = sp.wa?.replace(/\D/g, "") || null;
  const logoUrl = sp.logo?.trim() || null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#f8fafc] via-[#fafbff] to-[#f5f3ff]/40">
      <div className="pointer-events-none absolute -left-32 top-0 h-72 w-72 rounded-full bg-[#ede9fe]/80 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-24 bottom-20 h-80 w-80 rounded-full bg-[#dbeafe]/60 blur-3xl" aria-hidden />
      <div className="relative z-10 flex min-h-screen flex-col items-center px-4 py-8 md:py-12">
        <OutreachBookingPreview
          lang={lang}
          mode={mode}
          businessName={businessName}
          whatsappDigits={whatsappDigits}
          logoUrl={logoUrl}
        />
      </div>
    </div>
  );
}
