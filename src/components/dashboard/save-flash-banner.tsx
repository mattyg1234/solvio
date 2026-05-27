"use client";

import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";

export function SaveFlashBanner({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onDismiss, 3200);
    return () => window.clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
      {message}
    </div>
  );
}
