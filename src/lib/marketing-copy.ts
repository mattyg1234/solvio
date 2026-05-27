import {
  BOOKING_DEMO_AI_MINUTES,
  BOOKING_MONTHLY_GBP,
  BOOKING_PLATFORM_FEE_BPS,
  BOOKING_TRIAL_DAYS,
  ENTERPRISE_AI_MINUTES,
  ENTERPRISE_MONTHLY_GBP,
  ENTERPRISE_PLATFORM_FEE_BPS,
  PRO_AI_MINUTES,
  PRO_MONTHLY_GBP,
  PRO_PLATFORM_FEE_BPS,
  TRIAL_PLATFORM_FEE_BPS,
} from "@/lib/solvio-pricing";
import type { MarketingLocale } from "@/lib/marketing-locale";

export type VoiceDemoLine = { role: "user" | "assistant"; text: string };

export type VoiceDemoScenarioCopy = {
  productLine: string;
  eyebrowAssistant: string;
  idleBadge: string;
  emptyHint: string;
  footer: string;
  assistantLabel: string;
  lines: VoiceDemoLine[];
};

export type MarketingCopy = {
  meta: { title: string; description: string; ogDescription: string };
  header: {
    nav: { growth: string; pricing: string; commerce: string; faq: string; liveDemo: string };
    login: string;
    signup: string;
    tryBookingDemo: string;
    openMenu: string;
    closeMenu: string;
    languageSwitch: string;
  };
  footer: {
    blurb: string;
    product: string;
    company: string;
    links: Record<string, string>;
    copyright: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    book247: string;
    evenClosed: string;
    ctaTrial: string;
    ctaDemo: string;
    bullet1: string;
    bullet2: string;
    voiceLive: string;
    voicePreview: string;
  };
  goLive: {
    eyebrow: string;
    title: string;
    subtitle: string;
    cta: string;
    steps: { title: string; body: string }[];
    stepLabel: (n: number) => string;
  };
  growth: {
    eyebrow: string;
    title: string;
    subtitle: string;
    examplePrefix: string;
    blocks: { title: string; body: string; stat: string }[];
  };
  commerce: {
    eyebrow: string;
    title: string;
    subtitle: string;
    badge: string;
    card1Title: string;
    card1Body: string;
    card1Bullets: string[];
    card2Title: string;
    card2Body: string;
    capabilities: { title: string; body: string }[];
    restaurantFlow: {
      label: string;
      callerLabel: string;
      callerQuote: string;
      solvioLabel: string;
      solvioBody: string;
      tags: string[];
    };
    salonFlow: {
      label: string;
      callerLabel: string;
      callerQuote: string;
      solvioLabel: string;
      solvioBody: string;
      tags: string[];
    };
    dashboardLayer: { eyebrow: string; body: string };
  };
  bookPreview: {
    eyebrow: string;
    title: string;
    subtitle: string;
    cta: string;
    mockVenue: string;
    mockHeading: string;
    mockAddress: string;
    mockSteps: { title: string; body: string }[];
    mockContinue: string;
    trustLine: string;
    mockConfirmation: string;
  };
  pricing: {
    eyebrow: string;
    title: string;
    subtitle: string;
    footnote: string;
    footnoteLink: string;
    tiers: {
      name: string;
      badge: string;
      features: string[];
      cta: string;
    }[];
  };
  faq: {
    eyebrow: string;
    title: string;
    items: { q: string; a: string }[];
    legalPrefix: string;
    privacy: string;
    terms: string;
  };
  social: {
    eyebrow: string;
    title: string;
    disclaimer: string;
    stories: { biz: string; quote: string; owner: string; metric: string; money: string }[];
  };
  trustStats: {
    stats: { value: string; label: string; detail: string }[];
    disclaimer: string;
  };
  liveDemo: {
    eyebrow: string;
    titleLive: string;
    titlePreview: string;
    subtitleLive: string;
    subtitlePreview: string;
    topics: string[];
    ctaBooking: string;
    ctaVoiceLive: string;
    ctaVoicePreview: string;
  };
  voice: {
    preparing: string;
    panel: {
      productLine: string;
      eyebrowAssistant: string;
      idleBadge: string;
      starterBubbleLabel: string;
      starterBubbleIntro: string;
      starterBubbleMicCta: string;
      footer: string;
      assistantLabel: string;
    };
    scenarios: {
      default: VoiceDemoScenarioCopy;
      personal_voice: VoiceDemoScenarioCopy;
    };
    scenarioApiDefaults: VoiceDemoLine[];
    demoSentence: string;
  };
  loadingDemo: string;
};

