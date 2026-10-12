"use client";

import { Check, Loader2, Mail, RefreshCw, Settings2, ShieldCheck, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { SHOW_OPS_GHOST_BTN, SHOW_OPS_PRIMARY_BTN } from "@/components/show-ops/show-ops-page-header";
import { disconnectEmailInboxAction, saveEmailSendersAction } from "@/app/dashboard/show-ops/email-bookings/actions";
import type { SellerFound } from "@/lib/show-ops/email-bookings/types";

import { relativeTime } from "./relative-time";
import { SenderPick, senderChoices } from "./sender-pick";

const PAGE = "/dashboard/show-ops/email-bookings";
const CARD = "rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80";

export type InboxSummary = {
  provider: "gmail" | "microsoft";
  address: string;
  skipped: number;
  sellers: SellerFound[];
  lastSyncAt: string | null;
};

async function postJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "POST" });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
  return data;
}

type SyncAnswer = { added: number; stored: number; more: boolean };
const scanInbox = () => postJson<{ sellers: SellerFound[]; skipped: number }>("/api/show-ops/mail/scan");
const syncInbox = () => postJson<SyncAnswer>("/api/show-ops/mail/sync");

function ProviderMark({ provider }: { provider: "gmail" | "microsoft" }) {
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${provider === "gmail" ? "bg-rose-50 text-rose-600" : "bg-sky-50 text-sky-700"}`}>
      {provider === "gmail" ? "G" : "O"}
    </span>
  );
}

function SafetyList() {
  return (
    <div className="rounded-xl bg-slate-50 p-4 text-sm ring-1 ring-slate-200/70">
      <p className="flex items-center gap-1.5 font-semibold text-slate-900">
        <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden /> Only booking emails
      </p>
      <ul className="mt-2 flex flex-col gap-1.5 text-slate-600">
        {[
          "The Hub only reads emails from the senders you tick",
          "Everything else in the inbox is left alone and never stored",
          "Read-only: it can't send, delete or move emails",
          "Nothing becomes a booking until someone checks it and presses Save",
        ].map((t) => (
          <li key={t} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Connect, pick senders, refresh. The top card of the Email bookings page. */
export function EmailInboxCard({
  inbox,
  gmailReady,
  canManage,
  justConnected,
}: {
  inbox: InboxSummary | null;
  gmailReady: boolean;
  canManage: boolean;
  justConnected: boolean;
}) {
  if (!inbox) {
    if (!gmailReady) {
      return (
        <section className={CARD}>
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Mail className="h-5 w-5 text-slate-400" aria-hidden /> Gmail connection isn&rsquo;t switched on yet
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Once Solvio adds the Google sign-in keys on the server, the office can connect the bookings inbox here. Until then, bookings are entered as
            usual from New booking.
          </p>
        </section>
      );
    }
    if (!canManage) {
      return (
        <section className={`${CARD} text-sm text-slate-600`}>
          The bookings inbox hasn&rsquo;t been connected yet. Someone with Reservation (ops) access or above can connect it here.
        </section>
      );
    }
    return (
      <section className={`${CARD} grid gap-5 lg:grid-cols-2`}>
        <div className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-slate-900">Connect the bookings inbox</h3>
          <p className="text-sm text-slate-600">
            Use the inbox GetYourGuide and the website shop send bookings to. You&rsquo;ll sign in with Google; the Hub never sees the password and can only
            read.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <a href="/api/show-ops/mail/oauth/start" className="flex items-center gap-3 rounded-xl p-4 ring-1 ring-slate-200 hover:bg-slate-50">
              <ProviderMark provider="gmail" />
              <span>
                <span className="block text-sm font-semibold text-slate-900">Gmail</span>
                <span className="block text-xs text-slate-500">Google Workspace (musichalltavern.com)</span>
              </span>
            </a>
            <span className="flex cursor-not-allowed items-center gap-3 rounded-xl p-4 opacity-60 ring-1 ring-slate-200" aria-disabled>
              <ProviderMark provider="microsoft" />
              <span>
                <span className="block text-sm font-semibold text-slate-900">Outlook</span>
                <span className="block text-xs text-slate-500">Coming soon</span>
              </span>
            </span>
          </div>
        </div>
        <SafetyList />
      </section>
    );
  }
  if (justConnected && canManage) return <FirstScan inbox={inbox} />;
  return <ConnectedCard inbox={inbox} canManage={canManage} />;
}

/** Straight after signing in: search the inbox, tick senders, save, bring their emails in. */
function FirstScan({ inbox }: { inbox: InboxSummary }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"scanning" | "pick" | "saving">("scanning");
  const [sellers, setSellers] = useState<SellerFound[]>(inbox.sellers);
  const [skipped, setSkipped] = useState(inbox.skipped);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    scanInbox()
      .then((r) => {
        if (cancelled) return;
        setSellers(r.sellers);
        setSkipped(r.skipped);
        setPhase("pick");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Couldn't search the inbox.");
        setPhase("pick");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setPhase("saving");
    setError(null);
    try {
      const saved = await saveEmailSendersAction(senderChoices(sellers));
      if (!saved.ok) throw new Error(saved.message);
      await syncInbox();
      router.replace(PAGE);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
      setPhase("pick");
    }
  }

  if (phase === "scanning") {
    return (
      <section className={`${CARD} flex flex-col items-center gap-3 py-10 text-center`} role="status">
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: "var(--show-ops-primary,#7c3aed)" }} aria-hidden />
        <p className="text-base font-semibold text-slate-900">Looking for booking emails in {inbox.address}</p>
        <p className="text-sm text-slate-500">Checking the last 90 days for GetYourGuide, the website shop and other sellers.</p>
      </section>
    );
  }
  const tracked = sellers.filter((s) => s.track).length;
  return (
    <section className={`${CARD} flex flex-col gap-4`}>
      {error && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">{error}</p>}
      <SenderPick address={inbox.address} sellers={sellers} skipped={skipped} onSellers={setSellers} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={SHOW_OPS_PRIMARY_BTN} disabled={tracked === 0 || phase === "saving"} onClick={() => void save()}>
          {phase === "saving" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
          Track {tracked} sender{tracked === 1 ? "" : "s"}
        </button>
        <button type="button" className={SHOW_OPS_GHOST_BTN} onClick={() => (router.replace(PAGE), router.refresh())}>
          Later
        </button>
        {tracked === 0 && <span className="text-sm text-slate-500">Tick at least one sender, or add one.</span>}
      </div>
    </section>
  );
}

function ConnectedCard({ inbox, canManage }: { inbox: InboxSummary; canManage: boolean }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [sellers, setSellers] = useState<SellerFound[]>(inbox.sellers);
  const [saving, startSave] = useTransition();
  const [confirmOff, setConfirmOff] = useState(false);
  const tracked = inbox.sellers.filter((s) => s.track);

  /** Refresh: re-count senders, then bring in new booking emails. */
  async function refresh() {
    setSyncing(true);
    setNotice(null);
    try {
      await scanInbox().catch(() => undefined);
      const r = await syncInbox();
      setNotice(
        r.added > 0
          ? `${r.added} new booking email${r.added === 1 ? "" : "s"} to check.${r.more ? " More are coming: press Refresh again in a moment." : ""}`
          : r.more
            ? "Still bringing emails in. Press Refresh again in a moment."
            : "Up to date: no new booking emails.",
      );
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn't check the inbox.");
    } finally {
      setSyncing(false);
    }
  }

  function saveSenders() {
    startSave(async () => {
      const r = await saveEmailSendersAction(senderChoices(sellers));
      setNotice(r.ok ? "Senders saved. Press Refresh to bring in any newly ticked sender's emails." : r.message);
      if (r.ok) {
        setManaging(false);
        router.refresh();
      }
    });
  }

  function disconnect() {
    startSave(async () => {
      const r = await disconnectEmailInboxAction();
      setNotice(r.ok ? (r.message ?? "Disconnected.") : r.message);
      if (r.ok) router.refresh();
    });
  }

  return (
    <section className={`${CARD} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center gap-3">
        <ProviderMark provider={inbox.provider} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{inbox.address}</p>
          <p className="text-xs text-slate-500" suppressHydrationWarning>
            Bookings only · {inbox.skipped.toLocaleString("en-GB")} other emails skipped and not stored · last checked {relativeTime(inbox.lastSyncAt)}
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">Connected</span>
        <button type="button" className={SHOW_OPS_GHOST_BTN} onClick={() => void refresh()} disabled={syncing}>
          {syncing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />} Refresh
        </button>
        {canManage && (
          <button
            type="button"
            className={SHOW_OPS_GHOST_BTN}
            onClick={() => (setSellers(inbox.sellers), setManaging((v) => !v))}
            aria-expanded={managing}
          >
            <Settings2 className="mr-1.5 h-4 w-4" aria-hidden /> Senders
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tracked.length ? (
          tracked.map((s) => (
            <span key={s.key} className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-800 ring-1 ring-violet-100">
              {s.name}
            </span>
          ))
        ) : (
          <span className="text-sm text-amber-800">No senders ticked yet{canManage ? ": open Senders and tick GetYourGuide and the website shop." : "."}</span>
        )}
      </div>
      {notice && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200" role="status">
          {notice}
        </p>
      )}
      {managing && canManage && (
        <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
          <SenderPick address={inbox.address} sellers={sellers} skipped={inbox.skipped} onSellers={setSellers} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={SHOW_OPS_PRIMARY_BTN} disabled={saving} onClick={saveSenders}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null} Save senders
            </button>
            <button type="button" className={SHOW_OPS_GHOST_BTN} onClick={() => setManaging(false)}>
              Cancel
            </button>
            <span className="flex-1" />
            {confirmOff ? (
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-600">Disconnect {inbox.address}? Emails and bookings already made stay.</span>
                <button type="button" className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white" disabled={saving} onClick={disconnect}>
                  Disconnect
                </button>
                <button type="button" className="text-sm font-semibold text-slate-600" onClick={() => setConfirmOff(false)}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmOff(true)} className="flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline">
                <Unplug className="h-3.5 w-3.5" aria-hidden /> Disconnect this inbox
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
