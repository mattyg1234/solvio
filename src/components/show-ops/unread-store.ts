"use client";

import { useSyncExternalStore } from "react";

/**
 * An unread count for a nav badge. One shared poller per endpoint however many
 * navs are mounted (desktop rail and mobile bar both are), polling only while
 * the tab is visible. A page can push a fresher number through the event so the
 * badge moves the moment something is read.
 */
export function createUnreadStore(endpoint: string, eventName: string, pollMs = 60_000) {
  let total = 0;
  let listeners = new Set<() => void>();
  let timer: number | null = null;
  let stopped = false;
  let inFlight = false;

  function emit(next: number) {
    if (next === total) return;
    total = next;
    for (const l of listeners) l();
  }

  async function poll() {
    if (stopped || inFlight || document.visibilityState !== "visible") return;
    inFlight = true;
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      // Not staff (or signed out): no badge, stop asking.
      if (res.status === 401) {
        stopped = true;
        stop();
        emit(0);
        return;
      }
      if (!res.ok) return;
      const body = (await res.json()) as { total?: number };
      emit(Math.max(0, Number(body.total) || 0));
    } catch {
      /* offline — try again next tick */
    } finally {
      inFlight = false;
    }
  }

  function onVisibility() {
    if (document.visibilityState === "visible") void poll();
  }

  function onPublished(e: Event) {
    const n = Number((e as CustomEvent<number>).detail);
    if (Number.isFinite(n)) emit(Math.max(0, n));
  }

  function start() {
    if (timer != null || stopped) return;
    void poll();
    timer = window.setInterval(() => void poll(), pollMs);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(eventName, onPublished);
  }

  function stop() {
    if (timer != null) window.clearInterval(timer);
    timer = null;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener(eventName, onPublished);
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    start();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        stop();
        listeners = new Set();
      }
    };
  }

  const noopSubscribe = () => () => {};

  return {
    publish(n: number) {
      if (typeof window === "undefined") return;
      window.dispatchEvent(new CustomEvent(eventName, { detail: n }));
    },
    /** 0 when disabled (no nav item for this person). */
    useCount(enabled: boolean): number {
      const value = useSyncExternalStore(enabled ? subscribe : noopSubscribe, () => total, () => 0);
      return enabled ? value : 0;
    },
  };
}