const EN: MarketingCopy = {
  meta: {
    title: "Solvio · Booking solutions for your business",
    description:
      "Launch your booking link in minutes. Guests pick appointments, tables, or events — confirmed by email and text, with optional deposits when you want them.",
    ogDescription:
      "Online booking for restaurants, salons, bars, and service businesses — one link, automatic confirmations, optional card deposits.",
  },
  header: {
    nav: { growth: "Growth", pricing: "Pricing", commerce: "Commerce", faq: "FAQ", liveDemo: "Live demo" },
    login: "Log in",
    signup: "Start free trial",
    tryBookingDemo: "Try booking demo",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    languageSwitch: "Español",
  },
  footer: {
    blurb:
      "Booking infrastructure for restaurants, salons and cafés — one link, online bookings, and confirmations without enterprise baggage.",
    product: "Product",
    company: "Company",
    links: {
      whatYouGet: "What you get",
      bookingsPayments: "Bookings & payments",
      tryAiDemo: "Try AI demo",
      pricing: "Pricing",
      faq: "FAQ",
      results: "Results",
      privacy: "Privacy",
      terms: "Terms",
      liveBookingDemo: "Live booking demo",
      login: "Log in",
      signup: "Sign up",
      dataHosting: "Data hosting (Supabase EU)",
      privacySub: "Privacy & subprocessors",
    },
    copyright: "Built for busy shop floors — not dashboards.",
  },
  hero: {
    eyebrow: "One booking link — optional card deposits",
    title: "Your booking page live in about 30 minutes — enquiries and deposits on one link.",
    subtitle:
      "Share one link with your customers. They pick a day, choose a stylist or table, and get booked in — with email and text confirmation. Turn on optional card deposits when you want to hold a table or ticket.",
    book247: "Book online 24/7",
    evenClosed: "Even when you're closed",
    ctaTrial: "Start free trial",
    ctaDemo: "See live booking demo",
    bullet1: "Bookings and calls in one place",
    bullet2: "Restaurants, salons, cafés & events",
    voiceLive: "Click the purple microphone — you'll speak directly to our live AI receptionist demo.",
    voicePreview: "Preview our AI receptionist — scripted demo while live voice is unavailable.",
  },
  goLive: {
    eyebrow: "Go live in ~30 minutes",
    title: "Three steps from signup to your first guest booking.",
    subtitle: "See what guests experience on a real booking page — then start your free trial and publish your own link.",
    cta: "Preview live booking demo",
    stepLabel: (n) => `Step ${n}`,
    steps: [
      { title: "Set up your flow", body: "Tables, appointments or events — about 5 minutes in the dashboard." },
      { title: "Turn on deposits (optional)", body: "Quick setup when you want card payments. Free booking requests work without them." },
      { title: "Share your /book link", body: "One link for Google, Instagram and your AI receptionist." },
    ],
  },
  growth: {
    eyebrow: "Built for outcomes",
    title: "Growth feels effortless — because the boring stuff disappears.",
    subtitle: `No dashboards to babysit. Booking (£${BOOKING_MONTHLY_GBP}/mo) gives you the public link, calendar, and optional online deposits. Pro (£${PRO_MONTHLY_GBP}/mo) adds the AI receptionist with a limited monthly minute cap.`,
    examplePrefix: "Example:",
    blocks: [
      { title: "Never miss a booking", body: "Your /book link works 24/7 — guests enquire even when you're closed. Pro adds an AI receptionist on the phone.", stat: "More after-hours requests" },
      { title: "Speak multiple languages", body: "Perfect for busy high streets in the UK and Ireland — greet guests in English (and more with Pro).", stat: "More inbound captured" },
      { title: "Automatic appointments", body: "Guests pick slots on your link — confirmed in your diary with email and text when you're not charging a deposit.", stat: "Less back-and-forth" },
      { title: "Less time on the phone", body: "Fewer repetitive calls when guests self-serve on your link — free your crew for the floor.", stat: "~6 hrs/week saved (example)" },
      { title: "One booking inbox", body: "Requests, optional deposits, and confirmations in one place — no spreadsheet chasing.", stat: "Deposits optional" },
    ],
  },
  commerce: {
    eyebrow: "Bookings & payments",
    title: "Guest books a slot → optional deposit → payout to you.",
    subtitle:
      "One booking link for your venue — tables, stylists or ticketed nights. Start with free enquiries; turn on card deposits when you're ready. Pro adds the full AI receptionist for after-hours calls.",
    badge: "Payouts go to you",
    card1Title: "Guests pay you directly",
    card1Body:
      "Guests book with your venue, not a third-party marketplace. When deposits are on, card payments route to your payout account — Solvio runs the page, calendar, and confirmations and keeps a small platform fee on each deposit.",
    card1Bullets: [
      "Share one link — Instagram, Google, voicemail, wherever guests find you.",
      "Deposits are optional — start with free enquiries if you prefer.",
    ],
    card2Title: "Pricing that grows when you grow",
    card2Body: `Booking from £${BOOKING_MONTHLY_GBP}/mo — Pro adds AI receptionist from £${PRO_MONTHLY_GBP}/mo. Enterprise for groups and volume from £${ENTERPRISE_MONTHLY_GBP}/mo.`,
    capabilities: [
      { title: "Takes bookings", body: "Guests pick a slot — confirmed straight into your diary when you're not charging a deposit." },
      { title: "Collects deposits", body: "Optional card prepayments when you enable them — shown clearly to guests." },
      { title: "Confirms visits", body: "Email and text reminders when guests are booked in — so they show up on time." },
      { title: "Handles changes", body: "Cancellations and closed days stay in sync on your calendar." },
    ],
    restaurantFlow: {
      label: "Restaurant flow",
      callerLabel: "Caller:",
      callerQuote: "“Table for four tonight at eight.”",
      solvioLabel: "Solvio:",
      solvioBody:
        "checks live availability → holds the request → can send a deposit link if you use them → confirms and notifies your front-of-house team.",
      tags: ["Voice booking", "Paid to you", "Guest confirmation"],
    },
    salonFlow: {
      label: "Salon flow",
      callerLabel: "Caller:",
      callerQuote: "“Haircut tomorrow afternoon.”",
      solvioLabel: "Solvio:",
      solvioBody:
        "shows available calendar days → guest picks stylist & time → can pay an optional deposit → email confirmation lands instantly.",
      tags: ["Online deposit", "Email confirm", "Closed days blocked"],
    },
    dashboardLayer: {
      eyebrow: "Dashboard layer",
      body: "Operators still deserve clarity — every booking, payment and confirmation in one calm workspace while Solvio handles the phone lines.",
    },
  },
  bookPreview: {
    eyebrow: "What guests see",
    title: "One branded page — pick a service, pay a deposit, get confirmed.",
    subtitle:
      "Your logo, address, and phone at the top. Step-by-step booking for tables, appointments, or events. Card deposits are optional — when on, guests pay the venue directly.",
    cta: "Open live booking demo →",
    mockVenue: "Book with Café Aurora",
    mockHeading: "Request an appointment",
    mockAddress: "12 High Street · +44 7700 900123",
    mockSteps: [
      { title: "Choose a service", body: "Haircut · 45 min · £35" },
      { title: "Which day?", body: "Highlighted dates available" },
      { title: "Your details", body: "Name, email, phone" },
    ],
    mockContinue: "Continue · pay £10 deposit",
    trustLine: "Secure checkout · paid to the venue",
    mockConfirmation: "Email confirmation after submit",
  },
  pricing: {
    eyebrow: "Simple pricing",
    title: `Booking from £${BOOKING_MONTHLY_GBP}/mo — add AI when you're ready.`,
    subtitle: `${BOOKING_TRIAL_DAYS}-day free trial — add your card to get started. You won't be charged until the trial ends; £${BOOKING_MONTHLY_GBP}/mo after that unless you cancel. Guest deposits go to your payout account. Solvio keeps a platform fee (${TRIAL_PLATFORM_FEE_BPS / 100}% during trial, ${BOOKING_PLATFORM_FEE_BPS / 100}% on Booking, ${PRO_PLATFORM_FEE_BPS / 100}% on Pro, ${ENTERPRISE_PLATFORM_FEE_BPS / 100}% on Enterprise) — always shown before guests pay.`,
    footnote: `Pro includes ${PRO_AI_MINUTES} AI minutes — enough for steady call volume; Enterprise adds ${ENTERPRISE_AI_MINUTES.toLocaleString("en-GB")}+ for groups and events.`,
    footnoteLink: "Try the live booking demo →",
    tiers: [
      {
        name: "Booking",
        badge: "Start here",
        features: [
          "Public /book link — tables, appointments & events",
          "Operations inbox & calendar",
          "Optional card deposits — paid to you",
          `${BOOKING_PLATFORM_FEE_BPS / 100}% fee on guest deposits`,
          `${BOOKING_DEMO_AI_MINUTES} demo AI minutes to test a call`,
        ],
        cta: `Start ${BOOKING_TRIAL_DAYS}-day trial`,
      },
      {
        name: "Pro",
        badge: "AI receptionist",
        features: [
          "Everything in Booking",
          `${PRO_AI_MINUTES.toLocaleString("en-GB")} AI receptionist minutes / month`,
          `${PRO_PLATFORM_FEE_BPS / 100}% fee on guest deposits`,
          "Full voice configuration & call history",
          "Ask Solvio + lead pipeline",
        ],
        cta: "Start with Pro",
      },
      {
        name: "Enterprise",
        badge: "Multi-site & volume",
        features: [
          "Everything in Pro",
          `${ENTERPRISE_AI_MINUTES.toLocaleString("en-GB")} AI minutes / month`,
          `${ENTERPRISE_PLATFORM_FEE_BPS / 100}% fee on guest deposits`,
          "Outbound campaigns + unlimited locations",
          "Priority support & custom branding",
        ],
        cta: "Talk to us about Enterprise",
      },
    ],
  },
  faq: {
    eyebrow: "FAQ",
    title: "Common questions before you sign up",
    items: [
      {
        q: "Do I need a card to start?",
        a: `${BOOKING_TRIAL_DAYS}-day free trial — add your card to get started. You won't be charged until the trial ends; £${BOOKING_MONTHLY_GBP}/mo after that unless you cancel.`,
      },
      {
        q: "Who receives guest deposit payments?",
        a: "You do. Guest deposits are paid to your business payout account — Solvio is not the merchant of record. We provide the booking page, inbox, and guest confirmations.",
      },
      {
        q: "What fees does Solvio charge?",
        a: `Booking is £${BOOKING_MONTHLY_GBP}/month after your trial. Deposit fees: ${TRIAL_PLATFORM_FEE_BPS / 100}% during trial, ${BOOKING_PLATFORM_FEE_BPS / 100}% on Booking, ${PRO_PLATFORM_FEE_BPS / 100}% on Pro, ${ENTERPRISE_PLATFORM_FEE_BPS / 100}% on Enterprise — always shown before guests pay.`,
      },
      {
        q: "Can I cancel?",
        a: `Yes. Cancel anytime from the dashboard. Cancel before your ${BOOKING_TRIAL_DAYS}-day trial ends and you won't be charged £${BOOKING_MONTHLY_GBP}/mo.`,
      },
      {
        q: "Is this only for restaurants?",
        a: "No — salons, cafés, bars and ticketed events use the same /book link. Pick tables, appointments, events or a mix when you set up.",
      },
      {
        q: "Will this actually increase my bookings?",
        a: "Results vary by venue — but teams typically share one /book link everywhere (Google, Instagram, voicemail) so guests can book when you're busy or closed. Deposits also cut no-shows. Our homepage shows illustrative examples, not verified case studies.",
      },
    ],
    legalPrefix: "More detail in our",
    privacy: "Privacy Policy",
    terms: "Terms",
  },
  social: {
    eyebrow: "Illustrative results",
    title: "What teams like yours aim for with one booking link.",
    disclaimer: "Illustrative examples — not verified customer reviews or audited metrics.",
    stories: [
      { biz: "The Corner Table · Manchester", quote: "We posted the /book link on Instagram and stopped losing tables to voicemail. Bookings are up and Friday feels full again.", owner: "James O. · Owner", metric: "+32% bookings", money: "£1,420/mo in deposits" },
      { biz: "Bark Barber Studio · Leeds", quote: "Saturday used to be no-show chaos. Card deposits changed everything — clients actually turn up.", owner: "Priya M. · Studio manager", metric: "−41% no-shows", money: "~£680/mo recovered" },
      { biz: "Glow Salon · Dublin", quote: "I got six hours back every week. No more DMs, missed calls, or scribbling appointments on paper.", owner: "Aoife K. · Salon owner", metric: "6 hrs/week saved", money: "Team stays on the floor" },
      { biz: "Riverside Bistro · Bristol", quote: "After-hours enquiries used to die on the answerphone. Now guests can book from the link while we're closed — requests waiting when we open.", owner: "Tom H. · GM", metric: "+£2.1k/mo", money: "After-hours revenue" },
      { biz: "Studio Nineteen · Edinburgh", quote: "First month we filled eighteen empty stylist slots from the link alone. Didn't hire anyone extra to answer phones.", owner: "Emma L. · Owner", metric: "18 slots filled", money: "First 30 days" },
      { biz: "Harbor Events · Cork", quote: "Three sold-out show nights straight from one booking page. Less spreadsheet panic, more time with the artists.", owner: "Sean B. · Events lead", metric: "3 sold-out nights", money: "Ticket deposits" },
    ],
  },
  trustStats: {
    stats: [
      { value: "+34%", label: "More bookings", detail: "Illustrative avg. after sharing one /book link" },
      { value: "£1.8k", label: "Deposit revenue / mo", detail: "Example recovery from no-shows & after-hours" },
      { value: "6 hrs", label: "Saved each week", detail: "Less phone tag — team stays on the floor" },
      { value: "−41%", label: "Fewer no-shows", detail: "Common when venues ask for a card deposit upfront" },
    ],
    disclaimer: "Illustrative examples — your results will vary. Not verified reviews.",
  },
  liveDemo: {
    eyebrow: "How we help",
    titleLive: "Ask our receptionist anything about Solvio.",
    titlePreview: "See how Solvio fits your venue.",
    subtitleLive: "Tap the purple microphone at the top of the page — you'll talk live to our AI receptionist demo.",
    subtitlePreview: "Try the live booking demo below, or scroll up for a scripted voice preview when live AI isn't configured.",
    topics: [
      "How AI receptionists handle calls after hours",
      "Bookings, tables, and event nights on one page",
      "Optional card deposits for your venue",
      "What setup looks like for restaurants, salons, and tours",
    ],
    ctaBooking: "Try live booking demo",
    ctaVoiceLive: "Talk to AI receptionist",
    ctaVoicePreview: "Voice preview",
  },
  voice: {
    preparing: "Preparing voice…",
    panel: {
      productLine: "AI receptionist",
      eyebrowAssistant: "Speak with us",
      idleBadge: "Tap the purple microphone",
      starterBubbleLabel: "Your AI receptionist",
      starterBubbleIntro: "",
      starterBubbleMicCta: "Tap the purple microphone to start talking.",
      footer: "Allow microphone access when your browser asks.",
      assistantLabel: "Receptionist",
    },
    scenarios: {
      default: {
        productLine: "Solvio Voice",
        eyebrowAssistant: "Quick peek",
        idleBadge: "Tap mic — hear preview",
        emptyHint: "Short preview — Solvio answering for your storefront.",
        footer: "Hosted voice preview—matching what callers hear once your workspace is wired in.",
        assistantLabel: "Your reception",
        lines: [
          { role: "user", text: "What does Solvio do for busy venues?" },
          { role: "assistant", text: "Solvio picks up bookings, sends confirmations guests actually receive, and can take optional deposits for you — calmly, even after hours." },
        ],
      },
      personal_voice: {
        productLine: "AI receptionist",
        eyebrowAssistant: "Speak with us",
        idleBadge: "Tap the purple microphone",
        emptyHint: "Tap the purple microphone to talk live once voice keys are set on this deployment.",
        footer: "Allow microphone access when your browser asks.",
        assistantLabel: "Receptionist",
        lines: [
          { role: "assistant", text: "Tap the purple microphone once live voice is configured — your assistant speaks from the prompt you've saved." },
          { role: "user", text: "What can you help me with?" },
          { role: "assistant", text: "Configure your assistant in Solvio; this site connects to it directly when keys are set." },
        ],
      },
    },
    scenarioApiDefaults: [
      { role: "assistant", text: "Tap the purple microphone when Vapi keys are configured to talk live with your assistant." },
      { role: "user", text: "What can you help me with?" },
      { role: "assistant", text: "Your assistant answers from the prompt you configured in the Vapi dashboard." },
    ],
    demoSentence: "Choosing Solvio to automate your business and organise your bookings is the best choice.",
  },
  loadingDemo: "Loading demo…",
};

