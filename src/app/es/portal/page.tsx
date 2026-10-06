import type { Metadata } from "next";

import { ClientPortal } from "@/components/marketing/client-portal";

export const metadata: Metadata = {
  title: "Portal de clientes · Solvio Systems",
  description: "Entra en el hub que Solvio Systems gestiona para tu negocio.",
  alternates: {
    canonical: "https://www.solviosystems.com/es/portal",
    languages: { en: "https://www.solviosystems.com/portal", es: "https://www.solviosystems.com/es/portal" },
  },
};

export default function PortalPageEs() {
  return <ClientPortal locale="es" />;
}
