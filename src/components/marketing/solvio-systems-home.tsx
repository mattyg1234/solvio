import { ArrowRight, ArrowUpRight, Bus, Check, FileCheck2, Mail, Martini, MicVocal, Receipt, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { MarketingLocale } from "@/lib/marketing-locale";

/**
 * The solviosystems.com front page: the company and its products. Solvio Connect
 * lives on its own subdomain; Show Ops (operators' hub) signs in here at /login.
 */

const CONNECT_URL = "https://connect.solviosystems.com";
const TIPSI_URL = "https://tipsi-app.com";
const CONTACT = "matty@solviosystems.com";

const COPY = {
  en: {
    nav: { connect: "Solvio Connect", signIn: "Show Ops sign in", language: "Language" },
    badge: "Works with Holded · Verifactu-ready · Made in Tenerife",
    title: "Software that runs small businesses in the Canary Islands.",
    lead: "Bookings, gigs, staff and partners in one place, with every legal invoice issued through Holded under Verifactu. For musicians, tour and show companies, bars and freelancers.",
    openConnect: "Open Solvio Connect",
    signInOps: "Sign in to Show Ops",
    productsTitle: "Our products",
    products: [
      {
        name: "Solvio Connect",
        tag: "For freelancers and small businesses",
        text: "Set up in a few questions. Bookings and gigs turn into Verifactu invoices through Holded, with IGIC, IRPF and tax figures handled.",
        points: ["Gig calendar and artist booking pages", "Booking emails, partners and staff sheets", "Tax figures and exports for your gestor"],
        cta: "Open Solvio Connect",
        href: CONNECT_URL,
        external: true,
      },
      {
        name: "Solvio Show Ops",
        tag: "For tour and show operators",
        text: "A custom operations hub for operators running shows and trips every night: bookings, partners, buses, night lists and partner invoicing.",
        points: ["Partner rate cards and commissions", "Night lists, buses and door check-in", "Partner invoices issued through Holded"],
        cta: "Sign in",
        href: "/login",
        external: false,
      },
      {
        name: "Tipsi",
        tag: "For bars and venues",
        text: "QR ordering, table bookings and send-a-drink for bars, with orders printed at the bar and paid by card.",
        points: ["QR menus and table ordering", "Table bookings", "Send a drink to another table"],
        cta: "Visit Tipsi",
        href: TIPSI_URL,
        external: true,
      },
    ],
    trades: ["Musicians and artists", "Tour and show companies", "Bars and venues", "Freelancers and services"],
    holdedTitle: "Holded keeps the accounts. Your gestor does the tax. Solvio runs the business.",
    holdedText:
      "Every legal invoice is issued by Holded. Solvio fills it in from the work you've already done, so nothing is typed twice, and the Canary taxes (IGIC and its small-business exemption, IRPF) are applied for you.",
    contactTitle: "Talk to us",
    contactText: "Operators, gestorías and partners: tell us what you run and we'll show you around.",
    footer: { privacy: "Privacy", terms: "Terms", signIn: "Sign in" },
  },
  es: {
    nav: { connect: "Solvio Connect", signIn: "Acceso Show Ops", language: "Idioma" },
    badge: "Funciona con Holded · Preparado para Verifactu · Hecho en Tenerife",
    title: "Software que gestiona pequeños negocios en Canarias.",
    lead: "Reservas, actuaciones, personal y partners en un solo lugar, con cada factura legal emitida a través de Holded con Verifactu. Para músicos, empresas de tours y espectáculos, bares y autónomos.",
    openConnect: "Abrir Solvio Connect",
    signInOps: "Entrar en Show Ops",
    productsTitle: "Nuestros productos",
    products: [
      {
        name: "Solvio Connect",
        tag: "Para autónomos y pequeños negocios",
        text: "Se configura en unas pocas preguntas. Las reservas y actuaciones se convierten en facturas Verifactu a través de Holded, con IGIC, IRPF e impuestos resueltos.",
        points: ["Calendario de actuaciones y páginas de reserva para artistas", "Emails de reservas, partners y hojas de personal", "Cifras de impuestos y exportaciones para tu gestor"],
        cta: "Abrir Solvio Connect",
        href: CONNECT_URL,
        external: true,
      },
      {
        name: "Solvio Show Ops",
        tag: "Para operadores de tours y espectáculos",
        text: "Un centro de operaciones a medida para operadores con espectáculos y excursiones cada noche: reservas, partners, autobuses, listas y facturación a partners.",
        points: ["Tarifas y comisiones de partners", "Listas, autobuses y control de acceso", "Facturas a partners emitidas con Holded"],
        cta: "Entrar",
        href: "/login",
        external: false,
      },
      {
        name: "Tipsi",
        tag: "Para bares y locales",
        text: "Pedidos por QR, reservas de mesa y envío de copas entre mesas, con los pedidos impresos en la barra y pagados con tarjeta.",
        points: ["Menús QR y pedidos en mesa", "Reservas de mesa", "Invita a una copa a otra mesa"],
        cta: "Ver Tipsi",
        href: TIPSI_URL,
        external: true,
      },
    ],
    trades: ["Músicos y artistas", "Tours y espectáculos", "Bares y locales", "Autónomos y servicios"],
    holdedTitle: "Holded lleva la contabilidad. Tu gestor, los impuestos. Solvio, el negocio.",
    holdedText:
      "Cada factura legal la emite Holded. Solvio la rellena con el trabajo que ya has hecho, sin teclear nada dos veces, y aplica los impuestos canarios (IGIC y su exención para pequeños empresarios, IRPF) por ti.",
    contactTitle: "Habla con nosotros",
    contactText: "Operadores, gestorías y partners: cuéntanos qué gestionas y te lo enseñamos.",
    footer: { privacy: "Privacidad", terms: "Condiciones", signIn: "Entrar" },
  },
} as const;

const PRODUCT_ICONS = [Sparkles, Bus, Martini] as const;

/** The page in each language: English at /, Spanish at /es. */
const LANGUAGES = [
  { locale: "en", short: "EN", name: "English", href: "/" },
  { locale: "es", short: "ES", name: "Español", href: "/es" },
] as const;
const TRADE_ICONS = [MicVocal, Bus, Martini, Receipt] as const;

export function SolvioSystemsHome({ locale }: { locale: MarketingLocale }) {
  const c = locale === "es" ? COPY.es : COPY.en;
  return (
    <div lang={locale} className="min-h-dvh overflow-x-clip bg-white text-[#0f172a]">
      <header className="sticky top-0 z-30 border-b border-[#f1eefb]/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href={locale === "es" ? "/es" : "/"} className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]">
            <span className="block size-8 overflow-hidden rounded-xl shadow-sm shadow-[#7c3aed]/25">
              <Image src="/brand/icon-192.png" alt="" width={64} height={64} className="h-full w-full" priority />
            </span>
            <span className="text-base font-semibold tracking-tight whitespace-nowrap sm:text-lg">Solvio Systems</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
            <div role="group" aria-label={c.nav.language} className="flex rounded-lg border border-[#ebe7f7] p-0.5 text-xs font-semibold">
              {LANGUAGES.map((l) => (
                <Link
                  key={l.locale}
                  href={l.href}
                  hrefLang={l.locale}
                  lang={l.locale}
                  aria-label={l.name}
                  aria-current={l.locale === locale ? "page" : undefined}
                  className={`grid h-9 min-w-9 place-items-center rounded-md px-2 transition-colors ${
                    l.locale === locale ? "bg-[#f5f3ff] text-[#5b21b6]" : "text-[#64748b] hover:text-[#0f172a]"
                  }`}
                >
                  {l.short}
                </Link>
              ))}
            </div>
            <Link href="/login" className="hidden rounded-lg px-3 py-2.5 text-sm font-semibold text-[#5b21b6] hover:bg-[#f5f3ff] sm:block">
              {c.nav.signIn}
            </Link>
            <a
              href={CONNECT_URL}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#7c3aed] px-3 py-2.5 sm:px-3.5 text-sm font-semibold text-white shadow-sm shadow-[#7c3aed]/30 transition-colors hover:bg-[#6d28d9]"
            >
              <span className="sm:hidden">Connect</span>
              <span className="hidden sm:inline">{c.nav.connect}</span> <ArrowUpRight className="size-4" aria-hidden />
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_80%_-10%,#ede9fe,transparent),radial-gradient(40rem_24rem_at_-10%_30%,#f5f3ff,transparent)]" />
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 pt-20 pb-16 text-center sm:px-6 lg:pt-28 lg:pb-20">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e9e3fb] bg-white/80 px-3 py-1 text-xs font-semibold text-[#6d28d9] backdrop-blur">
              <FileCheck2 className="size-3.5" aria-hidden /> {c.badge}
            </span>
            <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">{c.title}</h1>
            <p className="max-w-2xl text-lg leading-relaxed text-[#475569]">{c.lead}</p>
            <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
              <a
                href={CONNECT_URL}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#7c3aed] px-6 text-base font-semibold text-white shadow-lg shadow-[#7c3aed]/30 transition-colors hover:bg-[#6d28d9]"
              >
                {c.openConnect} <ArrowRight className="size-4" aria-hidden />
              </a>
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-[#e2dcf7] bg-white px-6 text-base font-semibold text-[#0f172a] transition-colors hover:border-[#c4b5fd] hover:bg-[#faf9ff]"
              >
                {c.signInOps}
              </Link>
            </div>
            <ul className="mt-2 flex flex-wrap justify-center gap-2">
              {c.trades.map((t, i) => {
                const Icon = TRADE_ICONS[i] ?? Receipt;
                return (
                  <li key={t} className="inline-flex items-center gap-1.5 rounded-full border border-[#ebe7f7] bg-white px-3 py-1.5 text-sm text-[#475569]">
                    <Icon className="size-4 text-[#7c3aed]" aria-hidden /> {t}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="border-t border-[#f1eefb]">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{c.productsTitle}</h2>
            <div className="mt-10 grid gap-5 lg:grid-cols-3">
              {c.products.map((p, i) => {
                const Icon = PRODUCT_ICONS[i] ?? Sparkles;
                const first = i === 0;
                return (
                  <article
                    key={p.name}
                    className={`flex flex-col rounded-3xl border p-7 transition-shadow duration-200 hover:shadow-xl hover:shadow-[#7c3aed]/10 ${
                      first ? "border-[#c4b5fd] bg-gradient-to-b from-[#f5f3ff] to-white" : "border-[#ebe7f7] bg-white"
                    }`}
                  >
                    <span className={`inline-flex w-fit rounded-2xl p-3 ${first ? "bg-[#7c3aed] text-white" : "bg-[#f5f3ff] text-[#7c3aed]"}`}>
                      <Icon className="size-6" aria-hidden />
                    </span>
                    <p className="mt-5 text-xs font-semibold tracking-wide text-[#7c3aed] uppercase">{p.tag}</p>
                    <h3 className="mt-1 text-2xl font-semibold tracking-tight">{p.name}</h3>
                    <p className="mt-2 leading-relaxed text-[#475569]">{p.text}</p>
                    <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                      {p.points.map((pt) => (
                        <li key={pt} className="flex items-start gap-2 text-sm text-[#334155]">
                          <Check className="mt-0.5 size-4 shrink-0 text-[#7c3aed]" aria-hidden /> {pt}
                        </li>
                      ))}
                    </ul>
                    {p.external ? (
                      <a
                        href={p.href}
                        className={`mt-7 inline-flex h-11 w-fit items-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors ${
                          first ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]" : "border border-[#e2dcf7] text-[#0f172a] hover:bg-[#faf9ff]"
                        }`}
                      >
                        {p.cta} <ArrowUpRight className="size-4" aria-hidden />
                      </a>
                    ) : (
                      <Link
                        href={p.href}
                        className="mt-7 inline-flex h-11 w-fit items-center gap-2 rounded-xl border border-[#e2dcf7] px-5 text-sm font-semibold text-[#0f172a] transition-colors hover:bg-[#faf9ff]"
                      >
                        {p.cta} <ArrowRight className="size-4" aria-hidden />
                      </Link>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-[#1e1336] text-white">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(50rem_24rem_at_80%_0%,rgba(124,58,237,0.35),transparent)]" />
          <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{c.holdedTitle}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-violet-100/85">{c.holdedText}</p>
            <a
              href={CONNECT_URL}
              className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 font-semibold text-[#5b21b6] transition-colors hover:bg-violet-50"
            >
              {c.openConnect} <ArrowRight className="size-4" aria-hidden />
            </a>
          </div>
        </section>

        <section>
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">{c.contactTitle}</h2>
              <p className="mt-1 text-[#475569]">{c.contactText}</p>
            </div>
            <a
              href={`mailto:${CONTACT}`}
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#e2dcf7] px-5 font-semibold text-[#0f172a] transition-colors hover:bg-[#faf9ff]"
            >
              <Mail className="size-4 text-[#7c3aed]" aria-hidden /> {CONTACT}
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#f1eefb]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-[#64748b] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} Solvio Systems · Tenerife, Canary Islands</span>
          <span className="flex flex-wrap gap-x-5 gap-y-2">
            <a href={CONNECT_URL} className="hover:text-[#0f172a]">
              Solvio Connect
            </a>
            <Link href="/privacy" className="hover:text-[#0f172a]">
              {c.footer.privacy}
            </Link>
            <Link href="/terms" className="hover:text-[#0f172a]">
              {c.footer.terms}
            </Link>
            <Link href="/login" className="hover:text-[#0f172a]">
              {c.footer.signIn}
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
