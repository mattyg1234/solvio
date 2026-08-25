export type OutreachPreviewLang = "en" | "es";

/** `table` = restaurant reservations (default for outreach). `appointment` = barber/salon services. */
export type OutreachPreviewMode = "table" | "appointment";

export type OutreachPreviewCopy = {
  pageTitle: string;
  heading: string;
  hint: string;
  stepService: string;
  stepParty: string;
  stepDate: string;
  stepTime: string;
  stepDetails: string;
  pickParty: string;
  labelName: string;
  labelEmail: string;
  labelPhone: string;
  submit: string;
  submitting: string;
  successTitle: string;
  successBody: (businessName: string) => string;
  successNote: string;
  successNoteNoChannel: string;
  whatsappCta: string;
  poweredBy: string;
  slotAvailable: string;
  slotBooked: string;
  pickService: string;
  pickDate: string;
  pickTime: string;
  durationMin: (n: number) => string;
  defaultServices: {
    id: string;
    name: string;
    duration: number;
    priceLabel: string;
    /** Overrides e.g. "2.5 hours" for narrowboat hires */
    durationLabel?: string;
  }[];
};

const EN_TABLE: Omit<OutreachPreviewCopy, "pageTitle" | "defaultServices"> & {
  defaultServices: OutreachPreviewCopy["defaultServices"];
} = {
  heading: "Reserve a table",
  hint: "Choose party size, date, and time — just like your live Solvio table booking.",
  stepService: "",
  stepParty: "Party size",
  stepDate: "Pick a date",
  pickParty: "How many guests?",
  stepTime: "Pick a time",
  stepDetails: "Your details",
  labelName: "Full name",
  labelEmail: "Email",
  labelPhone: "Mobile number",
  submit: "Request table",
  submitting: "Sending your reservation…",
  successTitle: "Reservation received",
  successBody: (name) =>
    `${name} has your table request and will confirm shortly.`,
  successNote:
    "To activate live table booking on your restaurant and complete setup, message us on WhatsApp.",
  successNoteNoChannel:
    "To activate live table booking on your restaurant, contact Solvio to complete setup.",
  whatsappCta: "Continue on WhatsApp",
  poweredBy: "Powered by",
  slotAvailable: "Available",
  slotBooked: "Booked",
  pickService: "",
  pickDate: "Select a date to see times",
  pickTime: "Select a time",
  durationMin: (n) => `${n} min`,
  defaultServices: [],
};

const EN_APPT: typeof EN_TABLE = {
  heading: "Book an appointment",
  hint: "Choose a service, then pick a day and time.",
  stepService: "Choose your service",
  stepParty: "",
  stepDate: "Pick a date",
  pickParty: "",
  stepTime: "Pick a time",
  stepDetails: "Your details",
  labelName: "Full name",
  labelEmail: "Email",
  labelPhone: "Mobile number",
  submit: "Request booking",
  submitting: "Sending your request…",
  successTitle: "Request received",
  successBody: (name) =>
    `${name} has your details on file and will confirm your slot shortly.`,
  successNote:
    "To activate this booking page on your business and complete setup, message us on WhatsApp.",
  successNoteNoChannel:
    "To activate this booking page on your business, contact Solvio to complete setup.",
  whatsappCta: "Continue on WhatsApp",
  poweredBy: "Powered by",
  slotAvailable: "Available",
  slotBooked: "Booked",
  pickService: "Select a service to continue",
  pickDate: "Select a date to see times",
  pickTime: "Select a time",
  durationMin: (n) => `${n} min`,
  defaultServices: [
    { id: "1", name: "Haircut", duration: 45, priceLabel: "£35" },
    { id: "2", name: "Beard trim", duration: 30, priceLabel: "£22" },
    { id: "3", name: "Cut + beard", duration: 60, priceLabel: "£48" },
  ],
};

const EN_APPT_VALET: typeof EN_TABLE = {
  ...EN_APPT,
  heading: "Book your valet",
  hint: "Choose a package, pick a day and time — pay a deposit when you go live.",
  defaultServices: [
    { id: "1", name: "Mini valet", duration: 60, priceLabel: "from £45" },
    { id: "2", name: "Full valet", duration: 120, priceLabel: "from £85" },
    { id: "3", name: "Detail + paint enhancement", duration: 180, priceLabel: "from £120" },
  ],
};

