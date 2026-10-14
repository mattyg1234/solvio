"use client";

import { AlertCircle, Check, CheckCheck, Clock } from "lucide-react";

import type { InboxChannel, InboxMessageStatus } from "@/lib/show-ops/inbox/types";
import { cn } from "@/lib/utils";

export function ChannelTag({ channel, className }: { channel: InboxChannel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
        channel === "whatsapp" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-sky-50 text-sky-800 ring-sky-200",
        className,
      )}
    >
      {channel === "whatsapp" ? "WhatsApp" : "SMS"}
    </span>
  );
}

const STATUS_LABEL: Record<string, string> = {
  sending: "Sending",
  queued: "Queued",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Not delivered",
  undelivered: "Not delivered",
};

/** Delivery state under a message the Hub sent. */
export function DeliveryStatus({ status, error }: { status: InboxMessageStatus; error: string | null }) {
  const label = STATUS_LABEL[status];
  if (!label) return null;
  const failed = status === "failed" || status === "undelivered";
  const Icon = failed ? AlertCircle : status === "read" || status === "delivered" ? CheckCheck : status === "sent" ? Check : Clock;
  return (
    <span className={cn("inline-flex items-center gap-1", failed ? "text-rose-700" : status === "read" ? "text-sky-600" : "text-slate-400")}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span>{failed && error ? `${label}: ${error}` : label}</span>
    </span>
  );
}

/** "23 h 10 min left" for the WhatsApp reply window. */
export function windowLeftLabel(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h} h ${m} min left` : `${m} min left`;
}
