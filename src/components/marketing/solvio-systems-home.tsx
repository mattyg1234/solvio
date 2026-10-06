import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  Bus,
  Check,
  Clock3,
  Coins,
  FileCheck2,
  Inbox,
  KeyRound,
  Mail,
  Martini,
  Printer,
  Puzzle,
  Receipt,
  ShieldCheck,
  Sparkles,
  TableProperties,
  Wrench,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { MarketingLocale } from "@/lib/marketing-locale";

/**
 * The solviosystems.com front page: Solvio Systems builds custom systems that save
 * businesses time and money by automating the repetitive work. Clients sign in to their
 * own hub through the portal (/portal); the Show Ops hub signs in here at /login.
 * Solvio Connect (self-serve) lives on its own subdomain.
 */

const CONNECT_URL = "https://connect.solviosystems.com";
const TIPSI_URL = "https://tipsi-app.com";
const CONTACT = "matty@solviosystems.com";

const COPY = {
  en: {
    nav: { portal: "Client portal", contact: "Talk to us", language: "Language" },
    badge: "Custom software · Built in the Canary Islands · Holded and Verifactu ready",
    title: "Custom systems that save your business time and money.",
    lead: "We look at how your business actually runs, then build one system around it: bookings, invoicing, staff and partners, with the repetitive work done automatically. Nobody types the same thing twice, and nothing waits for month end.",
    talk: "Talk to us",
    portal: "Client portal",
    fits: ["Tour and show operators", "Bars and venues", "Musicians and artists", "Services and trades"],

    painTitle: "Sound familiar?",
    pains: [
      {
        name: "Five tools and a spreadsheet",
        text: "Bookings in one place, invoices in another, the bus list on paper. The same name typed three times and the numbers never quite match.",
      },
      {
        name: "Admin eating your evenings",
        text: "Invoices built by hand at month end, partners chased one by one, reports pulled together the night before a meeting.",
      },
      {
        name: "Software that makes you work its way",
        text: "Off-the-shelf tools fit someone else's business. You bend your process around them, or pay staff hours to fill the gaps.",
      },
    ],

    automateTitle: "What we automate",
    automateLead: "We build the system around your process, then take the repetitive work off your team.",
    automate: [
      { name: "Bookings come in by themselves", text: "From your website, booking emails and marketplaces like GetYourGuide, straight into the system as drafts for the office to approve." },
      { name: "Invoices write themselves", text: "Built from the work already done, with partner rates and commissions applied, then issued legally through Holded under Verifactu." },
      { name: "Lists print themselves", text: "Night lists, bus boards, meal lists and confirmations, printed or sent the moment they are needed." },
      { name: "Reminders go out on time", text: "Daily reports to the right people, pick-up details to guests, overdue invoices flagged before they become a problem." },
      { name: "Money matches itself", text: "Card payments, deposits and partner payments tied to the booking they belong to, so Holded and your bank line up." },
      { name: "Everyone sees only their part", text: "Office, door, drivers and partners each get the view they need, on any device, with nothing to install." },
    ],

    outcomesTitle: "What that gives you back",
    outcomes: [
      { name: "Hours every week", text: "The typing, checking and chasing stops being a job." },
      { name: "Fewer mistakes", text: "One record per booking means one truth for lists, invoices and reports." },
      { name: "Legal invoices, no liability", text: "Holded issues and reports every invoice. You stay compliant without becoming a software company." },
      { name: "One flat monthly fee", text: "Hosting, backups, support and improvements included. No per-seat surprises." },
    ],

    howTitle: "How it works",
    how: [
      { step: "1", name: "We sit with your team", text: "A few hours with the people who do the work, looking at what they use today and where the time goes." },
      { step: "2", name: "We build it on your real data", text: "Weeks, not months. You see it working with your bookings and partners while it grows." },
      { step: "3", name: "We go live alongside the old way", text: "Training, migration and a side-by-side run before anything is switched off." },
      { step: "4", name: "We look after it", text: "Hosting, backups, support and new features for a flat monthly fee." },
    ],

    caseTag: "Built for a show operator",
    caseTitle: "Four show nights a week across three islands, run from one hub.",
    caseText:
      "Sixteen thousand historical bookings migrated, partner rate cards and commissions, bus boards per coach, printable night lists, door check-in by QR and partner invoices issued through Holded. Replacing a legacy system without stopping the shows.",

    productsTitle: "Off-the-shelf, when that fits",
    products: [
      {
        name: "Solvio Connect",
        tag: "Self-serve for small businesses",
        text: "Set up in a few questions. Bookings and gigs turn into Verifactu invoices through Holded, with IGIC, IRPF and tax figures handled.",
        cta: "Open Solvio Connect",
        href: CONNECT_URL,
      },
      {
        name: "Tipsi",
        tag: "QR ordering for bars",
        text: "QR menus, table ordering, table bookings and send-a-drink, printed at the bar and paid by card.",
        cta: "Visit Tipsi",
        href: TIPSI_URL,
      },
    ],

    portalTitle: "Already a client?",
    portalText: "Your hub has its own sign in. Find it in the client portal.",
    portalCta: "Open the client portal",
    contactTitle: "Tell us what you run",
    contactText: "Operators, venues, gestorías and partners: a short call is enough to know whether we can save you time.",
    footer: { privacy: "Privacy", terms: "Terms", portal: "Client portal" },
  },
  es: {
    nav: { portal: "Portal de clientes", contact: "Habla con nosotros", language: "Idioma" },
    badge: "Software a medida · Hecho en Canarias · Preparado para Holded y Verifactu",
    title: "Sistemas a medida que ahorran tiempo y dinero a tu negocio.",
    lead: "Miramos cómo funciona tu negocio de verdad y construimos un solo sistema a su alrededor: reservas, facturación, personal y partners, con el trabajo repetitivo hecho automáticamente. Nadie teclea lo mismo dos veces y nada espera a fin de mes.",
    talk: "Habla con nosotros",
    portal: "Portal de clientes",
    fits: ["Operadores de tours y espectáculos", "Bares y locales", "Músicos y artistas", "Servicios y oficios"],

    painTitle: "¿Te suena?",
    pains: [
      {
        name: "Cinco herramientas y una hoja de cálculo",
        text: "Las reservas en un sitio, las facturas en otro, la lista del autobús en papel. El mismo nombre tecleado tres veces y los números nunca cuadran del todo.",
      },
      {
        name: "La administración se come tus tardes",
        text: "Facturas hechas a mano a fin de mes, partners reclamados uno a uno, informes montados la noche antes de una reunión.",
      },
      {
        name: "Software que te obliga a trabajar a su manera",
        text: "Las herramientas genéricas encajan con el negocio de otro. Tú doblas tu proceso para adaptarte, o pagas horas de personal para cubrir los huecos.",
      },
    ],

    automateTitle: "Qué automatizamos",
    automateLead: "Construimos el sistema alrededor de tu proceso y le quitamos el trabajo repetitivo a tu equipo.",
    automate: [
      { name: "Las reservas entran solas", text: "Desde tu web, los emails de reserva y marketplaces como GetYourGuide, directamente al sistema como borradores para que la oficina los apruebe." },
      { name: "Las facturas se escriben solas", text: "A partir del trabajo ya hecho, con tarifas y comisiones de partners aplicadas, y emitidas legalmente a través de Holded con Verifactu." },
      { name: "Las listas se imprimen solas", text: "Listas de noche, cuadros de autobús, listas de comidas y confirmaciones, impresas o enviadas en el momento en que hacen falta." },
      { name: "Los recordatorios salen a su hora", text: "Informes diarios a quien corresponde, datos de recogida a los clientes, facturas vencidas señaladas antes de que sean un problema." },
      { name: "El dinero cuadra solo", text: "Pagos con tarjeta, depósitos y pagos de partners vinculados a la reserva a la que pertenecen, para que Holded y tu banco coincidan." },
      { name: "Cada uno ve solo su parte", text: "Oficina, puerta, conductores y partners tienen la vista que necesitan, en cualquier dispositivo, sin instalar nada." },
    ],

    outcomesTitle: "Lo que recuperas",
    outcomes: [
      { name: "Horas cada semana", text: "Teclear, comprobar y reclamar deja de ser un trabajo." },
      { name: "Menos errores", text: "Un registro por reserva significa una sola verdad para listas, facturas e informes." },
      { name: "Facturas legales, sin responsabilidad", text: "Holded emite y comunica cada factura. Cumples sin convertirte en una empresa de software." },
      { name: "Una cuota mensual fija", text: "Alojamiento, copias de seguridad, soporte y mejoras incluidos. Sin sorpresas por usuario." },
    ],

    howTitle: "Cómo funciona",
    how: [
      { step: "1", name: "Nos sentamos con tu equipo", text: "Unas horas con quienes hacen el trabajo, viendo qué usan hoy y dónde se va el tiempo." },
      { step: "2", name: "Lo construimos con tus datos reales", text: "Semanas, no meses. Lo ves funcionar con tus reservas y partners mientras crece." },
      { step: "3", name: "Arrancamos junto al sistema antiguo", text: "Formación, migración y uso en paralelo antes de apagar nada." },
      { step: "4", name: "Lo cuidamos", text: "Alojamiento, copias de seguridad, soporte y nuevas funciones por una cuota mensual fija." },
    ],

    caseTag: "Construido para un operador de espectáculos",
    caseTitle: "Cuatro noches de show a la semana en tres islas, desde un solo hub.",
    caseText:
      "Dieciséis mil reservas históricas migradas, tarifas y comisiones de partners, cuadros de autobús por coche, listas de noche imprimibles, control de acceso por QR y facturas a partners emitidas con Holded. Sustituyendo un sistema antiguo sin parar los shows.",

    productsTitle: "Listo para usar, cuando encaja",
    products: [
      {
        name: "Solvio Connect",
        tag: "Autoservicio para pequeños negocios",
        text: "Se configura en unas pocas preguntas. Las reservas y actuaciones se convierten en facturas Verifactu a través de Holded, con IGIC, IRPF e impuestos resueltos.",
        cta: "Abrir Solvio Connect",
        href: CONNECT_URL,
      },
      {
        name: "Tipsi",
        tag: "Pedidos por QR para bares",
        text: "Menús QR, pedidos en mesa, reservas de mesa e invitar a una copa, impresos en la barra y pagados con tarjeta.",
        cta: "Ver Tipsi",
        href: TIPSI_URL,
      },
    ],

    portalTitle: "¿Ya eres cliente?",
    portalText: "Tu hub tiene su propio acceso. Encuéntralo en el portal de clientes.",
    portalCta: "Abrir el portal de clientes",
    contactTitle: "Cuéntanos qué gestionas",
    contactText: "Operadores, locales, gestorías y partners: con una llamada corta basta para saber si podemos ahorrarte tiempo.",
    footer: { privacy: "Privacidad", terms: "Condiciones", portal: "Portal de clientes" },
  },
} as const;

