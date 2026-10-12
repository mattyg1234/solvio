"use client";

import { Check, Loader2, MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { sendBookingToChatAction, type SendBookingTarget } from "@/app/dashboard/show-ops/chat/actions";
import { roleTag } from "@/components/show-ops/chat/chat-parts";
import { channelTitle, CHAT_MAX_TEXT } from "@/lib/show-ops/chat/logic";
import type { ChatChannel, ChatPerson, ChatSyncResponse } from "@/lib/show-ops/chat/types";

type Loaded = { meId: string; people: ChatPerson[]; groups: ChatChannel[] };

function encodeTarget(t: SendBookingTarget): string {
  return t.kind === "team" ? "team" : t.kind === "person" ? `person:${t.userId}` : `channel:${t.channelId}`;
}

function decodeTarget(v: string): SendBookingTarget | null {
  if (v === "team") return { kind: "team" };
  const [kind, id] = v.split(":");
  if (kind === "person" && id) return { kind: "person", userId: id };
  if (kind === "channel" && id) return { kind: "channel", channelId: id };
  return null;
}

/**
 * "Send to chat" on a booking: pick the Team chat, a teammate or a group, add a
 * question, and the booking lands in that chat as a card.
 */
export function SendBookingToChat({ bookingId, bookingRef }: { bookingId: string; bookingRef: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [target, setTarget] = useState("team");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<{ channelId: string; label: string } | null>(null);
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/show-ops/chat?people=1", { cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as ChatSyncResponse & { people?: ChatPerson[]; error?: string };
        if (!res.ok) throw new Error(body.error || "Could not load chats.");
        if (cancelled) return;
        setLoaded({
          meId: body.meId,
          people: (body.people ?? []).filter((p) => p.id !== body.meId),
          groups: (body.channels ?? []).filter((c) => c.kind === "group"),
        });
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load chats.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loaded]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.querySelector<HTMLElement>("select, textarea")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loaded]);

  function labelFor(v: string): string {
    const t = decodeTarget(v);
    if (!t || t.kind === "team") return "Team";
    if (t.kind === "person") return loaded?.people.find((p) => p.id === t.userId)?.name ?? "them";
    const g = loaded?.groups.find((c) => c.id === t.channelId);
    return g ? channelTitle(g, loaded?.people ?? [], loaded?.meId ?? "") : "the group";
  }

  async function send() {
    const t = decodeTarget(target);
    if (!t) return setError("Pick where to send it.");
    setSending(true);
    setError(null);
    const res = await sendBookingToChatAction({ bookingId, target: t, text });
    setSending(false);
    if (!res.ok) return setError(res.error);
    setSentTo({ channelId: res.data, label: labelFor(target) });
    setText("");
  }

  function close() {
    setOpen(false);
    setSentTo(null);
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 print:hidden"
      >
        <MessageCircle className="h-4 w-4" aria-hidden style={{ color: "var(--show-ops-primary,#7c3aed)" }} />
        Send to chat
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-0 sm:items-center sm:p-4 print:hidden" onClick={close}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl ring-1 ring-slate-200 sm:rounded-2xl sm:pb-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id={`${id}-title`} className="text-base font-semibold text-slate-900">
                  Send booking to chat
                </h3>
                <p className="mt-0.5 font-mono text-xs text-slate-500">{bookingRef}</p>
              </div>
              <button type="button" onClick={close} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {sentTo ? (
              <div className="mt-4 space-y-3">
                <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
                  <Check className="h-4 w-4" aria-hidden /> Sent to {sentTo.label}.
                </p>
                <div className="flex gap-2">
                  <Link
                    href={`/dashboard/show-ops/chat?c=${encodeURIComponent(sentTo.channelId)}`}
                    className="inline-flex flex-1 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
                    style={{ backgroundColor: "var(--show-ops-primary,#7c3aed)" }}
                  >
                    Open chat
                  </Link>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <div>
                  <label htmlFor={`${id}-to`} className="text-xs font-semibold text-slate-600">
                    Send to
                  </label>
                  {loadError ? (
                    <p className="mt-1 text-sm text-rose-700">{loadError}</p>
                  ) : !loaded ? (
                    <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading the team…
                    </p>
                  ) : (
                    <select
                      id={`${id}-to`}
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 sm:text-sm"
                    >
                      <option value="team">Team (everyone)</option>
                      {loaded.people.length ? (
                        <optgroup label="A person">
                          {loaded.people.map((p) => (
                            <option key={p.id} value={encodeTarget({ kind: "person", userId: p.id })}>
                              {p.name} · {roleTag(p.role)}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {loaded.groups.length ? (
                        <optgroup label="A group">
                          {loaded.groups.map((g) => (
                            <option key={g.id} value={encodeTarget({ kind: "channel", channelId: g.id })}>
                              {channelTitle(g, loaded.people, loaded.meId)}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                  )}
                </div>
                <div>
                  <label htmlFor={`${id}-text`} className="text-xs font-semibold text-slate-600">
                    Question (optional)
                  </label>
                  <textarea
                    id={`${id}-text`}
                    value={text}
                    maxLength={CHAT_MAX_TEXT}
                    rows={3}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Can you check the pickup for this one?"
                    className="mt-1 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-base outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 sm:text-sm"
                  />
                </div>
                {error ? (
                  <p role="alert" className="text-sm text-rose-700">
                    {error}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={sending || !loaded}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-60"
                  style={{ backgroundColor: "var(--show-ops-primary,#7c3aed)" }}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MessageCircle className="h-4 w-4" aria-hidden />}
                  Send to {labelFor(target)}
                </button>
                <p className="text-xs text-slate-500">
                  Staff see the booking card live, without prices. Anyone without access to this booking sees only its reference.
                </p>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
