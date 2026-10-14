"use client";

import {
  ArrowLeft,
  Check,
  FileText,
  Forward,
  Hand,
  Link2,
  Loader2,
  Lock,
  RotateCcw,
  Send,
  StickyNote,
  Ticket,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import {
  acceptHandoffAction,
  addInboxNoteAction,
  declineHandoffAction,
  linkConversationBookingAction,
  releaseConversationAction,
  sendConversationToTeammateAction,
  sendInboxReplyAction,
  sendReopenTemplateAction,
  setConversationStatusAction,
  takeConversationAction,
} from "@/app/dashboard/show-ops/inbox/actions";
import { ChatBookingPicker } from "@/components/show-ops/chat/booking-picker";
import { ChatAvatar, dayDivider, msgTime, roleTag } from "@/components/show-ops/chat/chat-parts";
import { ChannelTag, DeliveryStatus, windowLeftLabel } from "@/components/show-ops/inbox/inbox-parts";
import type { ChatPerson } from "@/lib/show-ops/chat/types";
import { formatPhone, INBOX_MAX_NOTE, INBOX_MAX_TEXT, replyBlock, whatsappWindowLeft } from "@/lib/show-ops/inbox/logic";
import type {
  InboxActionResult,
  InboxBookingSummary,
  InboxConnectionSummary,
  InboxConversation,
  InboxMessage,
} from "@/lib/show-ops/inbox/types";
import { cn } from "@/lib/utils";

const PRIMARY = "var(--show-ops-primary,#7c3aed)";

function showDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
}

