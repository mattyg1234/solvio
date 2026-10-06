import { ArrowRight, ArrowUpRight, Bus, KeyRound, Mail, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { MarketingLocale } from "@/lib/marketing-locale";

/**
 * The client portal: every hub Solvio Systems runs, each with its own sign in.
 * A new custom hub is one more entry in HUBS.
 */

const CONTACT = "matty@solviosystems.com";

type Hub = {
  key: string;
  name: string;
  /** Who it is for, in each language. */
  who: { en: string; es: string };
  /** Where its sign in lives. A relative href is this app; an absolute one is another. */
  href: string;
  external: boolean;
};

const HUBS: Hub[] = [
  {
    key: "show-ops",
    name: "Show Ops hub",
    who: { en: "Tour and show operators: bookings, partners, buses, night lists and invoicing.", es: "Operadores de tours y espectáculos: reservas, partners, autobuses, listas y facturación." },
    href: "/login",
    external: false,
  },
  {
    key: "connect",
    name: "Solvio Connect",
    who: { en: "Self-serve bookings, gigs and Verifactu invoices through Holded.", es: "Reservas, actuaciones y facturas Verifactu con Holded, en autoservicio." },
    href: "https://connect.solviosystems.com/login",
    external: true,
  },
];

const HUB_ICONS: Record<string, typeof Bus> = { "show-ops": Bus, connect: Sparkles };

const COPY = {
  en: {
    title: "Client portal",
    lead: "Every hub we run has its own sign in. Pick yours.",
    signIn: "Sign in",
    missingTitle: "Can't see your hub?",
    missingText: "If we built your system and it isn't listed yet, email us and we'll send you the link.",
    back: "Back to Solvio Systems",
  },
  es: {
    title: "Portal de clientes",
    lead: "Cada hub que gestionamos tiene su propio acceso. Elige el tuyo.",
    signIn: "Entrar",
    missingTitle: "¿No ves tu hub?",
    missingText: "Si construimos tu sistema y aún no aparece, escríbenos y te enviamos el enlace.",
    back: "Volver a Solvio Systems",
  },
} as const;

export function ClientPortal({ locale }: { locale: MarketingLocale }) {
  const c = locale === "es" ? COPY.es : COPY.en;
  const home = locale === "es" ? "/es" : "/";
  return (
    <div lang={locale} className="min-h-dvh bg-[#faf9ff] text-[#0f172a]">
      <header className="border-b border-[#f1eefb]/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href={home} className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]">
            <span className="block size-8 overflow-hidden rounded-xl shadow-sm shadow-[#7c3aed]/25">
              <Image src="/brand/icon-192.png" alt="" width={64} height={64} className="h-full w-full" priority />
            </span>
            <span className="text-base font-semibold tracking-tight whitespace-nowrap sm:text-lg">Solvio Systems</span>
          </Link>
          <Link href={home} className="text-sm font-semibold text-[#5b21b6] hover:underline">
            {c.back}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e9e3fb] bg-white px-3 py-1 text-xs font-semibold text-[#6d28d9]">
          <KeyRound className="size-3.5" aria-hidden /> {c.title}
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{c.title}</h1>
        <p className="mt-2 text-lg text-[#475569]">{c.lead}</p>

        <ul className="mt-10 grid gap-5 sm:grid-cols-2">
          {HUBS.map((h) => {
            const Icon = HUB_ICONS[h.key] ?? Sparkles;
            const inner = (
              <>
                <span className="inline-flex w-fit rounded-2xl bg-[#f5f3ff] p-3 text-[#7c3aed]">
                  <Icon className="size-6" aria-hidden />
                </span>
                <h2 className="mt-5 text-xl font-semibold tracking-tight">{h.name}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-[#475569]">{h.who[locale === "es" ? "es" : "en"]}</p>
                <span className="mt-6 inline-flex h-11 w-fit items-center gap-2 rounded-xl bg-[#7c3aed] px-5 text-sm font-semibold text-white shadow-sm shadow-[#7c3aed]/30 transition-colors group-hover:bg-[#6d28d9]">
                  {c.signIn} {h.external ? <ArrowUpRight className="size-4" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
                </span>
              </>
            );
            const cls = "group flex h-full flex-col rounded-3xl border border-[#ebe7f7] bg-white p-7 transition-shadow duration-200 hover:shadow-xl hover:shadow-[#7c3aed]/10";
            return (
              <li key={h.key}>
                {h.external ? (
                  <a href={h.href} className={cls}>
                    {inner}
                  </a>
                ) : (
                  <Link href={h.href} className={cls}>
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>

        <section className="mt-12 flex flex-col items-start gap-4 rounded-3xl border border-[#ebe7f7] bg-white p-7 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{c.missingTitle}</h2>
            <p className="mt-1 text-sm text-[#475569]">{c.missingText}</p>
          </div>
          <a
            href={`mailto:${CONTACT}`}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-[#e2dcf7] px-5 text-sm font-semibold text-[#0f172a] transition-colors hover:bg-[#faf9ff]"
          >
            <Mail className="size-4 text-[#7c3aed]" aria-hidden /> {CONTACT}
          </a>
        </section>
      </main>
    </div>
  );
}
