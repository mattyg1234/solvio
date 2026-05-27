"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, X } from "lucide-react";

export function BookingsSetupSavedBanner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const saved = searchParams.get("saved") === "1";

  if (!saved) return null;

  function dismiss() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("saved");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div
      role="status"
      className="flex items-start justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
        <p>
          <span className="font-semibold">Booking flow saved.</span> Add your first offering below, then copy your guest
          link to test.
        </p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-lg p-1 text-emerald-700 hover:bg-emerald-100"
        aria-label="Dismiss"
        onClick={dismiss}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
