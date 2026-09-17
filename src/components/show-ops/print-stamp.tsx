"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Every Show Ops printout carries when it was printed — a night list or bus
 * sheet from this afternoon must not be mistaken for tonight's. The time is
 * taken when the print dialog opens, not when the page loaded. Invoices are
 * left alone: they are dated documents in their own right.
 */
export function PrintStamp() {
  const pathname = usePathname();
  const [stamp, setStamp] = useState("");
  useEffect(() => {
    const update = () =>
      setStamp(
        new Date().toLocaleString("en-GB", {
          weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
        }),
      );
    update();
    window.addEventListener("beforeprint", update);
    return () => window.removeEventListener("beforeprint", update);
  }, []);
  if (pathname.startsWith("/dashboard/show-ops/invoices/")) return null;
  return <p className="hidden text-xs font-semibold text-black print:block">Printed {stamp}</p>;
}
