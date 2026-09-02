"use client";

import { useEffect, useState } from "react";

/**
 * A clock time that matches the clock on the wall where it is being read.
 *
 * Door timestamps are stored in UTC and used to be rendered on the server in
 * Canaries time only. Anyone reading the door screen from somewhere else — the
 * UK office in winter, the mainland in any season — saw a time that disagreed
 * with their phone. This renders the server's Canaries time first (so the HTML
 * is stable), then re-renders in the device's own zone once mounted, and keeps
 * the Canaries time as a tooltip so the two can be reconciled.
 */
export function LocalTime({ iso, fallback, className }: { iso: string; fallback: string; className?: string }) {
  const [text, setText] = useState(fallback);
  const [zone, setZone] = useState("");

  useEffect(() => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;
    const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
    setText(fmt.format(d));
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
  }, [iso]);

  return (
    <time dateTime={iso} className={className} title={`${fallback} Canaries time${zone ? ` · shown in ${zone}` : ""}`}>
      {text}
    </time>
  );
}
