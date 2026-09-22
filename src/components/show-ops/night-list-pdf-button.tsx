"use client";
import { useState } from "react";

import { SHOW_OPS_GHOST_BTN } from "@/components/show-ops/show-ops-page-header";

/**
 * "Print PDF" for a night list: the sheet laid out like the office's old
 * paper list, opened in a new tab ready to print or save.
 */
export function NightListPdfButton({
  view,
  date,
  island,
  showName,
  bookingIds,
  label = "Print PDF",
}: {
  view: "office" | "door" | "meals";
  date: string;
  island: string | null;
  showName: string | null;
  bookingIds: string[];
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy || !bookingIds.length}
        className={SHOW_OPS_GHOST_BTN}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const res = await fetch("/dashboard/show-ops/lists/night-list-pdf", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ view, date, island, showName, bookingIds }),
            });
            if (!res.ok) throw new Error(await res.text());
            const url = URL.createObjectURL(await res.blob());
            const tab = window.open(url, "_blank");
            if (!tab) {
              const a = document.createElement("a");
              a.href = url;
              a.download = `${view}-list-${date}.pdf`;
              a.click();
            }
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not prepare this list.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Preparing…" : label}
      </button>
      {error ? <span className="text-xs font-semibold text-rose-700">{error}</span> : null}
    </span>
  );
}
