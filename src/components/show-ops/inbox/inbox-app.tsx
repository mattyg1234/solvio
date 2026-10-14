"use client";

import { Loader2, MessageSquarePlus, Search, Settings2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { markInboxReadAction } from "@/app/dashboard/show-ops/inbox/actions";
import { ChatAvatar, relTime, UnreadBadge, useNow } from "@/components/show-ops/chat/chat-parts";
import { InboxNewForm } from "@/components/show-ops/inbox/inbox-new";
import { InboxThread } from "@/components/show-ops/inbox/inbox-thread";
import { ChannelTag } from "@/components/show-ops/inbox/inbox-parts";
import { publishInboxUnread } from "@/components/show-ops/inbox/use-inbox-unread";
import type { ChatPerson } from "@/lib/show-ops/chat/types";
import {
  formatPhone,
  INBOX_POLL_MS,
  inboxFilters,
  matchesInboxFilter,
  matchesInboxSearch,
  type InboxFilter,
} from "@/lib/show-ops/inbox/logic";
import type {
  InboxBookingSummary,
  InboxConnectionSummary,
  InboxConversation,
  InboxMessage,
  InboxSyncResponse,
} from "@/lib/show-ops/inbox/types";
import { cn } from "@/lib/utils";

const DESKTOP_QUERY = "(min-width: 768px)";

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(DESKTOP_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

const FILTER_LABEL: Record<InboxFilter, string> = {
  unassigned: "Unassigned",
  mine: "Mine",
  sent: "Sent to me",
  all: "All open",
  closed: "Closed",
};

function mergeMessages(current: InboxMessage[], incoming: InboxMessage[]): InboxMessage[] {
  if (!incoming.length) return current;
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

type PollBody = InboxSyncResponse & { people?: ChatPerson[]; error?: string };

type Thread = { id: string | null; list: InboxMessage[]; booking: InboxBookingSummary | null };

const NO_CONNECTION: InboxConnectionSummary = { connected: false, whatsapp: false, sms: false, reopenTemplate: false, live: false };

export function ShowOpsInboxApp({
  meId,
  seesAll,
  canSeeBookings,
  canManageSettings,
  initialConversationId,
}: {
  meId: string;
  seesAll: boolean;
  canSeeBookings: boolean;
  canManageSettings: boolean;
  initialConversationId: string | null;
}) {
  const now = useNow();
  const isDesktop = useIsDesktop();
  const filters = inboxFilters(seesAll);

  const [people, setPeople] = useState<ChatPerson[]>([]);
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [connection, setConnection] = useState<InboxConnectionSummary>(NO_CONNECTION);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<InboxFilter>(filters[0]);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(initialConversationId);
  const [thread, setThread] = useState<Thread>({ id: null, list: [], booking: null });
  const [mobileView, setMobileView] = useState<"list" | "chat">(initialConversationId ? "chat" : "list");
  const [showNew, setShowNew] = useState(false);

  const activeRef = useRef<string | null>(initialConversationId);
  const threadRef = useRef(thread);
  const markedRef = useRef("");

  const refresh = useCallback(async (opts: { full?: boolean; withPeople?: boolean } = {}) => {
    const id = activeRef.current;
    const cur = threadRef.current;
    const incremental = !opts.full && id != null && cur.id === id && cur.list.length > 0;
    const params = new URLSearchParams();
    if (opts.withPeople) params.set("people", "1");
    if (id) params.set("c", id);
    if (incremental) {
      // Overlap by 30s so late commits and status changes are picked up; ids dedupe.
      const latest = cur.list.reduce((max, m) => (m.updatedAt > max ? m.updatedAt : max), cur.list[0].updatedAt);
      params.set("after", new Date(Date.parse(latest) - 30_000).toISOString());
    }
    let res: Response;
    try {
      res = await fetch(`/api/show-ops/inbox?${params.toString()}`, { cache: "no-store" });
    } catch {
      return;
    }
    const body = (await res.json().catch(() => ({}))) as PollBody;
    if (res.status === 403 && id) {
      // Not ours any more (sent on, or passed): back to the list.
      if (activeRef.current === id) {
        activeRef.current = null;
        setActiveId(null);
        setMobileView("list");
        window.history.replaceState(null, "", window.location.pathname);
      }
      setLoadError(body.error ?? null);
      return;
    }
    if (!res.ok) {
      setLoadError(body.error || "Could not load the inbox.");
      setLoaded(true);
      return;
    }
    setLoadError(null);
    setConversations(body.conversations ?? []);
    setConnection(body.connection ?? NO_CONNECTION);
    if (body.people) setPeople(body.people);
    setLoaded(true);
    publishInboxUnread(body.totalUnread ?? 0);
    if (id && body.messages && activeRef.current === id) {
      const latest = threadRef.current;
      const list = incremental && latest.id === id ? mergeMessages(latest.list, body.messages) : body.messages;
      const next = { id, list, booking: body.booking ?? null };
      threadRef.current = next;
      setThread(next);
    }
  }, []);

  const firstLoadRef = useRef(true);
  useEffect(() => {
    activeRef.current = activeId;
    const withPeople = firstLoadRef.current;
    firstLoadRef.current = false;
    void refresh({ full: true, withPeople });
  }, [activeId, refresh]);

  useEffect(() => {
    let timer: number | null = null;
    const tick = () => void refresh();
    const startTimer = () => {
      if (timer == null) timer = window.setInterval(tick, INBOX_POLL_MS);
    };
    const stopTimer = () => {
      if (timer != null) window.clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
        startTimer();
      } else stopTimer();
    };
    if (document.visibilityState === "visible") startTimer();
    document.addEventListener("visibilitychange", onVisibility);
    const peopleTimer = window.setInterval(() => void refresh({ withPeople: true }), 5 * 60_000);
    return () => {
      stopTimer();
      window.clearInterval(peopleTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const messages = useMemo(() => (thread.id === activeId ? thread.list : []), [thread, activeId]);
  const lastAt = messages.length ? messages[messages.length - 1].createdAt : null;
  const showing = isDesktop || mobileView === "chat";

  // Reading a chat on screen marks it read, including messages that arrive while it is open.
  useEffect(() => {
    if (!showing || !active || active.unread <= 0 || !lastAt) return;
    const key = `${active.id}|${lastAt}`;
    if (markedRef.current === key) return;
    markedRef.current = key;
    const id = active.id;
    setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    void markInboxReadAction({ conversationId: id, upTo: lastAt });
  }, [showing, active, lastAt]);

  const open = useCallback((id: string) => {
    activeRef.current = id;
    setActiveId(id);
    setMobileView("chat");
    setShowNew(false);
    window.history.replaceState(null, "", `${window.location.pathname}?c=${encodeURIComponent(id)}`);
  }, []);

  function back() {
    setMobileView("list");
    window.history.replaceState(null, "", window.location.pathname);
  }

  function onMessage(msg: InboxMessage) {
    const cur = threadRef.current;
    if (cur.id !== msg.conversationId) return;
    const next = { ...cur, list: mergeMessages(cur.list, [msg]) };
    threadRef.current = next;
    setThread(next);
    void refresh();
  }

  const counts = useMemo(() => {
    const out = {} as Record<InboxFilter, number>;
    for (const f of filters) out[f] = conversations.filter((c) => matchesInboxFilter(c, f, meId)).length;
    return out;
  }, [conversations, filters, meId]);

  const visible = useMemo(
    () => conversations.filter((c) => matchesInboxFilter(c, filter, meId) && matchesInboxSearch(c, query)),
    [conversations, filter, meId, query],
  );

  const nameOf = (id: string | null) => (id ? (id === meId ? "You" : people.find((p) => p.id === id)?.name ?? "A teammate") : null);

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[28rem] overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 md:h-[calc(100dvh-12rem)]">
      {/* Conversation list */}
      <div
        className={cn(
          "w-full min-w-0 flex-col md:flex md:w-80 md:shrink-0 md:border-r md:border-slate-100",
          mobileView === "chat" ? "hidden" : "flex",
        )}
      >
        <div className="space-y-2 border-b border-slate-100 p-3">
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            aria-expanded={showNew}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden /> New message to a guest
          </button>
          <label className="relative block">
            <span className="sr-only">Search by name or number</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name or number"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-100 sm:text-sm"
            />
          </label>
          <div role="tablist" aria-label="Which chats" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1",
                  filter === f ? "bg-violet-50 text-violet-800 ring-violet-200" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                )}
              >
                {FILTER_LABEL[f]}
                {f !== "closed" && counts[f] ? (
                  <span className={cn("tabular-nums", f === "sent" ? "text-rose-600" : "text-slate-400")}>{counts[f]}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {showNew ? (
            <InboxNewForm
              connection={connection}
              canSeeBookings={canSeeBookings}
              onCancel={() => setShowNew(false)}
              onStarted={(id) => {
                setFilter(filters.includes("mine") ? "mine" : filters[0]);
                open(id);
                void refresh({ full: true });
              }}
            />
          ) : null}
          {loaded && !connection.connected ? (
            <div className="m-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <p className="font-semibold">WhatsApp &amp; SMS are not connected yet.</p>
              <p className="mt-1 text-xs">
                The company&apos;s Twilio account (with its WhatsApp Business sender) has to be added once in Settings.
              </p>
              {canManageSettings ? (
                <Link
                  href="/dashboard/show-ops/settings#messaging"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 underline"
                >
                  <Settings2 className="h-3.5 w-3.5" aria-hidden /> Open Settings
                </Link>
              ) : null}
            </div>
          ) : null}
          <nav aria-label="Customer chats" className="p-2">
            {!loaded ? (
              <p className="flex items-center gap-2 px-2 py-4 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading chats…
              </p>
            ) : loadError && !conversations.length ? (
              <p className="px-2 py-4 text-sm text-rose-700">{loadError}</p>
            ) : !visible.length ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500">
                {query ? "Nothing matches that search." : filter === "sent" ? "Nobody has sent you a chat." : filter === "mine" ? "No open chats are yours right now." : "No chats here."}
              </p>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {visible.map((c) => {
                const title = c.customerName || formatPhone(c.customerPhone);
                const isActive = active?.id === c.id && showing;
                const owner = nameOf(c.assignedTo);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => open(c.id)}
                      aria-current={isActive ? "true" : undefined}
                      aria-label={c.unread ? `${title}, ${c.unread} unread` : title}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200",
                        isActive && "bg-violet-50 hover:bg-violet-50",
                      )}
                    >
                      <ChatAvatar id={c.customerPhone} name={title} className="mt-0.5 h-9 w-9" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cn("truncate text-sm text-slate-900", c.unread ? "font-bold" : "font-semibold")}>{title}</span>
                          {c.lastMessageAt ? (
                            <span className={cn("shrink-0 text-xs", c.unread ? "font-semibold text-slate-900" : "text-slate-400")}>
                              {relTime(c.lastMessageAt, now)}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span className={cn("block min-w-0 truncate text-xs", c.unread ? "font-semibold text-slate-800" : "text-slate-500")}>
                            {c.lastPreview || "No messages yet"}
                          </span>
                          <UnreadBadge count={c.unread} />
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <ChannelTag channel={c.channel} />
                          {c.pendingHandoff ? (
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-200">
                              Sent to you{c.pendingHandoff.fromUserId ? ` by ${nameOf(c.pendingHandoff.fromUserId)}` : ""}
                            </span>
                          ) : owner ? (
                            <span className="truncate text-[10px] font-semibold text-slate-500">{owner === "You" ? "Yours" : owner}</span>
                          ) : (
                            <span className="text-[10px] font-semibold text-amber-700">Unassigned</span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>

      {/* Conversation */}
      <div className={cn("min-w-0 flex-1 flex-col md:flex", mobileView === "list" ? "hidden" : "flex")}>
        {active ? (
          <InboxThread
            key={active.id}
            conversation={active}
            messages={messages}
            booking={thread.id === active.id ? thread.booking : null}
            loading={thread.id !== active.id}
            people={people}
            meId={meId}
            seesAll={seesAll}
            canSeeBookings={canSeeBookings}
            connection={connection}
            now={now}
            showing={showing}
            onBack={back}
            onMessage={onMessage}
            onChanged={() => void refresh({ full: true })}
            onLeft={() => {
              activeRef.current = null;
              setActiveId(null);
              setMobileView("list");
              window.history.replaceState(null, "", window.location.pathname);
              void refresh({ full: true });
            }}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-500">
            {loaded ? (loadError ?? "Pick a chat, or send a new message to a guest.") : "Loading…"}
          </div>
        )}
      </div>
    </div>
  );
}
