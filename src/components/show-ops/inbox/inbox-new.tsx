"use client";

import { Loader2, Send, Ticket, X } from "lucide-react";
import { useState } from "react";

import { startInboxConversationAction } from "@/app/dashboard/show-ops/inbox/actions";
import { ChatBookingPicker } from "@/components/show-ops/chat/booking-picker";
import { PhoneInput } from "@/components/show-ops/phone-input";
import { INBOX_MAX_TEXT } from "@/lib/show-ops/inbox/logic";
import type { ChatBookingSearchHit } from "@/lib/show-ops/chat/types";
import type { InboxConnectionSummary } from "@/lib/show-ops/inbox/types";
import { cn } from "@/lib/utils";

/**
 * Message a guest first. SMS can say anything; WhatsApp only allows the approved
 * template until the guest replies (WhatsApp's rule, not ours).
 */
export function InboxNewForm({
  connection,
  canSeeBookings,
  onCancel,
  onStarted,
}: {
  connection: InboxConnectionSummary;
  canSeeBookings: boolean;
  onCancel: () => void;
  onStarted: (conversationId: string) => void;
}) {
  const [channel, setChannel] = useState<"whatsapp" | "sms">(connection.whatsapp || !connection.sms ? "whatsapp" : "sms");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [booking, setBooking] = useState<ChatBookingSearchHit | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const whatsappNeedsTemplate = channel === "whatsapp";

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await startInboxConversationAction({ phone, channel, name, bookingId: booking?.id ?? null, text });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onStarted(res.data);
  }

  if (!connection.connected) {
    return (
      <div className="m-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 ring-1 ring-slate-200">
        Connect Twilio in Settings first, then guests can be messaged from here.
      </div>
    );
  }

  return (
    <form
      className="m-3 space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <fieldset>
        <legend className="text-xs font-semibold text-slate-700">Send by</legend>
        <div className="mt-1 flex gap-2">
          {(["whatsapp", "sms"] as const).map((k) => {
            const available = k === "whatsapp" ? connection.whatsapp : connection.sms;
            return (
              <label
                key={k}
                className={cn(
                  "inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ring-1",
                  channel === k ? "bg-white text-violet-800 ring-violet-300" : "bg-white text-slate-600 ring-slate-200",
                  !available && "cursor-not-allowed opacity-50",
                )}
              >
                <input type="radio" name="channel" value={k} checked={channel === k} disabled={!available} onChange={() => setChannel(k)} className="sr-only" />
                {k === "whatsapp" ? "WhatsApp" : "SMS"}
              </label>
            );
          })}
        </div>
      </fieldset>

      {canSeeBookings ? (
        <div>
          {booking ? (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-violet-50 py-1 pl-3 pr-1 text-xs font-semibold text-violet-800">
              <Ticket className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {booking.ref} · {booking.guestName}
              </span>
              <button type="button" onClick={() => setBooking(null)} aria-label="Remove booking" className="shrink-0 rounded-full p-0.5 hover:bg-violet-100">
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </span>
          ) : picking ? (
            <ChatBookingPicker
              onClose={() => setPicking(false)}
              onPick={(hit) => {
                setBooking(hit);
                setPicking(false);
              }}
            />
          ) : (
            <button type="button" onClick={() => setPicking(true)} className="text-xs font-semibold text-violet-700 hover:underline">
              From a booking (uses its mobile)…
            </button>
          )}
        </div>
      ) : null}

      <label className="block text-xs font-semibold text-slate-700">
        Mobile{booking ? " (leave empty to use the booking's)" : ""}
        <span className="mt-1 block">
          <PhoneInput onChange={setPhone} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-base sm:text-sm" />
        </span>
      </label>
      {!booking ? (
        <label className="block text-xs font-semibold text-slate-700">
          Guest name (optional)
          <input
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-base sm:text-sm"
          />
        </label>
      ) : null}

      {whatsappNeedsTemplate ? (
        <p className="rounded-lg bg-white p-2 text-xs text-slate-600 ring-1 ring-slate-200">
          {connection.reopenTemplate
            ? "WhatsApp sends your approved template first. Once the guest replies you can write freely for 24 hours."
            : "WhatsApp needs an approved template to message a guest first, and none is set up yet. Use SMS, or add the template in Settings."}
        </p>
      ) : (
        <label className="block text-xs font-semibold text-slate-700">
          Message
          <textarea
            rows={3}
            value={text}
            maxLength={INBOX_MAX_TEXT}
            onChange={(e) => setText(e.target.value)}
            className="mt-1 block w-full resize-y rounded-lg border border-slate-200 bg-white px-2 py-2 text-base sm:text-sm"
          />
        </label>
      )}

      {error ? (
        <p role="alert" className="text-xs text-rose-700">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || (whatsappNeedsTemplate && !connection.reopenTemplate)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--show-ops-primary,#7c3aed)" }}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
          {whatsappNeedsTemplate ? "Send template" : "Send"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
      </div>
    </form>
  );
}
