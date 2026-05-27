"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  CreditCard,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Send,
  X,
} from "lucide-react";

import {
  fetchBookingMessages,
  recordBookingInbound,
  sendBookingOutboundBulk,
  type BookingMessageRow,
} from "@/app/dashboard/bookings/actions";
import { callBookingRequestGuestAction } from "@/app/dashboard/bookings/guest-call-actions";
import { createDepositCheckoutForBookingRequest } from "@/app/dashboard/bookings/payment-actions";
import { createVenueCalendarBookingFromRequest } from "@/app/dashboard/bookings/calendar-actions";
import { GuestAiCallButton } from "@/components/dashboard/guest-ai-call-dialog";
import { InboxEmptyState } from "@/components/dashboard/inbox-empty-state";
import { StripeConnectRequiredCallout } from "@/components/dashboard/stripe-connect-required-callout";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoneyDisplay, moneySymbol } from "@/lib/checkout-money";
import { BOOKING_GUEST_MODE_LABELS, isBookingGuestMode } from "@/lib/booking-guest-modes";
import { parseEuroInputToCents, sanitizeEuroInput } from "@/lib/money-input";
import { cn } from "@/lib/utils";

export type BookingRequestRow = {
  id: string;
  business_id: string;
  customer_name: string;
  email: string;
  phone: string | null;
  notes: string | null;
  preferred_time: string | null;
  event_title: string | null;
  booking_kind: string | null;
  requested_date: string | null;
  guest_count: number | null;
  intake_extras?: unknown;
  payment_status?: string | null;
  deposit_amount_cents?: number | null;
  created_at: string;
};

export function smsBookingHref(phone: string, businessName: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  const body = encodeURIComponent(`Hi — it's ${businessName} following up on your Solvio booking request.`);
  return `sms:${digits}?body=${body}`;
}

export function telBookingHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function bookingKindLabel(kind: string | null | undefined) {
  if (!kind) return "—";
  return isBookingGuestMode(kind) ? BOOKING_GUEST_MODE_LABELS[kind] : kind;
}

function paymentStatusBadge(
  status: string | null | undefined,
  depositCents: number | null | undefined,
): { label: string; className: string } | null {
  const st = (status ?? "none").trim().toLowerCase();
  if (st === "paid") {
    const paidLabel =
      typeof depositCents === "number" && depositCents > 0 ? formatMoneyDisplay(depositCents) : null;
    return {
      label: paidLabel ? `Deposit paid ${paidLabel}` : "Deposit paid",
      className: "rounded-full bg-emerald-50 px-2 py-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-100",
    };
  }
  if (st === "pending") {
    return {
      label: "Deposit pending",
      className: "rounded-full bg-amber-50 px-2 py-0 text-[10px] font-semibold uppercase tracking-wide text-amber-900 ring-1 ring-amber-100",
    };
  }
  if (st === "failed") {
    return {
      label: "Payment failed",
      className: "rounded-full bg-rose-50 px-2 py-0 text-[10px] font-semibold uppercase tracking-wide text-rose-800 ring-1 ring-rose-100",
    };
  }
  return null;
}