const ES: MarketingCopy = {
  meta: {
    title: "Solvio · Soluciones de reservas para tu negocio",
    description:
      "Publica tu enlace de reservas en minutos. Tus clientes eligen cita, mesa o evento — confirmación por email y SMS, con depósitos opcionales cuando quieras.",
    ogDescription:
      "Reservas online para restaurantes, salones, bares y negocios de servicios — un enlace, confirmaciones automáticas y depósitos opcionales.",
  },
  header: {
    nav: { growth: "Crecimiento", pricing: "Precios", commerce: "Reservas", faq: "FAQ", liveDemo: "Demo en vivo" },
    login: "Iniciar sesión",
    signup: "Prueba gratis",
    tryBookingDemo: "Probar demo de reservas",
    openMenu: "Abrir menú",
    closeMenu: "Cerrar menú",
    languageSwitch: "English",
  },
  footer: {
    blurb:
      "Infraestructura de reservas para restaurantes, salones y cafés — un enlace, reservas online y confirmaciones sin complicaciones empresariales.",
    product: "Producto",
    company: "Empresa",
    links: {
      whatYouGet: "Qué incluye",
      bookingsPayments: "Reservas y pagos",
      tryAiDemo: "Probar demo IA",
      pricing: "Precios",
      faq: "FAQ",
      results: "Resultados",
      privacy: "Privacidad",
      terms: "Términos",
      liveBookingDemo: "Demo de reservas en vivo",
      login: "Iniciar sesión",
      signup: "Registrarse",
      dataHosting: "Alojamiento de datos (Supabase UE)",
      privacySub: "Privacidad y subprocesadores",
    },
    copyright: "Hecho para locales con mucho movimiento — no para dashboards.",
  },
  hero: {
    eyebrow: "Un enlace de reservas — depósitos con tarjeta opcionales",
    title: "Tu página de reservas en unos 30 minutos — consultas y depósitos en un solo enlace.",
    subtitle:
      "Comparte un enlace con tus clientes. Eligen día, estilista o mesa y quedan reservados — con confirmación por email y SMS. Activa depósitos con tarjeta cuando quieras asegurar mesa o entrada.",
    book247: "Reserva online 24/7",
    evenClosed: "Incluso cuando cierras",
    ctaTrial: "Prueba gratis",
    ctaDemo: "Ver demo de reservas",
    bullet1: "Reservas y llamadas en un solo sitio",
    bullet2: "Restaurantes, salones, cafés y eventos",
    voiceLive: "Pulsa el micrófono morado — hablarás con nuestra recepcionista IA de demostración en vivo.",
    voicePreview: "Vista previa de la recepcionista IA — demo guiada mientras la voz en vivo no está disponible.",
  },
  goLive: {
    eyebrow: "En línea en ~30 minutos",
    title: "Tres pasos del registro a tu primera reserva.",
    subtitle: "Mira lo que ven tus clientes en una página real — luego empieza la prueba gratis y publica tu enlace.",
    cta: "Ver demo de reservas en vivo",
    stepLabel: (n) => `Paso ${n}`,
    steps: [
      { title: "Configura tu flujo", body: "Mesas, citas o eventos — unos 5 minutos en el panel." },
      { title: "Activa depósitos (opcional)", body: "Configuración rápida si quieres cobrar con tarjeta. Las reservas gratis funcionan sin ello." },
      { title: "Comparte tu enlace /book", body: "Un enlace para Google, Instagram y tu recepcionista IA." },
    ],
  },
  growth: {
    eyebrow: "Pensado para resultados",
    title: "El crecimiento se siente fácil — porque lo aburrido desaparece.",
    subtitle: `Sin dashboards que vigilar. Booking (£${BOOKING_MONTHLY_GBP}/mes) incluye enlace público, calendario y depósitos online opcionales. Pro (£${PRO_MONTHLY_GBP}/mes) añade recepcionista IA con minutos mensuales limitados.`,
    examplePrefix: "Ejemplo:",
    blocks: [
      { title: "No pierdas reservas", body: "Tu enlace /book funciona 24/7 — los clientes reservan aunque cierres. Pro añade recepcionista IA por teléfono.", stat: "Más consultas fuera de horario" },
      { title: "Varios idiomas", body: "Ideal para calles concurridas — saluda en español e inglés (y más con Pro).", stat: "Más llamadas atendidas" },
      { title: "Citas automáticas", body: "Eligen hueco en tu enlace — confirmado en tu agenda con email y SMS si no cobras depósito.", stat: "Menos ida y vuelta" },
      { title: "Menos teléfono", body: "Menos llamadas repetitivas cuando reservan solos — tu equipo en sala.", stat: "~6 h/semana ahorradas (ejemplo)" },
      { title: "Una bandeja de reservas", body: "Consultas, depósitos opcionales y confirmaciones en un sitio — sin hojas de cálculo.", stat: "Depósitos opcionales" },
    ],
  },
  commerce: {
    eyebrow: "Reservas y pagos",
    title: "El cliente reserva → depósito opcional → el pago va a ti.",
    subtitle:
      "Un enlace para tu local — mesas, estilistas o noches con entradas. Empieza con reservas gratis; activa depósitos con tarjeta cuando quieras. Pro añade la recepcionista IA completa.",
    badge: "El dinero va a ti",
    card1Title: "Tus clientes te pagan a ti",
    card1Body:
      "Reservan con tu local, no con un marketplace. Con depósitos activos, el pago va a tu cuenta — Solvio gestiona la página, calendario y confirmaciones y cobra una pequeña comisión por depósito.",
    card1Bullets: [
      "Un enlace — Instagram, Google, buzón de voz, donde te encuentren.",
      "Depósitos opcionales — empieza con reservas gratis si prefieres.",
    ],
    card2Title: "Precios que crecen contigo",
    card2Body: `Booking desde £${BOOKING_MONTHLY_GBP}/mes — Pro con recepcionista IA desde £${PRO_MONTHLY_GBP}/mes. Enterprise para grupos desde £${ENTERPRISE_MONTHLY_GBP}/mes.`,
    capabilities: [
      { title: "Gestiona reservas", body: "Eligen hueco — confirmado en tu agenda al instante si no cobras depósito." },
      { title: "Cobra depósitos", body: "Pagos con tarjeta opcionales — siempre claros para el cliente." },
      { title: "Confirma visitas", body: "Email y SMS cuando quedan reservados — para que acudan." },
      { title: "Gestiona cambios", body: "Cancelaciones y días cerrados sincronizados en tu calendario." },
    ],
    restaurantFlow: {
      label: "Flujo restaurante",
      callerLabel: "Cliente:",
      callerQuote: "«Mesa para cuatro esta noche a las ocho.»",
      solvioLabel: "Solvio:",
      solvioBody:
        "consulta disponibilidad en vivo → guarda la solicitud → puede enviar enlace de depósito si los usas → confirma y avisa a tu equipo de sala.",
      tags: ["Reserva por voz", "Pagado a ti", "Confirmación al cliente"],
    },
    salonFlow: {
      label: "Flujo salón",
      callerLabel: "Cliente:",
      callerQuote: "«Corte mañana por la tarde.»",
      solvioLabel: "Solvio:",
      solvioBody:
        "muestra días disponibles → el cliente elige estilista y hora → puede pagar depósito opcional → confirmación por email al instante.",
      tags: ["Depósito online", "Confirmación email", "Días cerrados bloqueados"],
    },
    dashboardLayer: {
      eyebrow: "Capa de panel",
      body: "Tu equipo merece claridad — cada reserva, pago y confirmación en un espacio tranquilo mientras Solvio atiende el teléfono.",
    },
  },
  bookPreview: {
    eyebrow: "Lo que ven tus clientes",
    title: "Una página con tu marca — elige servicio, paga depósito, queda confirmado.",
    subtitle:
      "Tu logo, dirección y teléfono arriba. Reserva paso a paso para mesas, citas o eventos. Depósitos opcionales — cuando están activos, el cliente paga al local.",
    cta: "Abrir demo de reservas →",
    mockVenue: "Reserva en Café Aurora",
    mockHeading: "Pedir una cita",
    mockAddress: "Calle Mayor 12 · +34 600 123 456",
    mockSteps: [
      { title: "Elige un servicio", body: "Corte · 45 min · £35" },
      { title: "¿Qué día?", body: "Fechas disponibles resaltadas" },
      { title: "Tus datos", body: "Nombre, email, teléfono" },
    ],
    mockContinue: "Continuar · pagar depósito £10",
    trustLine: "Pago seguro · cobrado al local",
    mockConfirmation: "Confirmación por email al enviar",
  },
  pricing: {
    eyebrow: "Precios simples",
    title: `Booking desde £${BOOKING_MONTHLY_GBP}/mes — añade IA cuando quieras.`,
    subtitle: `Prueba gratis de ${BOOKING_TRIAL_DAYS} días — añade tu tarjeta para empezar. No se cobra hasta que termine la prueba; £${BOOKING_MONTHLY_GBP}/mes después salvo que canceles. Los depósitos van a tu cuenta. Comisión de plataforma (${TRIAL_PLATFORM_FEE_BPS / 100}% en prueba, ${BOOKING_PLATFORM_FEE_BPS / 100}% en Booking, ${PRO_PLATFORM_FEE_BPS / 100}% en Pro, ${ENTERPRISE_PLATFORM_FEE_BPS / 100}% en Enterprise) — siempre visible antes de pagar.`,
    footnote: `Pro incluye ${PRO_AI_MINUTES} minutos IA; Enterprise ${ENTERPRISE_AI_MINUTES.toLocaleString("es-ES")}+ para grupos y eventos.`,
    footnoteLink: "Probar demo de reservas →",
    tiers: [
      {
        name: "Booking",
        badge: "Empieza aquí",
        features: [
          "Enlace /book — mesas, citas y eventos",
          "Bandeja de operaciones y calendario",
          "Depósitos opcionales — pagados a ti",
          `${BOOKING_PLATFORM_FEE_BPS / 100}% comisión en depósitos`,
          `${BOOKING_DEMO_AI_MINUTES} min demo IA para probar una llamada`,
        ],
        cta: `Prueba de ${BOOKING_TRIAL_DAYS} días`,
      },
      {
        name: "Pro",
        badge: "Recepcionista IA",
        features: [
          "Todo lo de Booking",
          `${PRO_AI_MINUTES.toLocaleString("es-ES")} minutos IA / mes`,
          `${PRO_PLATFORM_FEE_BPS / 100}% comisión en depósitos`,
          "Configuración de voz e historial de llamadas",
          "Ask Solvio + pipeline de leads",
        ],
        cta: "Empezar con Pro",
      },
      {
        name: "Enterprise",
        badge: "Multi-local y volumen",
        features: [
          "Todo lo de Pro",
          `${ENTERPRISE_AI_MINUTES.toLocaleString("es-ES")} minutos IA / mes`,
          `${ENTERPRISE_PLATFORM_FEE_BPS / 100}% comisión en depósitos`,
          "Campañas salientes + locales ilimitados",
          "Soporte prioritario y marca personalizada",
        ],
        cta: "Hablar sobre Enterprise",
      },
    ],
  },
  faq: {
    eyebrow: "FAQ",
    title: "Preguntas frecuentes antes de registrarte",
    items: [
      {
        q: "¿Necesito tarjeta para empezar?",
        a: `Prueba gratis de ${BOOKING_TRIAL_DAYS} días — añade tu tarjeta para empezar. No se cobra hasta que termine la prueba; £${BOOKING_MONTHLY_GBP}/mes después salvo que canceles.`,
      },
      {
        q: "¿Quién recibe los depósitos?",
        a: "Tú. Los depósitos van a la cuenta de pagos de tu negocio — Solvio no es el comercio. Nosotros damos la página, bandeja y confirmaciones al cliente.",
      },
      {
        q: "¿Qué comisiones cobra Solvio?",
        a: `Booking cuesta £${BOOKING_MONTHLY_GBP}/mes tras la prueba. Comisión en depósitos: ${TRIAL_PLATFORM_FEE_BPS / 100}% en prueba, ${BOOKING_PLATFORM_FEE_BPS / 100}% en Booking, ${PRO_PLATFORM_FEE_BPS / 100}% en Pro, ${ENTERPRISE_PLATFORM_FEE_BPS / 100}% en Enterprise — siempre visible antes de pagar.`,
      },
      {
        q: "¿Puedo cancelar?",
        a: `Sí. Cancela cuando quieras desde el panel. Si cancelas antes de los ${BOOKING_TRIAL_DAYS} días de prueba, no se cobra £${BOOKING_MONTHLY_GBP}/mes.`,
      },
      {
        q: "¿Solo para restaurantes?",
        a: "No — salones, cafés, bares y eventos con entradas usan el mismo enlace /book. Elige mesas, citas, eventos o una mezcla al configurar.",
      },
      {
        q: "¿De verdad aumentarán mis reservas?",
        a: "Depende del local — pero muchos comparten un enlace /book en Google, Instagram y buzón de voz para que reserven cuando estás ocupado o cerrado. Los depósitos reducen ausencias. Los ejemplos de la web son ilustrativos, no casos verificados.",
      },
    ],
    legalPrefix: "Más detalle en nuestra",
    privacy: "Política de privacidad",
    terms: "Términos",
  },
  social: {
    eyebrow: "Resultados ilustrativos",
    title: "Lo que buscan equipos como el tuyo con un enlace de reservas.",
    disclaimer: "Ejemplos ilustrativos — no reseñas verificadas ni métricas auditadas.",
    stories: [
      { biz: "The Corner Table · Manchester", quote: "Publicamos el enlace /book en Instagram y dejamos de perder mesas en el buzón. Más reservas y los viernes vuelven a llenarse.", owner: "James O. · Propietario", metric: "+32% reservas", money: "£1.420/mes en depósitos" },
      { biz: "Bark Barber Studio · Leeds", quote: "Los sábados eran caos de ausencias. Los depósitos con tarjeta lo cambiaron — la gente sí viene.", owner: "Priya M. · Gerente", metric: "−41% ausencias", money: "~£680/mes recuperados" },
      { biz: "Glow Salon · Dublin", quote: "Recuperé seis horas a la semana. Sin DMs, llamadas perdidas ni citas en papel.", owner: "Aoife K. · Propietaria", metric: "6 h/semana ahorradas", money: "Equipo en sala" },
      { biz: "Riverside Bistro · Bristol", quote: "Las consultas fuera de horario morían en el contestador. Ahora reservan con el enlace aunque cerremos.", owner: "Tom H. · Director", metric: "+£2.1k/mes", money: "Ingresos fuera de horario" },
      { biz: "Studio Nineteen · Edinburgh", quote: "El primer mes llenamos dieciocho huecos vacíos solo con el enlace. Sin contratar a nadie para el teléfono.", owner: "Emma L. · Propietaria", metric: "18 huecos cubiertos", money: "Primeros 30 días" },
      { biz: "Harbor Events · Cork", quote: "Tres noches agotadas desde una sola página. Menos Excel, más tiempo con los artistas.", owner: "Sean B. · Eventos", metric: "3 noches agotadas", money: "Depósitos de entradas" },
    ],
  },
  trustStats: {
    stats: [
      { value: "+34%", label: "Más reservas", detail: "Media ilustrativa tras compartir un enlace /book" },
      { value: "£1.8k", label: "Depósitos / mes", detail: "Ejemplo: menos ausencias y fuera de horario" },
      { value: "6 h", label: "Ahorradas / semana", detail: "Menos teléfono — equipo en sala" },
      { value: "−41%", label: "Menos ausencias", detail: "Frecuente con depósito con tarjeta" },
    ],
    disclaimer: "Ejemplos ilustrativos — tus resultados variarán. No son reseñas verificadas.",
  },
  liveDemo: {
    eyebrow: "Cómo ayudamos",
    titleLive: "Pregunta a nuestra recepcionista lo que quieras sobre Solvio.",
    titlePreview: "Mira cómo encaja Solvio en tu local.",
    subtitleLive: "Pulsa el micrófono morado arriba — hablarás en vivo con nuestra demo de recepcionista IA.",
    subtitlePreview: "Prueba la demo de reservas abajo, o sube para la vista previa de voz si la IA en vivo no está configurada.",
    topics: [
      "Cómo la recepcionista IA atiende fuera de horario",
      "Reservas, mesas y eventos en una página",
      "Depósitos con tarjeta opcionales",
      "Configuración para restaurantes, salones y tours",
    ],
    ctaBooking: "Probar demo de reservas",
    ctaVoiceLive: "Hablar con recepcionista IA",
    ctaVoicePreview: "Vista previa de voz",
  },
  voice: {
    preparing: "Preparando voz…",
    panel: {
      productLine: "Recepcionista IA",
      eyebrowAssistant: "Habla con nosotros",
      idleBadge: "Pulsa el micrófono morado",
      starterBubbleLabel: "Tu recepcionista IA",
      starterBubbleIntro: "",
      starterBubbleMicCta: "Pulsa el micrófono morado para empezar a hablar.",
      footer: "Permite el micrófono cuando lo pida el navegador.",
      assistantLabel: "Recepcionista",
    },
    scenarios: {
      default: {
        productLine: "Solvio Voice",
        eyebrowAssistant: "Vista rápida",
        idleBadge: "Pulsa el mic — escucha la demo",
        emptyHint: "Demo breve — Solvio respondiendo por tu local.",
        footer: "Vista previa de voz — como lo oirán quienes llamen cuando conectes tu espacio.",
        assistantLabel: "Tu recepción",
        lines: [
          { role: "user", text: "¿Qué hace Solvio para locales con mucho movimiento?" },
          { role: "assistant", text: "Solvio gestiona reservas, envía confirmaciones que tus clientes reciben de verdad y puede cobrar depósitos opcionales — con calma, incluso fuera de horario." },
        ],
      },
      personal_voice: {
        productLine: "Recepcionista IA",
        eyebrowAssistant: "Habla con nosotros",
        idleBadge: "Pulsa el micrófono morado",
        emptyHint: "Pulsa el micrófono morado para hablar en vivo cuando las claves de voz estén configuradas.",
        footer: "Permite el micrófono cuando lo pida el navegador.",
        assistantLabel: "Recepcionista",
        lines: [
          { role: "assistant", text: "¡Hola! Soy la recepcionista de demostración de Solvio. Pulsa el micrófono morado para hablar conmigo en español." },
          { role: "user", text: "¿En qué me puedes ayudar?" },
          { role: "assistant", text: "Puedo explicarte reservas online, confirmaciones por email y SMS, depósitos opcionales y la recepcionista IA de Solvio para tu negocio." },
        ],
      },
    },
    scenarioApiDefaults: [
      { role: "assistant", text: "¡Hola! Soy la recepcionista de demostración de Solvio. Pulsa el micrófono morado para hablar conmigo en español." },
      { role: "user", text: "¿En qué me puedes ayudar?" },
      { role: "assistant", text: "Reservas online, confirmaciones automáticas y recepcionista IA — te explico cómo encaja Solvio en tu local." },
    ],
    demoSentence:
      "Elegir Solvio para automatizar tu negocio y organizar tus reservas es la mejor decisión.",
  },
  loadingDemo: "Cargando demo…",
};

const COPY: Record<MarketingLocale, MarketingCopy> = { en: EN, es: ES };

export function getMarketingCopy(locale: MarketingLocale = "en"): MarketingCopy {
  return COPY[locale] ?? COPY.en;
}

export function getSolvioVoiceDemoSentence(locale: MarketingLocale = "en"): string {
  return getMarketingCopy(locale).voice.demoSentence;
}