export function InboxThread({
  conversation: c,
  messages,
  booking,
  loading,
  people,
  meId,
  seesAll,
  canSeeBookings,
  connection,
  now,
  showing,
  onBack,
  onMessage,
  onChanged,
  onLeft,
}: {
  conversation: InboxConversation;
  messages: InboxMessage[];
  booking: InboxBookingSummary | null;
  loading: boolean;
  people: ChatPerson[];
  meId: string;
  seesAll: boolean;
  canSeeBookings: boolean;
  connection: InboxConnectionSummary;
  now: number;
  showing: boolean;
  onBack: () => void;
  onMessage: (m: InboxMessage) => void;
  onChanged: () => void;
  /** This person can no longer see the chat (passed on it, sent it on without whole-inbox access). */
  onLeft: () => void;
}) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"send" | "booking" | null>(null);
  const [sendTo, setSendTo] = useState("");
  const [sendNote, setSendNote] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const title = c.customerName || formatPhone(c.customerPhone);
  const nameOf = (id: string | null) =>
    id ? (id === meId ? "You" : people.find((p) => p.id === id)?.name ?? "A teammate") : null;
  const owner = nameOf(c.assignedTo);
  const mine = c.assignedTo === meId;
  const canAct = seesAll || mine;

  const block = replyBlock({
    seesAll,
    meId,
    assignedTo: c.assignedTo,
    channel: c.channel,
    lastInboundAt: c.lastInboundAt,
    senderConfigured: c.channel === "whatsapp" ? connection.whatsapp : connection.sms,
    now,
  });
  const windowLeft = c.channel === "whatsapp" ? whatsappWindowLeft(c.lastInboundAt, now) : 0;
  const teammates = useMemo(() => people.filter((p) => p.id !== meId && p.id !== c.assignedTo), [people, meId, c.assignedTo]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, showing, loading]);

  async function act<T>(key: string, fn: () => Promise<InboxActionResult<T>>, after?: (data: T) => void) {
    if (busy) return;
    setBusy(key);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    after?.(res.data as T);
    onChanged();
  }

  async function submit() {
    const body = text.trim();
    if (!body) {
      setError(mode === "note" ? "Write the note first." : "Write a message first.");
      return;
    }
    await act(mode, () => (mode === "note" ? addInboxNoteAction : sendInboxReplyAction)({ conversationId: c.id, text: body }), (msg) => {
      onMessage(msg as InboxMessage);
      setText("");
      inputRef.current?.focus();
    });
  }

  return (
    <>
      <header className="border-b border-slate-100 px-3 py-3 sm:px-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Back to chats">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </button>
          <ChatAvatar id={c.customerPhone} name={title} className="h-9 w-9" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-slate-900">{title}</h3>
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <ChannelTag channel={c.channel} />
              {c.customerName ? <span className="tabular-nums">{formatPhone(c.customerPhone)}</span> : null}
              <span>· {owner ? (owner === "You" ? "Yours" : `With ${owner}`) : "Unassigned"}</span>
              {c.status === "closed" ? <span className="font-semibold text-slate-600">· Closed</span> : null}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {seesAll && !mine && !c.pendingHandoff ? (
            <ActionButton icon={Hand} label="Take it" busy={busy === "take"} onClick={() => void act("take", () => takeConversationAction({ conversationId: c.id }))} />
          ) : null}
          {canAct ? (
            <ActionButton
              icon={Forward}
              label="Send to…"
              active={panel === "send"}
              onClick={() => {
                setPanel(panel === "send" ? null : "send");
                setError(null);
              }}
            />
          ) : null}
          {canAct && canSeeBookings ? (
            <ActionButton
              icon={Link2}
              label={booking || c.bookingId ? "Change booking" : "Link booking"}
              active={panel === "booking"}
              onClick={() => {
                setPanel(panel === "booking" ? null : "booking");
                setError(null);
              }}
            />
          ) : null}
          {canAct && c.assignedTo ? (
            <ActionButton
              icon={Undo2}
              label="Back to shared inbox"
              busy={busy === "release"}
              onClick={() =>
                void act("release", () => releaseConversationAction({ conversationId: c.id }), () => {
                  if (!seesAll) onLeft();
                })
              }
            />
          ) : null}
          {canAct ? (
            c.status === "open" ? (
              <ActionButton icon={Check} label="Close" busy={busy === "close"} onClick={() => void act("close", () => setConversationStatusAction({ conversationId: c.id, status: "closed" }))} />
            ) : (
              <ActionButton icon={RotateCcw} label="Reopen" busy={busy === "close"} onClick={() => void act("close", () => setConversationStatusAction({ conversationId: c.id, status: "open" }))} />
            )
          ) : null}
        </div>

        {booking ? (
          <Link
            href={`/dashboard/show-ops/bookings/${booking.id}`}
            className="mt-2 flex min-w-0 items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-900 ring-1 ring-violet-100 hover:bg-violet-100"
          >
            <Ticket className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">
              <span className="font-mono font-semibold">{booking.ref}</span> · {booking.guestName} · {booking.showName} · {showDay(booking.showDate)}
            </span>
          </Link>
        ) : c.bookingId ? (
          <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <Lock className="h-3.5 w-3.5" aria-hidden /> Linked to a booking you cannot open.
          </p>
        ) : null}

        {panel === "send" ? (
          <form
            className="mt-2 space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"
            onSubmit={(e) => {
              e.preventDefault();
              if (!sendTo) return setError("Pick who to send it to.");
              void act(
                "send",
                () => sendConversationToTeammateAction({ conversationId: c.id, toUserId: sendTo, note: sendNote }),
                () => {
                  setPanel(null);
                  setSendTo("");
                  setSendNote("");
                },
              );
            }}
          >
            <label className="block text-xs font-semibold text-slate-700">
              Send to
              <select
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-base sm:text-sm"
              >
                <option value="">Pick someone…</option>
                {teammates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {roleTag(p.role)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Note (optional)
              <input
                value={sendNote}
                maxLength={INBOX_MAX_NOTE}
                onChange={(e) => setSendNote(e.target.value)}
                placeholder="e.g. Can you check they're on the right bus?"
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-base sm:text-sm"
              />
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={busy === "send"} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60" style={{ backgroundColor: PRIMARY }}>
                {busy === "send" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Forward className="h-3.5 w-3.5" aria-hidden />}
                Send chat
              </button>
              <button type="button" onClick={() => setPanel(null)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {panel === "booking" ? (
          <div className="mt-2">
            <ChatBookingPicker
              onClose={() => setPanel(null)}
              onPick={(hit) =>
                void act("booking", () => linkConversationBookingAction({ conversationId: c.id, bookingId: hit.id }), () => setPanel(null))
              }
            />
            {c.bookingId ? (
              <button
                type="button"
                onClick={() => void act("booking", () => linkConversationBookingAction({ conversationId: c.id, bookingId: null }), () => setPanel(null))}
                className="mt-1 text-xs font-semibold text-rose-700 hover:underline"
              >
                Unlink the booking
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {c.pendingHandoff ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-rose-100 bg-rose-50 px-3 py-2.5 text-sm text-rose-900 sm:px-4">
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{nameOf(c.pendingHandoff.fromUserId) ?? "A teammate"} sent you this chat.</span>
            {c.pendingHandoff.note ? <span className="block text-xs">“{c.pendingHandoff.note}”</span> : null}
          </span>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void act("accept", () => acceptHandoffAction({ handoffId: c.pendingHandoff!.id }))}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: PRIMARY }}
          >
            {busy === "accept" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
            Accept
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() =>
              void act("decline", () => declineHandoffAction({ handoffId: c.pendingHandoff!.id }), () => {
                if (!seesAll) onLeft();
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 ring-1 ring-rose-200 disabled:opacity-60"
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Pass
          </button>
        </div>
      ) : null}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 px-3 py-4 sm:px-4">
        {loading ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading messages…
          </p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No messages yet.</p>
        ) : null}
        <ol className="flex flex-col gap-3" aria-label={`Messages with ${title}`}>
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            return (
              <Fragment key={m.id}>
                {newDay ? (
                  <li className="my-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400" aria-hidden>
                    {dayDivider(m.createdAt, now)}
                  </li>
                ) : null}
                <MessageRow m={m} now={now} nameOf={nameOf} guest={title} />
              </Fragment>
            );
          })}
        </ol>
      </div>

      <form
        className="border-t border-slate-100 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div role="tablist" aria-label="Reply or note" className="mb-2 flex items-center gap-1">
          {(["reply", "note"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={mode === k}
              onClick={() => {
                setMode(k);
                setError(null);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1",
                mode === k
                  ? k === "note"
                    ? "bg-amber-50 text-amber-900 ring-amber-200"
                    : "bg-violet-50 text-violet-800 ring-violet-200"
                  : "bg-white text-slate-600 ring-slate-200",
              )}
            >
              {k === "reply" ? <Send className="h-3 w-3" aria-hidden /> : <StickyNote className="h-3 w-3" aria-hidden />}
              {k === "reply" ? `Reply by ${c.channel === "whatsapp" ? "WhatsApp" : "SMS"}` : "Team note"}
            </button>
          ))}
          {mode === "reply" && c.channel === "whatsapp" && windowLeft > 0 ? (
            <span className="ml-auto text-[11px] text-slate-500">WhatsApp window: {windowLeftLabel(windowLeft)}</span>
          ) : null}
        </div>

        {mode === "reply" && !block.ok ? (
          <div className="mb-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
            <p>{block.message}</p>
            {block.reason === "window" && connection.reopenTemplate ? (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void act("template", () => sendReopenTemplateAction({ conversationId: c.id }), (msg) => onMessage(msg as InboxMessage))}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-semibold text-amber-900 ring-1 ring-amber-300 disabled:opacity-60"
              >
                {busy === "template" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
                Send the re-open template
              </button>
            ) : null}
          </div>
        ) : null}
        {mode === "reply" && block.ok && !connection.live ? (
          <p className="mb-2 text-[11px] text-slate-500">Test mode: only numbers on the test list receive messages until the Hub goes live.</p>
        ) : null}

        <div className="flex items-end gap-2">
          <label htmlFor="inbox-composer" className="sr-only">
            {mode === "note" ? "Team note (the guest never sees it)" : `Reply to ${title}`}
          </label>
          <textarea
            id="inbox-composer"
            ref={inputRef}
            rows={1}
            value={text}
            maxLength={mode === "note" ? INBOX_MAX_NOTE : INBOX_MAX_TEXT}
            disabled={mode === "reply" && !block.ok}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={mode === "note" ? "Note for the team. The guest never sees it." : "Message to the guest"}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "inbox-composer-error" : undefined}
            className={cn(
              "max-h-32 min-h-10 min-w-0 flex-1 resize-none rounded-xl border px-3 py-2 text-base text-slate-900 outline-none placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400 sm:text-sm",
              mode === "note" ? "border-amber-200 bg-amber-50/40 focus:ring-2 focus:ring-amber-100" : "border-slate-200 bg-white focus:border-violet-300 focus:ring-2 focus:ring-violet-100",
            )}
          />
          <button
            type="submit"
            disabled={Boolean(busy) || (mode === "reply" && !block.ok)}
            aria-label={mode === "note" ? "Save note" : "Send message"}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            style={{ backgroundColor: mode === "note" ? "#b45309" : PRIMARY }}
          >
            {busy === "reply" || busy === "note" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : mode === "note" ? (
              <StickyNote className="h-4 w-4" aria-hidden />
            ) : (
              <Send className="h-4 w-4" aria-hidden />
            )}
            <span className="hidden sm:inline">{mode === "note" ? "Save" : "Send"}</span>
          </button>
        </div>
        {error ? (
          <p id="inbox-composer-error" role="alert" className="mt-2 text-xs text-rose-700">
            {error}
          </p>
        ) : null}
      </form>
    </>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  busy,
  active,
}: {
  icon: typeof Check;
  label: string;
  onClick: () => void;
  busy?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-expanded={active === undefined ? undefined : active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 disabled:opacity-60",
        active ? "bg-violet-50 text-violet-800 ring-violet-200" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Icon className="h-3.5 w-3.5" aria-hidden />}
      {label}
    </button>
  );
}

function MessageRow({
  m,
  now,
  nameOf,
  guest,
}: {
  m: InboxMessage;
  now: number;
  nameOf: (id: string | null) => string | null;
  guest: string;
}) {
  if (m.direction === "event") {
    return (
      <li className="text-center text-[11px] text-slate-500">
        {m.body} · {msgTime(m.createdAt, now)}
      </li>
    );
  }
  if (m.direction === "note") {
    return (
      <li className="mx-auto w-full max-w-[90%] rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200 sm:max-w-[75%]">
        <p className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
          <StickyNote className="h-3 w-3" aria-hidden /> Team note · {nameOf(m.authorId) ?? "Someone"} · {msgTime(m.createdAt, now)}
        </p>
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
      </li>
    );
  }
  const out = m.direction === "out";
  const who = out
    ? m.source === "ticket"
      ? "Sent by the Hub (ticket)"
      : m.source === "template"
        ? `Template · ${nameOf(m.authorId) ?? "Hub"}`
        : nameOf(m.authorId) ?? "Hub"
    : guest;
  return (
    <li className={cn("flex min-w-0", out ? "justify-end" : "justify-start")}>
      <div className={cn("flex min-w-0 max-w-[85%] flex-col sm:max-w-[70%]", out ? "items-end" : "items-start")}>
        <p className="mb-1 flex min-w-0 max-w-full items-baseline gap-2 text-xs">
          <span className="truncate font-semibold text-slate-700">{who}</span>
          <span className="shrink-0 text-slate-400">{msgTime(m.createdAt, now)}</span>
        </p>
        <div
          className={cn(
            "max-w-full rounded-2xl px-3 py-2 text-sm",
            out ? "rounded-br-md text-white" : "rounded-bl-md bg-white text-slate-900 ring-1 ring-slate-200",
            out && m.source === "template" && "italic",
          )}
          style={out ? { backgroundColor: PRIMARY } : undefined}
        >
          {m.mediaCount ? (
            <div className="mb-1 flex flex-wrap gap-2">
              {m.mediaTypes.map((type, idx) => {
                const href = `/api/show-ops/inbox/media/${m.id}/${idx}`;
                return type.startsWith("image/") ? (
                  <a key={idx} href={href} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated file */}
                    <img src={href} alt={`Photo from ${guest}`} className="max-h-56 max-w-full rounded-lg object-cover" loading="lazy" />
                  </a>
                ) : (
                  <a
                    key={idx}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className={cn("inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold", out ? "bg-white/20" : "bg-slate-100")}
                  >
                    <FileText className="h-3.5 w-3.5" aria-hidden /> Open file
                  </a>
                );
              })}
            </div>
          ) : null}
          {m.body ? <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p> : null}
        </div>
        {out ? (
          <p className="mt-1 text-xs">
            <DeliveryStatus status={m.status} error={m.error} />
          </p>
        ) : null}
      </div>
    </li>
  );
}
