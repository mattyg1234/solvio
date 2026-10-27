"use client";

import { Check, Loader2, RefreshCw, Settings2, ShieldCheck, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";

import { SHOW_OPS_GHOST_BTN, SHOW_OPS_PRIMARY_BTN } from "@/components/show-ops/show-ops-page-header";
import { connectHubSpotInboxAction, disconnectEmailInboxAction, saveEmailSendersAction } from "@/app/dashboard/show-ops/email-bookings/actions";
import type { SellerFound } from "@/lib/show-ops/email-bookings/types";

import { relativeTime } from "./relative-time";
import { SenderPick, senderChoices } from "./sender-pick";

const PAGE = "/dashboard/show-ops/email-bookings";
const CARD = "rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80";

type Provider = "gmail" | "microsoft" | "hubspot";

export type InboxSummary = {
  provider: Provider;
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

type SyncAnswer = { added: number; stored: number; more: boolean; slowed?: boolean };
const scanInbox = () => postJson<{ sellers: SellerFound[]; skipped: number }>("/api/show-ops/mail/scan");
const syncInbox = () => postJson<SyncAnswer>("/api/show-ops/mail/sync");

/**
 * One Refresh keeps bringing emails in, a batch at a time, while more are waiting. The pause keeps
 * the inbox under Gmail's per-minute read limit; after the last round the office presses again.
 */
const AUTO_ROUNDS = 20;
const ROUND_PAUSE_MS = 4000;
const plural = (n: number) => `${n} new booking email${n === 1 ? "" : "s"}`;
/** Opening Senders re-counts at most this often, so opening and closing it doesn't pile up Gmail reads. */
const RECOUNT_EVERY_MS = 5 * 60 * 1000;

const MARKS: Record<Provider, { letter: string; tone: string }> = {
  gmail: { letter: "G", tone: "bg-rose-50 text-rose-600" },
  microsoft: { letter: "O", tone: "bg-sky-50 text-sky-700" },
  hubspot: { letter: "H", tone: "bg-orange-50 text-orange-600" },
};

function ProviderMark({ provider }: { provider: Provider }) {
  const m = MARKS[provider];
  return <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${m.tone}`}>{m.letter}</span>;
}

/** Paste a HubSpot private app token (scope conversations.read). It goes to the server once and is stored encrypted. */
function HubSpotConnect({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function connect(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await connectHubSpotInboxAction(token);
      if (!r.ok) return setError(r.message);
      setToken("");
      router.replace(`${PAGE}?connected=1`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={connect} className="flex flex-col gap-2 rounded-xl p-4 ring-1 ring-orange-200 sm:col-span-2">
      <label htmlFor="hubspot-token" className="text-sm font-semibold text-slate-900">
        HubSpot private app token
      </label>
      <input
        id="hubspot-token"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="pat-eu1-…"
        className="rounded-lg px-3 py-2 text-sm ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-400"
      />
      <p className="text-xs text-slate-500">
        In HubSpot: Settings → Integrations → Private apps. The app needs the <span className="font-mono">conversations.read</span> scope. The key is
        stored encrypted and never shown again.
      </p>
      {error && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className={SHOW_OPS_PRIMARY_BTN} disabled={pending || token.trim().length < 20}>
          {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null} Connect HubSpot
        </button>
        <button type="button" className={SHOW_OPS_GHOST_BTN} onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
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
    if (!canManage) {
      return (
        <section className={`${CARD} text-sm text-slate-600`}>
          The bookings inbox hasn&rsquo;t been connected yet. Someone with Reservation (ops) access or above can connect it here.
        </section>
      );
    }
    return <ConnectChoice gmailReady={gmailReady} />;
  }
  if (justConnected && canManage) return <FirstScan inbox={inbox} />;
  return <ConnectedCard inbox={inbox} canManage={canManage} />;
}

function ConnectChoice({ gmailReady }: { gmailReady: boolean }) {
  const [hubspot, setHubspot] = useState(false);
  return (
    <section className={`${CARD} grid gap-5 lg:grid-cols-2`}>
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-slate-900">Connect the bookings inbox</h3>
        <p className="text-sm text-slate-600">
          Use the inbox GetYourGuide and the website shop send bookings to: sign in with Google for Gmail, or paste a HubSpot key if the emails land in
          HubSpot. Either way the Hub can only read.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {gmailReady ? (
            <a href="/api/show-ops/mail/oauth/start" className="flex items-center gap-3 rounded-xl p-4 ring-1 ring-slate-200 hover:bg-slate-50">
              <ProviderMark provider="gmail" />
              <span>
                <span className="block text-sm font-semibold text-slate-900">Gmail</span>
                <span className="block text-xs text-slate-500">Google Workspace (musichalltavern.com)</span>
              </span>
            </a>
          ) : (
            <span className="flex cursor-not-allowed items-center gap-3 rounded-xl p-4 opacity-60 ring-1 ring-slate-200" aria-disabled>
              <ProviderMark provider="gmail" />
              <span>
                <span className="block text-sm font-semibold text-slate-900">Gmail</span>
                <span className="block text-xs text-slate-500">Google sign-in keys not added on the server yet</span>
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={() => setHubspot(true)}
            aria-expanded={hubspot}
            className="flex items-center gap-3 rounded-xl p-4 text-left ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <ProviderMark provider="hubspot" />
            <span>
              <span className="block text-sm font-semibold text-slate-900">HubSpot</span>
              <span className="block text-xs text-slate-500">Emails in HubSpot&rsquo;s Conversations inbox</span>
            </span>
          </button>
          {hubspot && <HubSpotConnect onCancel={() => setHubspot(false)} />}
        </div>
      </div>
      <SafetyList />
    </section>
  );
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
  const [recounting, setRecounting] = useState(false);
  const recountedAt = useRef(0);
  const tracked = inbox.sellers.filter((s) => s.track);

  /** Refresh: bring in new booking emails, batch after batch, until the inbox is up to date. */
  async function refresh() {
    setSyncing(true);
    setNotice(null);
    let added = 0;
    let read = 0;
    try {
      for (let round = 1; ; round++) {
        const r = await syncInbox();
        added += r.added;
        read += r.stored;
        if (!r.more) {
          setNotice(added > 0 ? `${plural(added)} to check. Up to date.` : "Up to date: no new booking emails.");
          break;
        }
        router.refresh();
        if (round >= AUTO_ROUNDS) {
          setNotice(`${plural(added)} so far. More are waiting: press Refresh again in a minute.`);
          break;
        }
        setNotice(
          r.slowed
            ? `Gmail asked the Hub to slow down, so it's pausing between batches… ${plural(added)} so far.`
            : `Reading the inbox… ${read} email${read === 1 ? "" : "s"} read, ${plural(added)} so far.`,
        );
        await new Promise((resolve) => setTimeout(resolve, ROUND_PAUSE_MS));
      }
      router.refresh();
    } catch (e) {
      const why = e instanceof Error ? e.message : "Couldn't check the inbox.";
      setNotice(added > 0 ? `${why} (${plural(added)} came in before that.)` : why);
      if (added > 0) router.refresh();
    } finally {
      setSyncing(false);
    }
  }

  /** Opening Senders re-counts them in the background; the office's own edits are never overwritten. */
  function toggleSenders() {
    setSellers(inbox.sellers);
    const opening = !managing;
    setManaging(opening);
    if (!opening || Date.now() - recountedAt.current < RECOUNT_EVERY_MS) return;
    recountedAt.current = Date.now();
    setRecounting(true);
    scanInbox()
      .then((r) => setSellers((current) => (current === inbox.sellers ? r.sellers : current)))
      .catch(() => undefined)
      .finally(() => setRecounting(false));
  }

  function saveSenders() {
    startSave(async () => {
      const r = await saveEmailSendersAction(senderChoices(sellers));
      setNotice(r.ok ? "Senders saved. Press Refresh to bring in any newly ticked sender's emails." : r.message);
      if (r.ok) {
        setManaging(false);
        recountedAt.current = 0;
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
            onClick={toggleSenders}
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
          {recounting && (
            <p className="flex items-center gap-1.5 text-xs text-slate-500" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Re-counting each sender&rsquo;s emails…
            </p>
          )}
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