const EN_APPT_BEAUTY: typeof EN_TABLE = {
  ...EN_APPT,
  heading: "Book your appointment",
  hint: "Choose your treatment, pick a day and time — optional deposit when you go live.",
  defaultServices: [
    { id: "1", name: "Threading & brows", duration: 25, priceLabel: "from £8" },
    { id: "2", name: "Ladies cut & blow dry", duration: 60, priceLabel: "from £35" },
    { id: "3", name: "Full leg wax", duration: 45, priceLabel: "from £28" },
  ],
};

const EN_APPT_HAIR: typeof EN_TABLE = {
  ...EN_APPT,
  heading: "Book your appointment",
  hint: "Choose your service, pick a day and time — new colour clients need consultation (as on your site).",
  defaultServices: [
    { id: "1", name: "Cut and blowdry", duration: 75, durationLabel: "from 1 hr", priceLabel: "from £65" },
    { id: "2", name: "Blowdry", duration: 45, durationLabel: "45 min – 1 hr", priceLabel: "from £45" },
    { id: "3", name: "Balayage refresh", duration: 120, durationLabel: "from 2 hr", priceLabel: "from £130" },
  ],
};

const EN_APPT_BOAT: typeof EN_TABLE = {
  ...EN_APPT,
  heading: "Book your hire",
  hint: "Choose your craft, pick a date and time — deposit on booking when you go live.",
  defaultServices: [
    {
      id: "skippered-narrowboat",
      name: "Skippered narrowboat (Somersun)",
      duration: 150,
      durationLabel: "2.5 hours · up to 12 guests",
      priceLabel: "£180",
    },
    {
      id: "self-drive-narrowboat",
      name: "Self-drive narrowboat (Somerdays)",
      duration: 450,
      durationLabel: "7 hours · max 8 people · £100 deposit",
      priceLabel: "£195",
    },
    {
      id: "wheelchair-boat",
      name: "Wheelchair accessible boat",
      duration: 60,
      durationLabel: "1 hour · with skipper",
      priceLabel: "£60",
    },
    {
      id: "canadian-canoe",
      name: "Canadian canoe",
      duration: 60,
      durationLabel: "1 hour · 2 people",
      priceLabel: "£15",
    },
    {
      id: "sup",
      name: "Stand-up paddleboard (SUP)",
      duration: 60,
      durationLabel: "1 hour",
      priceLabel: "£12.50",
    },
    {
      id: "big-billie-sup",
      name: "Big Billie paddle board",
      duration: 60,
      durationLabel: "1 hour · up to 8 people",
      priceLabel: "£50",
    },
    {
      id: "kayak-single",
      name: "Kayak (single)",
      duration: 60,
      durationLabel: "1 hour",
      priceLabel: "£12.50",
    },
    {
      id: "kayak-twin",
      name: "Kayak (twin)",
      duration: 60,
      durationLabel: "1 hour · 2 adults",
      priceLabel: "£15",
    },
    {
      id: "rafted-canoes",
      name: "Rafted canoes",
      duration: 60,
      durationLabel: "1 hour · up to 6 people",
      priceLabel: "£20",
    },
  ],
};

const ES_TABLE: typeof EN_TABLE = {
  heading: "Reservar mesa",
  hint: "Elige comensales, fecha y hora — como en tu reserva de mesas en Solvio.",
  stepService: "",
  stepParty: "Comensales",
  stepDate: "Elige una fecha",
  pickParty: "¿Cuántos comensales?",
  stepTime: "Elige una hora",
  stepDetails: "Tus datos",
  labelName: "Nombre completo",
  labelEmail: "Correo electrónico",
  labelPhone: "Teléfono móvil",
  submit: "Solicitar mesa",
  submitting: "Enviando tu reserva…",
  successTitle: "Reserva recibida",
  successBody: (name) =>
    `${name} ya tiene tu solicitud de mesa y la confirmará en breve.`,
  successNote:
    "Para activar reservas de mesa en tu restaurante y completar el alta, escríbenos por WhatsApp.",
  successNoteNoChannel:
    "Para activar reservas de mesa en tu restaurante, contacta con Solvio para completar el alta.",
  whatsappCta: "Continuar por WhatsApp",
  poweredBy: "Con tecnología de",
  slotAvailable: "Disponible",
  slotBooked: "Reservado",
  pickService: "",
  pickDate: "Selecciona una fecha para ver horarios",
  pickTime: "Selecciona una hora",
  durationMin: (n) => `${n} min`,
  defaultServices: [],
};

