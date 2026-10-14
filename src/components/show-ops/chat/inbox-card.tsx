"use client";

import { ChevronRight, MessageCircle } from "lucide-react";
import Link from "next/link";

import type { ChatInboxCard } from "@/lib/show-ops/chat/types";
import { cn } from "@/lib/utils";

/**
 * A customer WhatsApp/SMS chat sent to a teammate. Opening it goes to the
 * customer inbox, which checks access itself and offers Accept / Pass.
 */
export function ChatInboxCardView({ card, className }: { card: ChatInboxCard; className?: string }) {
  return (
    <Link
      href={`/dashboard/show-ops/inbox?c=${encodeURIComponent(card.conversationId)}`}
      className={cn(
        "mt-1 flex min-w-0 items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300",
        className,
      )}
    >
      <span aria-hidden className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
        <MessageCircle className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{card.label}</span>
        <span className="block text-xs text-slate-500">Open the chat to read it and accept</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
    </Link>
  );
}