function fmtRequestedDate(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const raw = iso.trim();
  const d = new Date(`${raw}T12:00:00`);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/**
 * Best-effort parse of a guest's preferred_time text ("7:30pm", "19:30", "8 PM") + requested_date
 * into a datetime-local string suitable for <input type="datetime-local">.
 * Defaults to 19:00 if the time can't be parsed.
 */
function suggestStartLocal(req: BookingRequestRow): string {
  if (!req.requested_date?.trim()) return "";
  let hh = 19;
  let mm = 0;
  if (req.preferred_time?.trim()) {
    const m = req.preferred_time.trim().match(/(\d{1,2})\s*[:.\s]?\s*(\d{0,2})\s*(am|pm)?/i);
    if (m) {
      const ampm = m[3]?.toLowerCase();
      let h = parseInt(m[1] ?? "0", 10);
      const mins = m[2] ? parseInt(m[2], 10) : 0;
      if (ampm === "pm" && h < 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      if (Number.isFinite(h) && h >= 0 && h < 24 && Number.isFinite(mins) && mins >= 0 && mins < 60) {
        hh = h;
        mm = mins;
      }
    }
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${req.requested_date}T${pad(hh)}:${pad(mm)}`;
}

function addMinutesToLocal(local: string, minutes: number): string {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return "";
  const d = new Date(parseInt(m[1]!), parseInt(m[2]!) - 1, parseInt(m[3]!), parseInt(m[4]!), parseInt(m[5]!));
  d.setMinutes(d.getMinutes() + minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function intakeSummaryLine(r: BookingRequestRow): string | null {
  const parts: string[] = [];
  if (r.event_title?.trim()) parts.push(r.event_title.trim());
  if (r.booking_kind?.trim()) parts.push(bookingKindLabel(r.booking_kind));
  const rd = fmtRequestedDate(r.requested_date);
  if (rd) parts.push(rd);
  if (typeof r.guest_count === "number" && r.guest_count > 0) parts.push(`${r.guest_count} guests`);
  return parts.length ? parts.join(" · ") : null;
}

function ConfirmBookingSlotSection({
  request,
  pending,
  onScheduled,
  links,
}: {
  request: BookingRequestRow;
  pending: boolean;
  onScheduled: () => void;
  links: { tables: { id: string; label: string }[]; events: { id: string; title: string }[] };
}) {
  const suggestedStart = suggestStartLocal(request);
  const suggestedEnd = suggestedStart ? addMinutesToLocal(suggestedStart, 60) : "";
  const [start, setStart] = useState(suggestedStart);
  const [end, setEnd] = useState(suggestedEnd);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [linkedTableId, setLinkedTableId] = useState("");
  const [linkedEventId, setLinkedEventId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [localPending, startLocal] = useTransition();

  const busy = pending || localPending;

  function submit() {
    setErr(null);
    if (!start.trim() || !end.trim()) {
      setErr("Pick a start and end time.");
      return;
    }
    const s = new Date(start);
    const e = new Date(end);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      setErr("Invalid date or time.");
      return;
    }
    if (e.getTime() <= s.getTime()) {
      setErr("End must be after start.");
      return;
    }

    startLocal(() => {
      void (async () => {
        try {
          await createVenueCalendarBookingFromRequest({
            bookingRequestId: request.id,
            startsAtIso: s.toISOString(),
            endsAtIso: e.toISOString(),
            title: title.trim() || undefined,
            internalNotes: notes.trim() || undefined,
            floorPlanTableId: linkedTableId.trim() || undefined,
            businessEventId: linkedEventId.trim() || undefined,
          });
          setStart("");
          setEnd("");
          setTitle("");
          setNotes("");
          setLinkedTableId("");
          setLinkedEventId("");
          onScheduled();
        } catch (ex) {
          setErr(ex instanceof Error ? ex.message : "Could not confirm.");
        }
      })();
    });
  }

  return (
    <div className="rounded-2xl border border-[#ddd6fe] bg-[#f5f3ff]/60 px-5 py-4 shadow-inner shadow-[#ede9fe]/40">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#64748b]">Confirm slot</p>
      <p className="mt-2 text-sm leading-relaxed text-[#475569]">
        Lock this guest into your operational calendar — confirmed visits appear under the{" "}
        <span className="font-semibold text-[#5b21b6]">Confirmed</span> tab with guest snapshot fields.
      </p>
      {(links.tables.length > 0 || links.events.length > 0) ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
              Link floor table <span className="font-normal normal-case tracking-normal text-[#94a3b8]">(optional)</span>
            </label>
            <select
              value={linkedTableId}
              onChange={(e) => setLinkedTableId(e.target.value)}
              disabled={busy || links.tables.length === 0}
              className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-white px-3 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25 disabled:opacity-60"
            >
              <option value="">—</option>
              {links.tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
              Link hosted night <span className="font-normal normal-case tracking-normal text-[#94a3b8]">(optional)</span>
            </label>
            <select
              value={linkedEventId}
              onChange={(e) => setLinkedEventId(e.target.value)}
              disabled={busy || links.events.length === 0}
              className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-white px-3 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25 disabled:opacity-60"
            >
              <option value="">—</option>
              {links.events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`confirm-start-${request.id}`} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
            Starts
          </label>
          <input
            id={`confirm-start-${request.id}`}
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            disabled={busy}
            className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-white px-3 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25 disabled:opacity-60"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`confirm-end-${request.id}`} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
            Ends
          </label>
          <input
            id={`confirm-end-${request.id}`}
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            disabled={busy}
            className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-white px-3 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25 disabled:opacity-60"
          />
        </div>
      </div>
      <div className="mt-3 space-y-1">
        <label htmlFor={`confirm-title-${request.id}`} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
          Title override <span className="font-normal normal-case tracking-normal text-[#94a3b8]">(optional)</span>
        </label>
        <input
          id={`confirm-title-${request.id}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
          placeholder={request.event_title?.trim() || `${request.customer_name} · booking`}
          className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-white px-3 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25 disabled:opacity-60"
        />
      </div>
      <div className="mt-3 space-y-1">
        <label htmlFor={`confirm-notes-${request.id}`} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
          Staff-only notes <span className="font-normal normal-case tracking-normal text-[#94a3b8]">(optional)</span>
        </label>
        <textarea
          id={`confirm-notes-${request.id}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={busy}
          rows={2}
          placeholder="Deposit collected · allergy heads-up · VIP flags…"
          className="w-full resize-none rounded-xl border border-[#ebe7f7] bg-white px-3 py-2 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25 disabled:opacity-60"
        />
      </div>
      {err ? <p className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-900">{err}</p> : null}
      <button
        type="button"
        disabled={busy}
        className={cn(
          buttonVariants({ variant: "default" }),
          "mt-4 rounded-full px-6 font-semibold shadow-md shadow-[#7c3aed]/25 disabled:opacity-50",
        )}
        onClick={() => submit()}
      >
        {busy ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden /> : null}
        Save confirmed booking
      </button>
    </div>
  );
}

function channelLabel(ch: BookingMessageRow["channel"], metadata?: Record<string, unknown>) {
  switch (ch) {
    case "sms":
      return "SMS";
    case "email":
      return "Email";
    case "voice":
      return metadata?.delivery === "vapi_outbound" ? "AI call" : "Call log";
    default:
      return "Note";
  }
}

function bubbleCaption(m: BookingMessageRow) {
  const who = m.direction === "outbound" ? "Solvio team" : "Guest";
  const bits = [who, channelLabel(m.channel, m.metadata)];
  if (m.direction === "outbound" && m.metadata?.from_noreply) {
    bits.push("noreply trail");
  }
  return bits.join(" · ");
}

function summarizeIntakeExtras(v: unknown): string | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const cleaned: Record<string, unknown> = { ...(v as Record<string, unknown>) };
  delete cleaned.booking_kind_key;
  if (Object.keys(cleaned).length === 0) return null;
  try {
    return JSON.stringify(cleaned, null, 2);
  } catch {
    return null;
  }
}

function BookingDepositSection({
  request,
  stripeReady,
  pending,
}: {
  request: BookingRequestRow;
  stripeReady: boolean;
  pending: boolean;
}) {
  const [amountEuro, setAmountEuro] = useState("");
  const [localPending, startLocal] = useTransition();
  const [depositError, setDepositError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const paid = request.payment_status === "paid";
  const busy = pending || localPending;

  if (!stripeReady) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-[#0f172a]">Collect a deposit</p>
        <p className="text-sm leading-relaxed text-[#64748b]">
          Connect Stripe to send checkout links. Set table prices under Bookings → Tables.
        </p>
        <StripeConnectRequiredCallout businessId={request.business_id} />
      </div>
    );
  }

  if (paid) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
        <p className="font-semibold">Deposit collected</p>
        <p className="mt-1">
          {request.deposit_amount_cents
            ? `${formatMoneyDisplay(request.deposit_amount_cents)} marked paid via Stripe.`
            : "Payment recorded on this enquiry."}
        </p>
      </div>
    );
  }

  function createLink() {
    setDepositError(null);
    setCheckoutUrl(null);
    const trimmed = amountEuro.trim();
    const overrideCents = trimmed.length ? parseEuroInputToCents(trimmed) : undefined;
    if (overrideCents != null && overrideCents < 50) {
      setDepositError(`Enter a valid amount of at least ${formatMoneyDisplay(50)}, or leave blank to use table pricing.`);
      return;
    }
    startLocal(() => {
      void (async () => {
        try {
          const { checkoutUrl: url } = await createDepositCheckoutForBookingRequest({
            businessId: request.business_id,
            bookingRequestId: request.id,
            amountCents: overrideCents,
          });
          setCheckoutUrl(url);
        } catch (e) {
          setDepositError(e instanceof Error ? e.message : "Could not create payment link.");
        }
      })();
    });
  }

  return (
    <div className="rounded-2xl border border-[#ede9fe] bg-[#fafbff] px-4 py-4">
      <div className="flex items-start gap-3">
        <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-[#7c3aed]" aria-hidden />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-semibold text-[#0f172a]">Stripe deposit link</p>
            <p className="mt-1 text-xs leading-relaxed text-[#64748b]">
              Creates a checkout on your connected Stripe account. Solvio retains your plan&apos;s platform fee (1–2.5% based on tier);
              you receive the remainder. Leave amount blank to use the table price you configured — or enter a custom {moneySymbol()} amount below.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label htmlFor={`dep-euro-${request.id}`} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                Custom amount ({moneySymbol()})
              </label>
              <input
                id={`dep-euro-${request.id}`}
                type="text"
                inputMode="decimal"
                value={amountEuro}
                onChange={(e) => setAmountEuro(sanitizeEuroInput(e.target.value))}
                placeholder="Uses table price"
                className="h-10 w-36 rounded-xl border border-[#ebe7f7] bg-white px-3 text-sm"
              />
            </div>
            <Button type="button" disabled={busy} className="rounded-full font-semibold" onClick={() => createLink()}>
              {busy ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden /> : null}
              Create payment link
            </Button>
          </div>
          {depositError ? <p className="text-sm text-rose-800">{depositError}</p> : null}
          {checkoutUrl ? (
            <div className="space-y-2 rounded-xl border border-[#dbeafe] bg-white px-3 py-3 text-sm">
              <p className="font-semibold text-[#0f172a]">Link ready — send to {request.customer_name}</p>
              <a
                href={checkoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all font-mono text-xs text-[#7c3aed] underline-offset-2 hover:underline"
              >
                {checkoutUrl}
              </a>
              <p className="text-xs text-[#64748b]">Guest pays on Stripe; funds land in your connected account.</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type BookingInboxProps = {
  requests: BookingRequestRow[];
  bizNameById: Record<string, string>;
  stripeReadyByBizId?: Record<string, boolean>;
  inventoryLinks?: {
    tables: { id: string; label: string }[];
    events: { id: string; title: string }[];
  };
  /** Opens the matching inbound card when navigating from elsewhere (e.g. confirmed bookings). */
  highlightBookingRequestId?: string | null;
  publicBookingUrl?: string | null;
  bookingFlowComplete?: boolean;
};

export function BookingInbox({
  requests,
  bizNameById,
  stripeReadyByBizId,
  inventoryLinks,
  highlightBookingRequestId,
  publicBookingUrl,
  bookingFlowComplete,
}: BookingInboxProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [msgByBooking, setMsgByBooking] = useState<Record<string, BookingMessageRow[]>>({});
  const [bulkBody, setBulkBody] = useState("");
  const [singleBody, setSingleBody] = useState("");
  const [inboundBody, setInboundBody] = useState("");
  const [inboundChannel, setInboundChannel] = useState<"sms" | "email">("sms");
  const [error, setError] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState("");

  const selectedIds = useMemo(() => [...selected], [selected]);

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) => {
      const haystack = [
        r.customer_name,
        r.email,
        r.phone ?? "",
        r.event_title ?? "",
        r.booking_kind ?? "",
        r.notes ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [requests, searchQuery]);

  useEffect(() => {
    setSingleBody("");
    setInboundBody("");
    setError(null);
  }, [expandedId]);

  useEffect(() => {
    const id = highlightBookingRequestId?.trim();
    if (!id?.length || !requests.some((r) => r.id === id)) return;
    setExpandedId(id);
  }, [highlightBookingRequestId, requests]);

  useEffect(() => {
    if (!expandedId) return;
    let cancelled = false;
    setThreadLoading(true);
    void fetchBookingMessages(expandedId)
      .then((rows) => {
        if (!cancelled) {
          setMsgByBooking((prev) => ({ ...prev, [expandedId]: rows }));
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load chat.");
        }
      })
      .finally(() => {
        if (!cancelled) setThreadLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expandedId]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  function selectAllToggle() {
    if (!filteredRequests.length) return;
    const allOn = filteredRequests.every((r) => selected.has(r.id));
    setSelected(allOn ? new Set() : new Set(filteredRequests.map((r) => r.id)));
  }

  function refreshThread(id: string) {
    void fetchBookingMessages(id).then((rows) => setMsgByBooking((prev) => ({ ...prev, [id]: rows })));
  }

  function runBulk(channel: "sms" | "email" | "voice") {
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          await sendBookingOutboundBulk({
            bookingRequestIds: selectedIds,
            channel,
            body: bulkBody,
            fromNoreply: true,
          });
          setBulkBody("");
          router.refresh();
          selectedIds.forEach((id) => {
            if (expandedId === id) refreshThread(id);
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Bulk send failed.");
        }
      })();
    });
  }

  function runSingle(channel: "sms" | "email") {
    if (!expandedId) return;
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          await sendBookingOutboundBulk({
            bookingRequestIds: [expandedId],
            channel,
            body: singleBody,
            fromNoreply: true,
          });
          setSingleBody("");
          refreshThread(expandedId);
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not send.");
        }
      })();
    });
  }

  function runBulkVoiceCalls() {
    if (!bulkBody.trim()) return;
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          const targets = filteredRequests.filter((r) => selected.has(r.id) && r.phone?.trim());
          if (!targets.length) {
            setError("Selected guests need a phone number for AI calls.");
            return;
          }
          let ok = 0;
          const failures: string[] = [];
          for (const r of targets) {
            const res = await callBookingRequestGuestAction({
              bookingRequestId: r.id,
              purpose: "guest_request_reply",
              changeSummary: bulkBody.trim(),
            });
            if (res.ok) ok += 1;
            else failures.push(`${r.customer_name}: ${res.message}`);
          }
          setBulkBody("");
          router.refresh();
          selectedIds.forEach((id) => {
            if (expandedId === id) refreshThread(id);
          });
          if (failures.length) {
            setError(`Started ${ok} call(s). ${failures.slice(0, 3).join(" · ")}${failures.length > 3 ? "…" : ""}`);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Bulk call failed.");
        }
      })();
    });
  }

  function runInbound() {
    if (!expandedId) return;
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          await recordBookingInbound(expandedId, inboundChannel, inboundBody);
          setInboundBody("");
          refreshThread(expandedId);
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save inbound reply.");
        }
      })();
    });
  }

  const messages = expandedId ? msgByBooking[expandedId] ?? [] : [];

  return (
    <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
      <CardHeader className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-lg text-[#0f172a]">Inbound requests</CardTitle>
          <CardDescription className="text-[14px] text-[#64748b]">
            Tick guests for bulk Solvio messages (logged as noreply trails). Expand a row to see the chat log and record what each guest
            said — plug SMS gateways later for real delivery & auto-ingest.
          </CardDescription>
        </div>
        <Badge variant="outline" className="w-fit rounded-full border-[#ebe7f7] text-[11px] font-semibold uppercase tracking-[0.2em] text-[#64748b]">
          {filteredRequests.length === requests.length
            ? `${requests.length} shown`
            : `${filteredRequests.length} of ${requests.length} shown`}
          {selectedIds.length > 0 ? ` · ${selectedIds.length} selected` : ""}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-6 pb-6">
        {requests.length > 0 ? (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" aria-hidden />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guests by name, email, phone, or event…"
              className="h-11 w-full rounded-full border border-[#ebe7f7] bg-[#fafbff] pl-10 pr-10 text-[14px] outline-none placeholder:text-[#94a3b8] focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#94a3b8] hover:bg-[#f5f3ff] hover:text-[#0f172a]"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
        {!requests.length ? (
          <InboxEmptyState publicBookingUrl={publicBookingUrl} bookingFlowComplete={bookingFlowComplete} />
        ) : !filteredRequests.length ? (
          <p className="rounded-2xl border border-[#f1eefc] bg-[#fafbff] px-4 py-8 text-center text-sm text-[#64748b]">
            No guests match <span className="font-semibold text-[#0f172a]">&ldquo;{searchQuery}&rdquo;</span> — try a different name, phone, or email.
          </p>
        ) : (
          <>
            <div className="rounded-[20px] border border-[#ede9fe] bg-[#fafbff]/90 p-5 shadow-inner shadow-[#ede9fe]/40">
              <p className="text-sm font-semibold text-[#0f172a]">Message selected guests</p>
              <p className="mt-1 text-xs leading-relaxed text-[#64748b]">
                Same message posts once per guest — SMS/email log in-app. AI calls dial each selected guest with your receptionist.
              </p>
              <textarea
                value={bulkBody}
                onChange={(e) => setBulkBody(e.target.value)}
                disabled={pending}
                rows={3}
                placeholder="Example: Hi from Solvio — your Saturday table is confirmed for two at 7pm. Reply STOP to opt out."
                className="mt-4 w-full resize-none rounded-xl border border-[#ebe7f7] bg-white px-4 py-3 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25 disabled:opacity-60"
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending || selectedIds.length === 0 || !bulkBody.trim()}
                  className={cn(
                    buttonVariants({ variant: "default" }),
                    "rounded-full px-5 font-semibold shadow-md shadow-[#7c3aed]/20 disabled:opacity-45",
                  )}
                  onClick={() => runBulk("sms")}
                >
                  {pending ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden /> : <Send className="mr-2 inline h-4 w-4" aria-hidden />}
                  SMS · noreply
                </button>
                <button
                  type="button"
                  disabled={pending || selectedIds.length === 0 || !bulkBody.trim()}
                  className={cn(buttonVariants({ variant: "outline" }), "rounded-full border-[#ebe7f7] px-5 font-semibold disabled:opacity-45")}
                  onClick={() => runBulk("email")}
                >
                  Email · noreply
                </button>
                <button
                  type="button"
                  disabled={pending || selectedIds.length === 0 || !bulkBody.trim()}
                  className={cn(buttonVariants({ variant: "outline" }), "rounded-full border-[#ddd6fe] px-5 font-semibold text-[#5b21b6] disabled:opacity-45")}
                  onClick={() => runBulkVoiceCalls()}
                >
                  <Phone className="mr-2 inline h-4 w-4" aria-hidden />
                  AI call all
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className={cn(buttonVariants({ variant: "ghost" }), "rounded-full px-4 font-semibold text-[#64748b]")}
                  onClick={() => setSelected(new Set())}
                >
                  Clear selection
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className={cn(buttonVariants({ variant: "ghost" }), "rounded-full px-4 font-semibold text-[#7c3aed]")}
                  onClick={selectAllToggle}
                >
                  Select / deselect all
                </button>
              </div>
            </div>

            {error ? (
              <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>
            ) : null}

            <div className="overflow-x-auto rounded-2xl border border-[#f1eefc]">
              <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[#ebe7f7] bg-[#fafbff] text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">
                    <th className="w-12 px-3 py-3 font-semibold">
                      <span className="sr-only">Select</span>
                      <input
                        type="checkbox"
                        checked={filteredRequests.length > 0 && filteredRequests.every((r) => selected.has(r.id))}
                        onChange={selectAllToggle}
                        className="h-4 w-4 rounded border-[#cbd5e1] text-[#7c3aed] focus:ring-[#7c3aed]"
                        aria-label="Select all bookings on this page"
                      />
                    </th>
                    <th className="px-4 py-3 font-semibold">Guest</th>
                    <th className="px-4 py-3 font-semibold">Venue</th>
                    <th className="px-4 py-3 font-semibold">When / notes</th>
                    <th className="px-4 py-3 font-semibold">Contact</th>
                    <th className="px-4 py-3 font-semibold">Chat</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((r) => {
                    const venue = bizNameById[r.business_id] ?? "—";
                    const intake = intakeSummaryLine(r);
                    const whenBits =
                      [intake, r.preferred_time?.trim(), r.notes?.trim()].filter(Boolean).join(" · ") || "—";
                    const open = expandedId === r.id;
                    const payBadge = paymentStatusBadge(r.payment_status, r.deposit_amount_cents);
                    return (
                      <Fragment key={r.id}>
                        <tr className={cn("border-b border-[#f8fafc] last:border-0", open ? "bg-[#fafbff]/70" : "")}>
                          <td className="px-3 py-4 align-top">
                            <input
                              type="checkbox"
                              checked={selected.has(r.id)}
                              onChange={() => toggleSelected(r.id)}
                              className="h-4 w-4 rounded border-[#cbd5e1] text-[#7c3aed] focus:ring-[#7c3aed]"
                              aria-label={`Select ${r.customer_name}`}
                            />
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-[#0f172a]">{r.customer_name}</p>
                              {r.booking_kind?.trim() ? (
                                <Badge variant="secondary" className="rounded-full bg-[#f5f3ff] px-2 py-0 text-[10px] font-semibold uppercase tracking-wide text-[#7c3aed] hover:bg-[#f5f3ff]">
                                  {bookingKindLabel(r.booking_kind)}
                                </Badge>
                              ) : null}
                              {payBadge ? (
                                <span className={payBadge.className}>{payBadge.label}</span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-[#94a3b8]">
                              {new Date(r.created_at).toLocaleString(undefined, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </p>
                          </td>
                          <td className="px-4 py-4 align-top text-[#475569]">{venue}</td>
                          <td className="max-w-[220px] px-4 py-4 align-top text-[#475569]">
                            <span className="line-clamp-3">{whenBits}</span>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="flex flex-wrap gap-2">
                              <Link
                                href={`mailto:${encodeURIComponent(r.email)}`}
                                className={cn(
                                  buttonVariants({ variant: "outline", size: "sm" }),
                                  "h-9 rounded-full border-[#ebe7f7] px-3 text-xs font-semibold",
                                )}
                              >
                                <Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                                Email
                              </Link>
                              {r.phone ? (
                                <>
                                  <Link
                                    href={telBookingHref(r.phone)}
                                    className={cn(
                                      buttonVariants({ variant: "outline", size: "sm" }),
                                      "h-9 rounded-full border-[#ebe7f7] px-3 text-xs font-semibold",
                                    )}
                                  >
                                    <Phone className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                                    Call
                                  </Link>
                                  <Link
                                    href={smsBookingHref(r.phone, venue)}
                                    className={cn(
                                      buttonVariants({ variant: "default", size: "sm" }),
                                      "h-9 rounded-full px-3 text-xs font-semibold shadow-sm shadow-[#7c3aed]/15",
                                    )}
                                  >
                                    <MessageSquare className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                                    SMS
                                  </Link>
                                  <GuestAiCallButton
                                    guestName={r.customer_name}
                                    guestPhone={r.phone}
                                    bookingLabel={r.event_title?.trim() || "Enquiry"}
                                    defaultPurpose="guest_request_reply"
                                    defaultChangeSummary={r.notes?.trim() || r.preferred_time?.trim() || ""}
                                    triggerLabel="AI call"
                                    triggerClassName="h-9 rounded-full px-3 text-xs"
                                    onCall={({ purpose, changeSummary, customScript }) =>
                                      callBookingRequestGuestAction({
                                        bookingRequestId: r.id,
                                        purpose,
                                        changeSummary,
                                        customScript,
                                      }).then((res) => {
                                        if (res.ok) refreshThread(r.id);
                                        return res;
                                      })
                                    }
                                  />
                                </>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-[#f8fafc] px-3 py-1 text-[11px] font-medium text-[#94a3b8]">
                                  Phone not shared
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-9 rounded-full px-3 text-xs font-semibold text-[#7c3aed]"
                              onClick={() => toggleExpand(r.id)}
                            >
                              {open ? (
                                <>
                                  Hide <ChevronUp className="ml-1 inline h-3.5 w-3.5" aria-hidden />
                                </>
                              ) : (
                                <>
                                  Chat log <ChevronDown className="ml-1 inline h-3.5 w-3.5" aria-hidden />
                                </>
                              )}
                            </Button>
                          </td>
                        </tr>
                        {open ? (
                          <tr className="border-b border-[#ebe7f7] bg-[#fafbff]/95">
                            <td colSpan={6} className="px-4 py-6 md:px-8">
                              <div className="mx-auto max-w-3xl space-y-6">
                                <div className="rounded-2xl border border-[#ebe7f7] bg-white px-5 py-4 text-sm text-[#475569] shadow-sm">
                                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Original submission</p>
                                  <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                                    <div>
                                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">Email</dt>
                                      <dd className="font-medium text-[#0f172a]">{r.email}</dd>
                                    </div>
                                    <div>
                                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">Phone</dt>
                                      <dd className="font-medium text-[#0f172a]">{r.phone?.trim() || "—"}</dd>
                                    </div>
                                    <div className="sm:col-span-2">
                                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">Occasion / event</dt>
                                      <dd>{r.event_title?.trim() || "—"}</dd>
                                    </div>
                                    <div>
                                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">Booking type</dt>
                                      <dd>{bookingKindLabel(r.booking_kind)}</dd>
                                    </div>
                                    <div>
                                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">Preferred date</dt>
                                      <dd>{fmtRequestedDate(r.requested_date) ?? "—"}</dd>
                                    </div>
                                    <div>
                                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">Party size</dt>
                                      <dd>
                                        {typeof r.guest_count === "number" && r.guest_count > 0 ? `${r.guest_count}` : "—"}
                                      </dd>
                                    </div>
                                    <div className="sm:col-span-2">
                                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">Timing</dt>
                                      <dd>{r.preferred_time?.trim() || "—"}</dd>
                                    </div>
                                    <div className="sm:col-span-2">
                                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">Guest notes</dt>
                                      <dd>{r.notes?.trim() || "—"}</dd>
                                    </div>
                                    {summarizeIntakeExtras(r.intake_extras) ? (
                                      <div className="sm:col-span-2">
                                        <details className="rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 py-2 text-[13px] text-[#475569]">
                                          <summary className="cursor-pointer font-semibold text-[#5b21b6]">
                                            Structured intake (JSON)
                                          </summary>
                                          <pre className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-[#334155]">
                                            {summarizeIntakeExtras(r.intake_extras)}
                                          </pre>
                                        </details>
                                      </div>
                                    ) : null}
                                  </dl>
                                </div>

                                <BookingDepositSection
                                  request={r}
                                  stripeReady={Boolean(stripeReadyByBizId?.[r.business_id])}
                                  pending={pending}
                                />

                                <ConfirmBookingSlotSection
                                  request={r}
                                  pending={pending}
                                  links={{
                                    tables: inventoryLinks?.tables ?? [],
                                    events: inventoryLinks?.events ?? [],
                                  }}
                                  onScheduled={() => router.refresh()}
                                />

                                <div>
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-semibold text-[#0f172a]">Conversation</p>
                                    {threadLoading ? (
                                      <span className="flex items-center gap-2 text-xs text-[#64748b]">
                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                        Loading…
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="mt-4 flex max-h-[420px] flex-col gap-3 overflow-y-auto rounded-2xl border border-[#f1eefc] bg-white px-4 py-5">
                                    {!messages.length ? (
                                      <p className="text-center text-sm text-[#94a3b8]">
                                        No outbound or inbound logs yet — send from Solvio above or paste what this guest replied.
                                      </p>
                                    ) : (
                                      messages.map((m) => (
                                        <div
                                          key={m.id}
                                          className={cn(
                                            "max-w-[92%] rounded-2xl border px-4 py-3 text-[15px] leading-relaxed shadow-sm md:max-w-[80%]",
                                            m.direction === "outbound"
                                              ? "ml-auto border-[#ddd6fe] bg-[#f5f3ff] text-[#0f172a]"
                                              : "mr-auto border-[#e2e8f0] bg-[#f8fafc] text-[#0f172a]",
                                          )}
                                        >
                                          <p className="whitespace-pre-wrap">{m.body}</p>
                                          <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#64748b]">
                                            {bubbleCaption(m)}
                                          </p>
                                          <p className="mt-1 text-[11px] text-[#94a3b8]">
                                            {new Date(m.created_at).toLocaleString(undefined, {
                                              dateStyle: "medium",
                                              timeStyle: "short",
                                            })}
                                          </p>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>

                                <div className="grid gap-5 rounded-2xl border border-dashed border-[#ddd6fe] bg-white/90 px-5 py-5 md:grid-cols-2">
                                  <div className="space-y-3">
                                    <p className="text-sm font-semibold text-[#0f172a]">Send from Solvio</p>
                                    <textarea
                                      value={singleBody}
                                      onChange={(e) => setSingleBody(e.target.value)}
                                      disabled={pending}
                                      rows={4}
                                      placeholder="SMS/email body or what your AI receptionist should tell this guest…"
                                      className="w-full resize-none rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25 disabled:opacity-60"
                                    />
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        disabled={pending || !singleBody.trim()}
                                        className={cn(
                                          buttonVariants({ variant: "default", size: "sm" }),
                                          "rounded-full px-4 font-semibold",
                                        )}
                                        onClick={() => runSingle("sms")}
                                      >
                                        SMS · noreply
                                      </button>
                                      <button
                                        type="button"
                                        disabled={pending || !singleBody.trim()}
                                        className={cn(
                                          buttonVariants({ variant: "outline", size: "sm" }),
                                          "rounded-full border-[#ebe7f7] px-4 font-semibold",
                                        )}
                                        onClick={() => runSingle("email")}
                                      >
                                        Email · noreply
                                      </button>
                                      <GuestAiCallButton
                                        guestName={r.customer_name}
                                        guestPhone={r.phone}
                                        bookingLabel={r.event_title?.trim() || "Enquiry"}
                                        defaultPurpose="guest_request_reply"
                                        defaultChangeSummary={singleBody.trim() || r.notes?.trim() || ""}
                                        triggerLabel="AI call guest"
                                        triggerClassName="rounded-full px-4 text-xs"
                                        disabled={pending}
                                        onCall={({ purpose, changeSummary, customScript }) =>
                                          callBookingRequestGuestAction({
                                            bookingRequestId: r.id,
                                            purpose,
                                            changeSummary: changeSummary || singleBody.trim(),
                                            customScript,
                                          }).then((res) => {
                                            if (res.ok) {
                                              setSingleBody("");
                                              refreshThread(r.id);
                                              router.refresh();
                                            }
                                            return res;
                                          })
                                        }
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-3 border-t border-[#f1eefc] pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                                    <p className="text-sm font-semibold text-[#0f172a]">Record guest reply</p>
                                    <p className="text-xs leading-relaxed text-[#64748b]">
                                      Paste SMS/email transcripts until carrier webhooks pipe inbound chatter straight into Solvio.
                                    </p>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        className={cn(
                                          inboundChannel === "sms"
                                            ? buttonVariants({ variant: "default", size: "sm" })
                                            : buttonVariants({ variant: "outline", size: "sm" }),
                                          "rounded-full px-4 font-semibold",
                                        )}
                                        onClick={() => setInboundChannel("sms")}
                                      >
                                        SMS
                                      </button>
                                      <button
                                        type="button"
                                        className={cn(
                                          inboundChannel === "email"
                                            ? buttonVariants({ variant: "default", size: "sm" })
                                            : buttonVariants({ variant: "outline", size: "sm" }),
                                          "rounded-full px-4 font-semibold",
                                        )}
                                        onClick={() => setInboundChannel("email")}
                                      >
                                        Email
                                      </button>
                                    </div>
                                    <textarea
                                      value={inboundBody}
                                      onChange={(e) => setInboundBody(e.target.value)}
                                      disabled={pending}
                                      rows={4}
                                      placeholder={`Paste what they said (${inboundChannel})…`}
                                      className="w-full resize-none rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25 disabled:opacity-60"
                                    />
                                    <button
                                      type="button"
                                      disabled={pending || !inboundBody.trim()}
                                      className={cn(
                                        buttonVariants({ variant: "secondary", size: "sm" }),
                                        "rounded-full px-5 font-semibold",
                                      )}
                                      onClick={() => runInbound()}
                                    >
                                      Save inbound message
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