const PAIN_ICONS = [TableProperties, Clock3, Puzzle] as const;
const AUTOMATE_ICONS = [Inbox, Receipt, Printer, BellRing, Coins, ShieldCheck] as const;
const OUTCOME_ICONS = [Clock3, Check, FileCheck2, Coins] as const;
const PRODUCT_ICONS = [Sparkles, Martini] as const;
const FIT_ICONS = [Bus, Martini, Sparkles, Wrench] as const;

/** The page in each language: English at /, Spanish at /es. */
const LANGUAGES = [
  { locale: "en", short: "EN", name: "English", href: "/" },
  { locale: "es", short: "ES", name: "Español", href: "/es" },
] as const;

export function SolvioSystemsHome({ locale }: { locale: MarketingLocale }) {
  const c = locale === "es" ? COPY.es : COPY.en;
  const portalHref = locale === "es" ? "/es/portal" : "/portal";
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
            <Link href={portalHref} className="hidden rounded-lg px-3 py-2.5 text-sm font-semibold text-[#5b21b6] hover:bg-[#f5f3ff] sm:block">
              {c.nav.portal}
            </Link>
            <a
              href="#contact"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#7c3aed] px-3 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#7c3aed]/30 transition-colors hover:bg-[#6d28d9] sm:px-3.5"
            >
              {c.nav.contact} <ArrowRight className="size-4" aria-hidden />
            </a>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative isolate overflow-hidden">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_80%_-10%,#ede9fe,transparent),radial-gradient(40rem_24rem_at_-10%_30%,#f5f3ff,transparent)]" />
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 pt-20 pb-16 text-center sm:px-6 lg:pt-28 lg:pb-20">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e9e3fb] bg-white/80 px-3 py-1 text-xs font-semibold text-[#6d28d9] backdrop-blur">
              <Wrench className="size-3.5" aria-hidden /> {c.badge}
            </span>
            <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">{c.title}</h1>
            <p className="max-w-2xl text-lg leading-relaxed text-[#475569]">{c.lead}</p>
            <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
              <a
                href="#contact"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#7c3aed] px-6 text-base font-semibold text-white shadow-lg shadow-[#7c3aed]/30 transition-colors hover:bg-[#6d28d9]"
              >
                {c.talk} <ArrowRight className="size-4" aria-hidden />
              </a>
              <Link
                href={portalHref}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#e2dcf7] bg-white px-6 text-base font-semibold text-[#0f172a] transition-colors hover:border-[#c4b5fd] hover:bg-[#faf9ff]"
              >
                <KeyRound className="size-4 text-[#7c3aed]" aria-hidden /> {c.portal}
              </Link>
            </div>
            <ul className="mt-2 flex flex-wrap justify-center gap-2">
              {c.fits.map((t, i) => {
                const Icon = FIT_ICONS[i] ?? Receipt;
                return (
                  <li key={t} className="inline-flex items-center gap-1.5 rounded-full border border-[#ebe7f7] bg-white px-3 py-1.5 text-sm text-[#475569]">
                    <Icon className="size-4 text-[#7c3aed]" aria-hidden /> {t}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* The problem */}
        <section className="border-t border-[#f1eefb] bg-[#faf9ff]">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{c.painTitle}</h2>
            <div className="mt-10 grid gap-5 lg:grid-cols-3">
              {c.pains.map((p, i) => {
                const Icon = PAIN_ICONS[i] ?? Puzzle;
                return (
                  <article key={p.name} className="flex flex-col rounded-3xl border border-[#ebe7f7] bg-white p-7">
                    <span className="inline-flex w-fit rounded-2xl bg-[#fff1f2] p-3 text-[#e11d48]">
                      <Icon className="size-6" aria-hidden />
                    </span>
                    <h3 className="mt-5 text-xl font-semibold tracking-tight">{p.name}</h3>
                    <p className="mt-2 leading-relaxed text-[#475569]">{p.text}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* What we automate */}
        <section className="border-t border-[#f1eefb]">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{c.automateTitle}</h2>
            <p className="mt-2 max-w-2xl text-lg text-[#475569]">{c.automateLead}</p>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {c.automate.map((a, i) => {
                const Icon = AUTOMATE_ICONS[i] ?? Sparkles;
                return (
                  <article key={a.name} className="flex gap-4 rounded-3xl border border-[#ebe7f7] bg-white p-6 transition-shadow duration-200 hover:shadow-xl hover:shadow-[#7c3aed]/10">
                    <span className="inline-flex h-fit shrink-0 rounded-2xl bg-[#f5f3ff] p-3 text-[#7c3aed]">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold tracking-tight">{a.name}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-[#475569]">{a.text}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Outcomes */}
        <section className="relative overflow-hidden bg-[#1e1336] text-white">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(50rem_24rem_at_80%_0%,rgba(124,58,237,0.35),transparent)]" />
          <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{c.outcomesTitle}</h2>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {c.outcomes.map((o, i) => {
                const Icon = OUTCOME_ICONS[i] ?? Check;
                return (
                  <li key={o.name} className="rounded-3xl border border-white/10 bg-white/5 p-6">
                    <span className="inline-flex rounded-2xl bg-white/10 p-3 text-violet-200">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 text-lg font-semibold tracking-tight">{o.name}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-violet-100/80">{o.text}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-[#f1eefb] bg-[#faf9ff]">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{c.howTitle}</h2>
            <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {c.how.map((h) => (
                <li key={h.step} className="rounded-3xl border border-[#ebe7f7] bg-white p-7">
                  <span className="grid size-9 place-items-center rounded-full bg-[#7c3aed] text-sm font-semibold text-white">{h.step}</span>
                  <h3 className="mt-4 text-lg font-semibold tracking-tight">{h.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#475569]">{h.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Case */}
        <section className="border-t border-[#f1eefb]">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="grid gap-8 rounded-3xl border border-[#c4b5fd] bg-gradient-to-b from-[#f5f3ff] to-white p-8 lg:grid-cols-[1.2fr_1fr] lg:p-12">
              <div>
                <p className="text-xs font-semibold tracking-wide text-[#7c3aed] uppercase">{c.caseTag}</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{c.caseTitle}</h2>
                <p className="mt-4 text-lg leading-relaxed text-[#475569]">{c.caseText}</p>
              </div>
              <ul className="flex flex-wrap content-start gap-2 lg:justify-end">
                {["Holded", "Verifactu", "Stripe", "GetYourGuide", "WhatsApp", "MailerLite", "Tipsi"].map((t) => (
                  <li key={t} className="inline-flex h-fit items-center gap-1.5 rounded-full border border-[#ebe7f7] bg-white px-3 py-1.5 text-sm text-[#475569]">
                    <Check className="size-3.5 text-[#7c3aed]" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Products */}
        <section className="border-t border-[#f1eefb] bg-[#faf9ff]">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{c.productsTitle}</h2>
            <div className="mt-10 grid gap-5 lg:grid-cols-2">
              {c.products.map((p, i) => {
                const Icon = PRODUCT_ICONS[i] ?? Sparkles;
                return (
                  <article key={p.name} className="flex flex-col rounded-3xl border border-[#ebe7f7] bg-white p-7 transition-shadow duration-200 hover:shadow-xl hover:shadow-[#7c3aed]/10">
                    <span className="inline-flex w-fit rounded-2xl bg-[#f5f3ff] p-3 text-[#7c3aed]">
                      <Icon className="size-6" aria-hidden />
                    </span>
                    <p className="mt-5 text-xs font-semibold tracking-wide text-[#7c3aed] uppercase">{p.tag}</p>
                    <h3 className="mt-1 text-2xl font-semibold tracking-tight">{p.name}</h3>
                    <p className="mt-2 flex-1 leading-relaxed text-[#475569]">{p.text}</p>
                    <a
                      href={p.href}
                      className="mt-7 inline-flex h-11 w-fit items-center gap-2 rounded-xl border border-[#e2dcf7] px-5 text-sm font-semibold text-[#0f172a] transition-colors hover:bg-[#faf9ff]"
                    >
                      {p.cta} <ArrowUpRight className="size-4" aria-hidden />
                    </a>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Portal */}
        <section className="border-t border-[#f1eefb]">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">{c.portalTitle}</h2>
              <p className="mt-1 text-[#475569]">{c.portalText}</p>
            </div>
            <Link
              href={portalHref}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#7c3aed] px-5 font-semibold text-white shadow-sm shadow-[#7c3aed]/30 transition-colors hover:bg-[#6d28d9]"
            >
              <KeyRound className="size-4" aria-hidden /> {c.portalCta}
            </Link>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="scroll-mt-20 border-t border-[#f1eefb] bg-[#faf9ff]">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">{c.contactTitle}</h2>
              <p className="mt-1 text-[#475569]">{c.contactText}</p>
            </div>
            <a
              href={`mailto:${CONTACT}`}
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#e2dcf7] bg-white px-5 font-semibold text-[#0f172a] transition-colors hover:bg-[#faf9ff]"
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
            <a href={TIPSI_URL} className="hover:text-[#0f172a]">
              Tipsi
            </a>
            <Link href="/privacy" className="hover:text-[#0f172a]">
              {c.footer.privacy}
            </Link>
            <Link href="/terms" className="hover:text-[#0f172a]">
              {c.footer.terms}
            </Link>
            <Link href={portalHref} className="hover:text-[#0f172a]">
              {c.footer.portal}
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
