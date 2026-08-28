"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * The Partners page filters as you type; the bookings desk asked for the same feel.
 * The rows are server-paginated, so instead of filtering in the browser this
 * re-submits the surrounding GET form a beat after typing stops.
 */
export function ShowOpsLiveFilterForm({
  children,
  className,
  action,
  delayMs = 350,
}: {
  children: React.ReactNode;
  className?: string;
  action: string;
  delayMs?: number;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function submitSoon(wait: number) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const form = formRef.current;
      if (!form) return;
      const params = new URLSearchParams();
      for (const [key, value] of new FormData(form).entries()) {
        const v = String(value).trim();
        if (v) params.set(key, v);
      }
      const qs = params.toString();
      start(() => router.replace(qs ? `${action}?${qs}` : action, { scroll: false }));
    }, wait);
  }

  return (
    <form
      ref={formRef}
      method="get"
      action={action}
      className={className}
      data-pending={pending ? "1" : undefined}
      // Typing waits for a pause; picking from a dropdown or a date fires at once.
      onInput={(e) => {
        const el = e.target as HTMLElement;
        submitSoon(el instanceof HTMLInputElement && (el.type === "text" || el.type === "search") ? delayMs : 0);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        submitSoon(0);
      }}
    >
      {children}
    </form>
  );
}
