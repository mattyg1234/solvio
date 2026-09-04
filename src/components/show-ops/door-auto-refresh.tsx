"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

/**
 * Keeps the Door page live without anyone pulling to refresh.
 *
 * Joel: two phones at the door, plus the office — everyone should see the
 * same arrivals. Re-fetches the server page every few seconds while the tab
 * is actually on screen, stops when it is hidden (battery, and no point) and
 * refreshes straight away when it comes back.
 */
export function DoorAutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [stamp, setStamp] = useState("");

  useEffect(() => {
    const refresh = () => start(() => router.refresh());
    let timer: number | null = null;
    const stop = () => {
      if (timer != null) window.clearInterval(timer);
      timer = null;
    };
    const run = () => {
      stop();
      timer = window.setInterval(refresh, seconds * 1000);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
        run();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") run();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, seconds]);

  // Stamp the moment each refresh lands (and once on mount), in the phone's own clock.
  useEffect(() => {
    if (pending) return;
    const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    setStamp(fmt.format(new Date()));
  }, [pending]);

  return (
    <p className="flex items-center gap-1.5 text-xs text-slate-400 print:hidden" aria-live="polite">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${pending ? "bg-amber-400" : "bg-emerald-500"}`} aria-hidden />
      Live{pending ? " · updating…" : stamp ? ` · updated ${stamp}` : ""}
    </p>
  );
}