const ES_APPT: typeof EN_TABLE = {
  heading: "Reservar cita",
  hint: "Elige un servicio, luego día y hora.",
  stepService: "Elige tu servicio",
  stepParty: "",
  stepDate: "Elige una fecha",
  pickParty: "",
  stepTime: "Elige una hora",
  stepDetails: "Tus datos",
  labelName: "Nombre completo",
  labelEmail: "Correo electrónico",
  labelPhone: "Teléfono móvil",
  submit: "Solicitar reserva",
  submitting: "Enviando tu solicitud…",
  successTitle: "Solicitud recibida",
  successBody: (name) =>
    `${name} ya tiene tus datos y confirmará tu cita en breve.`,
  successNote:
    "Para activar esta página de reservas en tu negocio y completar el alta, escríbenos por WhatsApp.",
  successNoteNoChannel:
    "Para activar esta página de reservas en tu negocio, contacta con Solvio para completar el alta.",
  whatsappCta: "Continuar por WhatsApp",
  poweredBy: "Con tecnología de",
  slotAvailable: "Disponible",
  slotBooked: "Reservado",
  pickService: "Selecciona un servicio para continuar",
  pickDate: "Selecciona una fecha para ver horarios",
  pickTime: "Selecciona una hora",
  durationMin: (n) => `${n} min`,
  defaultServices: [
    { id: "1", name: "Corte de pelo", duration: 45, priceLabel: "35 €" },
    { id: "2", name: "Arreglo de barba", duration: 30, priceLabel: "22 €" },
    { id: "3", name: "Corte + barba", duration: 60, priceLabel: "48 €" },
  ],
};

export function outreachPreviewLang(raw: string | undefined): OutreachPreviewLang {
  return raw?.trim().toLowerCase() === "es" ? "es" : "en";
}

export function outreachPreviewMode(raw: string | undefined): OutreachPreviewMode {
  return raw?.trim().toLowerCase() === "appointment" ? "appointment" : "table";
}

function isValetingBusinessName(name: string): boolean {
  return /valeting|detailing|valet|car wash|auto detail/i.test(name);
}

function isBeautySalonBusinessName(name: string): boolean {
  return /beauty|salon|aesthetic|dermal|nails|spa|lash|brow/i.test(name);
}

function isHairSalonBusinessName(name: string): boolean {
  return /queens park|hair salon|haircut|barber|styling|colour|color/i.test(name);
}

function isBoatHireBusinessName(name: string): boolean {
  return /boat|marine|mooring|canal|yacht|hire.*craft/i.test(name);
}

export function outreachPreviewCopy(
  lang: OutreachPreviewLang,
  businessName: string,
  mode: OutreachPreviewMode = "table",
): OutreachPreviewCopy {
  const isTable = mode === "table";
  const base =
    lang === "es"
      ? isTable
        ? ES_TABLE
        : ES_APPT
      : isTable
        ? EN_TABLE
        : isBoatHireBusinessName(businessName)
          ? EN_APPT_BOAT
          : isValetingBusinessName(businessName)
            ? EN_APPT_VALET
            : isHairSalonBusinessName(businessName)
              ? EN_APPT_HAIR
              : isBeautySalonBusinessName(businessName)
                ? EN_APPT_BEAUTY
                : EN_APPT;
  const pageTitle =
    lang === "es"
      ? isTable
        ? `Reservar mesa · ${businessName}`
        : `Reservar · ${businessName}`
      : isTable
        ? `Reserve a table · ${businessName}`
        : `Book · ${businessName}`;
  return { ...base, pageTitle };
}

export function outreachPreviewWhatsAppFinishMessage(
  lang: OutreachPreviewLang,
  businessName: string,
  mode: OutreachPreviewMode = "table",
): string {
  if (lang === "es") {
    return mode === "table"
      ? `Hola — acabo de probar la reserva de mesa de ${businessName} (demo Solvio). Me gustaría activarla: ¿hablamos del setup (100 € + 50 €/mes)?`
      : `Hola — acabo de probar la reserva online de ${businessName} (demo Solvio). Me gustaría activarla: ¿podemos hablar del setup (100 € + 50 €/mes)?`;
  }
  return mode === "table"
    ? `Hi — I just tried the table booking preview for ${businessName} (Solvio demo). I'd like to activate it — can we talk about setup (£100 + £50/mo)?`
    : `Hi — I just tried the online booking preview for ${businessName} (Solvio demo). I'd like to activate it — can we talk about setup (£100 + £50/mo)?`;
}
