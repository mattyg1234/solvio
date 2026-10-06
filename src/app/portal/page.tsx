import type { Metadata } from "next";

import { ClientPortal } from "@/components/marketing/client-portal";

export const metadata: Metadata = {
  title: "Client portal · Solvio Systems",
  description: "Sign in to the hub Solvio Systems runs for your business.",
  alternates: {
    canonical: "https://www.solviosystems.com/portal",
    languages: { en: "https://www.solviosystems.com/portal", es: "https://www.solviosystems.com/es/portal" },
  },
};

export default function PortalPage() {
  return <ClientPortal locale="en" />;
}
