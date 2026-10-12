"use client";

import { ArrowLeft, Hash, Loader2, MessageSquarePlus, Paperclip, Send, Ticket, Users, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import {
  createGroupChatAction,
  markChatReadAction,
  openDirectChatAction,
  sendChatMessageAction,
} from "@/app/dashboard/show-ops/chat/actions";
import { ChatBookingCardView } from "@/components/show-ops/chat/booking-card";
import { ChatBookingPicker } from "@/components/show-ops/chat/booking-picker";
import {
  ChatAvatar,
  dayDivider,
  MentionText,
  msgTime,
  relTime,
  roleTag,
  UnreadBadge,
  useNow,
} from "@/components/show-ops/chat/chat-parts";
import { NewChatForm } from "@/components/show-ops/chat/new-chat-form";
import { publishChatUnread } from "@/components/show-ops/chat/use-chat-unread";
import {
  channelTitle,
  CHAT_MAX_TEXT,
  CHAT_POLL_MS,
  messagePreview,
  sortChannels,
  totalUnread,
} from "@/lib/show-ops/chat/logic";
import type {
  ChatBookingSearchHit,
  ChatChannel,
  ChatMessage,
  ChatPerson,
  ChatSyncResponse,
} from "@/lib/show-ops/chat/types";
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

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (!incoming.length) return current;
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

function nameOf(people: ChatPerson[], id: string | null, meId: string): string {
  if (!id) return "Someone";
  if (id === meId) return "You";
  return people.find((p) => p.id === id)?.name ?? "Former teammate";
}

type PollBody = ChatSyncResponse & { people?: ChatPerson[]; error?: string };

export function ShowOpsChatApp({
  meId,
  canSeeBookings,
  initialChannelId,
}: {
  meId: string;
  canSeeBookings: boolean;
  initialChannelId: string | null;
}) {
  const now = useNow();
  const isDesktop = useIsDesktop();

  const [people, setPeople] = useState<ChatPerson[]>([]);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(initialChannelId);
  const [thread, setThread] = useState<{ channelId: string | null; list: ChatMessage[] }>({ channelId: null, list: [] });
  const [mobileView, setMobileView] = useState<"list" | "chat">(initialChannelId ? "chat" : "list");
  const [showNew, setShowNew] = useState(false);
  const [newBusy, setNewBusy] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);

  const activeRef = useRef<string | null>(initialChannelId);
  const threadRef = useRef(thread);
  const markedRef = useRef<string>("");

  const refresh = useCallback(async (opts: { full?: boolean; withPeople?: boolean } = {}) => {
    const channelId = activeRef.current;
    const cur = threadRef.current;
    const incremental = !opts.full && channelId != null && cur.channelId === channelId && cur.list.length > 0;
    const params = new URLSearchParams();
    if (opts.withPeople) params.set("people", "1");
    if (channelId) params.set("c", channelId);
    if (incremental) {
      // Overlap by 30s: a message committed a moment late is still picked up; ids dedupe.
      const last = cur.list[cur.list.length - 1].createdAt;
      params.set("after", new Date(Date.parse(last) - 30_000).toISOString());
    }
    let res: Response;
    try {
      res = await fetch(`/api/show-ops/chat?${params.toString()}`, { cache: "no-store" });
    } catch {
      return; // offline; the next tick tries again
    }
    const body = (await res.json().catch(() => ({}))) as PollBody;
    if (res.status === 403 && channelId) {
      // That chat is gone or not ours: fall back to the list.
      if (activeRef.current === channelId) {
        activeRef.current = null;
        setActiveId(null);
        setMobileView("list");
        window.history.replaceState(null, "", window.location.pathname);
      }
      return;
    }
    if (!res.ok) {
      setLoadError(body.error || "Could not load chat.");
      setLoaded(true);
      return;
    }
    setLoadError(null);
    setChannels(body.channels ?? []);
    if (body.people) setPeople(body.people);
    setLoaded(true);
    if (channelId && body.messages && activeRef.current === channelId) {
      const latest = threadRef.current;
      const list =
        incremental && latest.channelId === channelId ? mergeMessages(latest.list, body.messages) : body.messages;
      const next = { channelId, list };
      threadRef.current = next;
      setThread(next);
    }
    // No chat picked yet: open Team (on phones the list stays in front).
    if (!activeRef.current) {
      const team = (body.channels ?? []).find((c) => c.kind === "team");
      if (team) {
        activeRef.current = team.id;
        setActiveId(team.id);
      }
    }
  }, []);

  // First load brings the team list too; after that, a full reload per chat switch.
  const firstLoadRef = useRef(true);
  useEffect(() => {
    activeRef.current = activeId;
    const withPeople = firstLoadRef.current;
    firstLoadRef.current = false;
    void refresh({ full: true, withPeople });
  }, [activeId, refresh]);

  // Poll while the tab is on screen; catch up straight away when it comes back.
  useEffect(() => {
    let timer: number | null = null;
    const tick = () => void refresh();
    const startTimer = () => {
      if (timer == null) timer = window.setInterval(tick, CHAT_POLL_MS);
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
    // The team list changes rarely; refresh it every few minutes.
    const peopleTimer = window.setInterval(() => void refresh({ withPeople: true }), 5 * 60_000);
    return () => {
      stopTimer();
      window.clearInterval(peopleTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  // Keep the nav badge in step with what this page knows.
  useEffect(() => {
    if (loaded) publishChatUnread(totalUnread(channels));
  }, [channels, loaded]);

  const sorted = useMemo(() => sortChannels(channels), [channels]);
  const active = channels.find((c) => c.id === activeId) ?? null;
  const messages = useMemo(
    () => (thread.channelId === activeId ? thread.list : []),
    [thread, activeId],
  );
  const lastAt = messages.length ? messages[messages.length - 1].createdAt : null;
  const showing = isDesktop || mobileView === "chat";

  // Mark the open chat read while it is on screen, including messages arriving while open.
  useEffect(() => {
    if (!showing || !active || active.unread <= 0 || !lastAt) return;
    const key = `${active.id}|${lastAt}`;
    if (markedRef.current === key) return;
    markedRef.current = key;
    const id = active.id;
    setChannels((cs) => cs.map((c) => (c.id === id ? { ...c, unread: 0, unreadMentions: 0 } : c)));
    void markChatReadAction({ channelId: id, upTo: lastAt });
  }, [showing, active, lastAt]);

  const open = useCallback((id: string) => {
    activeRef.current = id;
    setActiveId(id);
    setMobileView("chat");
    setShowNew(false);
    setNewError(null);
    window.history.replaceState(null, "", `${window.location.pathname}?c=${encodeURIComponent(id)}`);
  }, []);

  function back() {
    setMobileView("list");
    window.history.replaceState(null, "", window.location.pathname);
  }

  async function startDirect(userId: string) {
    setNewBusy(true);
    setNewError(null);
    const res = await openDirectChatAction({ userId });
    setNewBusy(false);
    if (!res.ok) return setNewError(res.error);
    open(res.data);
  }

  async function startGroup(name: string, userIds: string[]) {
    setNewBusy(true);
    setNewError(null);
    const res = await createGroupChatAction({ name, userIds });
    setNewBusy(false);
    if (!res.ok) return setNewError(res.error);
    open(res.data);
  }

  function onSent(msg: ChatMessage) {
    const cur = threadRef.current;
    if (cur.channelId !== msg.channelId) return;
    const next = { channelId: msg.channelId, list: mergeMessages(cur.list, [msg]) };
    threadRef.current = next;
    setThread(next);
    setChannels((cs) =>
      cs.map((c) =>
        c.id === msg.channelId
          ? {
              ...c,
              lastMessageAt: msg.createdAt,
              lastMessage: { authorId: msg.authorId, text: msg.text, bookingRef: msg.booking?.ref ?? null },
            }
          : c,
      ),
    );
  }

  const groups = sorted.filter((c) => c.kind !== "direct");
  const directs = sorted.filter((c) => c.kind === "direct");

  function renderChannel(c: ChatChannel) {
    const title = channelTitle(c, people, meId);
    const isActive = active?.id === c.id && showing;
    const otherId = c.kind === "direct" ? c.memberIds.find((id) => id !== meId) ?? c.id : c.id;
    const lastPreview = messagePreview(c.lastMessage, meId);
    return (
      <li key={c.id}>
        <button
          type="button"
          onClick={() => open(c.id)}
          aria-current={isActive ? "true" : undefined}
          aria-label={c.unread ? `${title}, ${c.unread} unread` : title}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200",
            isActive && "bg-violet-50 hover:bg-violet-50",
          )}
        >
          {c.kind === "direct" ? (
            <ChatAvatar id={otherId} name={title} className="h-9 w-9" />
          ) : (
            <span
              aria-hidden
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ backgroundColor: "var(--show-ops-primary,#7c3aed)" }}
            >
              {c.kind === "team" ? <Users className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
            </span>
          )}
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
                {lastPreview ||
                  (c.kind === "team"
                    ? "Everyone on the team"
                    : c.kind === "group"
                      ? `${c.memberIds.length} people`
                      : c.lastMessageAt
                        ? "Direct message"
                        : "No messages yet")}
              </span>
              <UnreadBadge count={c.unread} mentions={c.unreadMentions} />
            </span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[28rem] overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 md:h-[calc(100dvh-12rem)]">
      {/* Chat list */}
      <div
        className={cn(
          "w-full min-w-0 flex-col md:flex md:w-72 md:shrink-0 md:border-r md:border-slate-100",
          mobileView === "chat" ? "hidden" : "flex",
        )}
      >
        <div className="border-b border-slate-100 p-3">
          <button
            type="button"
            onClick={() => {
              setShowNew((v) => !v);
              setNewError(null);
            }}
            aria-expanded={showNew}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden /> New chat
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {showNew ? (
            <NewChatForm
              people={people}
              meId={meId}
              busy={newBusy}
              error={newError}
              onDirect={(id) => void startDirect(id)}
              onGroup={(name, ids) => void startGroup(name, ids)}
              onCancel={() => setShowNew(false)}
            />
          ) : null}
          <nav aria-label="Chats" className="flex flex-col gap-3 p-2">
            {!loaded ? (
              <p className="flex items-center gap-2 px-2 py-4 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading chats…
              </p>
            ) : loadError && !channels.length ? (
              <p className="px-2 py-4 text-sm text-rose-700">{loadError}</p>
            ) : null}
            {groups.length ? (
              <div>
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Team &amp; groups</p>
                <ul className="flex flex-col gap-0.5">{groups.map(renderChannel)}</ul>
              </div>
            ) : null}
            {directs.length ? (
              <div>
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Direct messages</p>
                <ul className="flex flex-col gap-0.5">{directs.map(renderChannel)}</ul>
              </div>
            ) : null}
          </nav>
        </div>
      </div>

      {/* Conversation */}
      <div className={cn("min-w-0 flex-1 flex-col md:flex", mobileView === "list" ? "hidden" : "flex")}>
        {active ? (
          <Conversation
            key={active.id}
            channel={active}
            title={channelTitle(active, people, meId)}
            people={people}
            meId={meId}
            messages={messages}
            loading={thread.channelId !== active.id}
            canSeeBookings={canSeeBookings}
            now={now}
            showing={showing}
            onBack={back}
            onSent={onSent}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-slate-500">
            {loaded ? "Pick a chat or start a new one." : "Loading…"}
          </div>
        )}
      </div>
    </div>
  );
}

type MentionState = { start: number; matches: ChatPerson[] };

function Conversation({
  channel,
  title,
  people,
  meId,
  messages,
  loading,
  canSeeBookings,
  now,
  showing,
  onBack,
  onSent,
}: {
  channel: ChatChannel;
  title: string;
  people: ChatPerson[];
  meId: string;
  messages: ChatMessage[];
  loading: boolean;
  canSeeBookings: boolean;
  now: number;
  showing: boolean;
  onBack: () => void;
  onSent: (m: ChatMessage) => void;
}) {
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [booking, setBooking] = useState<ChatBookingSearchHit | null>(null);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const members = useMemo(() => {
    const ids = channel.kind === "team" ? people.map((p) => p.id) : channel.memberIds;
    return ids.map((id) => people.find((p) => p.id === id)).filter((p): p is ChatPerson => Boolean(p));
  }, [channel.kind, channel.memberIds, people]);
  const mentionable = useMemo(() => members.filter((p) => p.id !== meId), [members, meId]);

  // Jump to the newest message when the chat opens, is shown on a phone, or gets a new message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, showing, loading]);

  // "@" plus letters just before the caret opens a list of people to mention.
  const mention = useMemo<MentionState | null>(() => {
    if (!focused) return null;
    const match = /(^|\s)@([\p{L}][\p{L}\p{M}'’.·\- ]*)?$/u.exec(text.slice(0, caret));
    if (!match) return null;
    const start = match.index + match[1].length;
    if (start === dismissedAt) return null;
    const q = (match[2] ?? "").toLowerCase();
    const matches = mentionable.filter((p) => {
      const n = p.name.toLowerCase();
      return n.startsWith(q) || n.split(/\s+/).some((w) => w.startsWith(q));
    });
    return matches.length ? { start, matches: matches.slice(0, 6) } : null;
  }, [focused, text, caret, dismissedAt, mentionable]);
  const highlighted = mention ? Math.min(activeIdx, mention.matches.length - 1) : 0;

  function insertMention(p: ChatPerson) {
    if (!mention) return;
    const before = text.slice(0, mention.start);
    const after = text.slice(caret).replace(/^ /, "");
    const insert = `@${p.name} `;
    const pos = before.length + insert.length;
    setText(before + insert + after);
    setCaret(pos);
    setActiveIdx(0);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  async function send() {
    if (sending) return;
    const body = text.trim();
    if (!body && !booking) {
      setError(canSeeBookings ? "Write a message or attach a booking first." : "Write a message first.");
      return;
    }
    setSending(true);
    setError(null);
    const res = await sendChatMessageAction({ channelId: channel.id, text: body, bookingId: booking?.id ?? null });
    setSending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSent(res.data);
    setText("");
    setCaret(0);
    setDismissedAt(null);
    setBooking(null);
    setPicking(false);
    inputRef.current?.focus();
  }

  const optionId = (i: number) => `chat-mention-${i}`;
  const memberLine =
    channel.kind === "team"
      ? `Everyone on the team · ${members.length} ${members.length === 1 ? "person" : "people"}`
      : channel.kind === "direct"
        ? roleTag(mentionable[0]?.role ?? "")
        : members.map((p) => (p.id === meId ? "You" : p.name)).join(", ");

  return (
    <>
      <header className="flex items-center gap-2 border-b border-slate-100 px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
          aria-label="Back to chats"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-slate-900">{title}</h3>
          <p className="truncate text-xs text-slate-500">{memberLine}</p>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 px-3 py-4 sm:px-4">
        {loading ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading messages…
          </p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No messages yet.
            {canSeeBookings ? " Send a booking with the paperclip to ask about it." : ""}
          </p>
        ) : null}
        <ol className="flex flex-col gap-3" aria-label={`Messages in ${title}`}>
          {messages.map((m, i) => {
            const mine = m.authorId === meId;
            const author = nameOf(people, m.authorId, meId);
            const prev = messages[i - 1];
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            const mentionsMe = !mine && m.mentions.includes(meId);
            return (
              <Fragment key={m.id}>
                {newDay ? (
                  <li className="my-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400" aria-hidden>
                    {dayDivider(m.createdAt, now)}
                  </li>
                ) : null}
                <li className={cn("flex min-w-0 gap-2", mine ? "justify-end" : "justify-start")}>
                  {!mine ? <ChatAvatar id={m.authorId ?? m.id} name={author} className="mt-5 h-7 w-7 text-[10px]" /> : null}
                  <div className={cn("flex min-w-0 max-w-[85%] flex-col sm:max-w-[70%]", mine ? "items-end" : "items-start")}>
                    {!mine ? (
                      <p className="mb-1 flex min-w-0 max-w-full items-baseline gap-2 text-xs">
                        <span className="truncate font-semibold text-slate-900">{author}</span>
                        <span className="shrink-0 text-slate-400">{msgTime(m.createdAt, now)}</span>
                      </p>
                    ) : null}
                    <div
                      className={cn(
                        "max-w-full rounded-2xl px-3 py-2 text-sm",
                        mine
                          ? "rounded-br-md text-white"
                          : "rounded-bl-md bg-white text-slate-900 ring-1 ring-slate-200",
                        mentionsMe && "ring-2 ring-amber-300",
                      )}
                      style={mine ? { backgroundColor: "var(--show-ops-primary,#7c3aed)" } : undefined}
                    >
                      {m.text ? (
                        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                          <MentionText text={m.text} people={people} meId={meId} mine={mine} />
                        </p>
                      ) : null}
                      {m.booking ? <ChatBookingCardView card={m.booking} className={m.text ? "mt-2" : ""} /> : null}
                    </div>
                    {mine ? <p className="mt-1 text-xs text-slate-400">{msgTime(m.createdAt, now)}</p> : null}
                  </div>
                </li>
              </Fragment>
            );
          })}
        </ol>
      </div>

      <form
        className="border-t border-slate-100 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {picking && canSeeBookings ? (
          <ChatBookingPicker
            onClose={() => setPicking(false)}
            onPick={(hit) => {
              setBooking(hit);
              setPicking(false);
              setError(null);
              inputRef.current?.focus();
            }}
          />
        ) : null}
        {booking ? (
          <div className="mb-2 flex min-w-0">
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-violet-50 py-1 pl-3 pr-1 text-xs font-semibold text-violet-800">
              <Ticket className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {booking.ref} · {booking.guestName}
              </span>
              <button
                type="button"
                onClick={() => setBooking(null)}
                aria-label={`Remove booking ${booking.ref}`}
                className="shrink-0 rounded-full p-0.5 hover:bg-violet-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </span>
          </div>
        ) : null}
        <div className="relative flex items-end gap-2">
          {mention ? (
            <ul
              id="chat-mention-list"
              role="listbox"
              aria-label="People to mention"
              className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-52 overflow-y-auto rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-200 sm:right-auto sm:w-72"
            >
              {mention.matches.map((p, i) => (
                <li
                  key={p.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === highlighted}
                  // Keep focus in the textarea so the caret position survives the click.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertMention(p)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-900",
                    i === highlighted && "bg-violet-50 text-violet-900",
                  )}
                >
                  <ChatAvatar id={p.id} name={p.name} className="h-6 w-6 text-[9px]" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                  <span className="shrink-0 text-xs text-slate-500">{roleTag(p.role)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {canSeeBookings ? (
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              aria-label="Attach a booking"
              aria-expanded={picking}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-white px-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              <Paperclip className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Booking</span>
            </button>
          ) : null}
          <label htmlFor="chat-composer" className="sr-only">
            Message {title}
          </label>
          <textarea
            id="chat-composer"
            ref={inputRef}
            rows={1}
            value={text}
            maxLength={CHAT_MAX_TEXT}
            onChange={(e) => {
              setText(e.target.value);
              setCaret(e.target.selectionStart ?? e.target.value.length);
              setActiveIdx(0);
              if (error) setError(null);
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (mention) {
                const n = mention.matches.length;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIdx((highlighted + 1) % n);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIdx((highlighted - 1 + n) % n);
                  return;
                }
                if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
                  e.preventDefault();
                  insertMention(mention.matches[highlighted]);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setDismissedAt(mention.start);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey && isDesktopKeyboard()) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Message, @ to mention someone"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={Boolean(mention)}
            aria-controls={mention ? "chat-mention-list" : undefined}
            aria-activedescendant={mention ? optionId(highlighted) : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "chat-composer-error" : undefined}
            className="max-h-32 min-h-10 min-w-0 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-100 sm:text-sm"
          />
          <button
            type="submit"
            disabled={sending}
            aria-label="Send message"
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            style={{ backgroundColor: "var(--show-ops-primary,#7c3aed)" }}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
        {error ? (
          <p id="chat-composer-error" role="alert" className="mt-2 text-xs text-rose-700">
            {error}
          </p>
        ) : null}
      </form>
    </>
  );
}

/** On a phone, Enter makes a new line; the Send button sends. */
function isDesktopKeyboard(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}
