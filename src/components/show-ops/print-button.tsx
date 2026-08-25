"use client";

import { SHOW_OPS_GHOST_BTN } from "@/components/show-ops/show-ops-page-header";

export function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={SHOW_OPS_GHOST_BTN}>
      {label}
    </button>
  );
}
