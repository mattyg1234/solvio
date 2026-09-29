"use client";

import { AtSign } from "lucide-react";
import { useEffect, useState } from "react";

import { formatUnreadBadge, splitMentions } from "@/lib/show-ops/chat/logic";
import type { ChatPerson } from "@/lib/show-ops/chat/types";
import { showOpsRoleLabel } from "@/lib/show-ops/nav";
import { cn } from "@/lib/utils";

export const CHAT_PRIMARY = "var(--show-ops-primary,#7c3aed)";

const AVATAR_TONES = [
  "bg-violet-100 text-violet-800",
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-900",
  "bg-rose-100 text-rose-800",
  "bg-teal-100 text-teal-800",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${a}${b}`.toUpperCase();
}

export function ChatAvatar({ id, name, className }: { id: string; name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
        AVATAR_TONES[hash(id) % AVATAR_TONES.length],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

export function UnreadBadge({ count, mentions = 0, className }: { count: number; mentions?: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      {mentions > 0 ? (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-white" title="You were mentioned">
          <AtSign className="h-3 w-3" aria-hidden />
        </span>
      ) : null}
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold tabular-nums text-white">
        {formatUnreadBadge(count)}
      </span>
    </span>
  );
}

/** Message text with @mentions of teammates highlighted (and yours stronger). */
export function MentionText({
  text,
  people,
  meId,
  mine,
}: {
  text: string;
  people: ChatPerson[];
  meId: string;
  mine: boolean;
}) {
  const parts = splitMentions(text, people);
  return (
    <>
      {parts.map((p, i) =>
        p.personId ? (
          <span
            key={i}
            className={cn(
              "rounded px-0.5 font-semibold",
              mine
                ? "bg-white/20 text-white"
                : p.personId === meId
                  ? "bg-amber-100 text-amber-900"
                  : "bg-violet-50 text-violet-800",
            )}
          >
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

export function roleTag(role: string): string {
  return showOpsRoleLabel(role) || role;
}

/** Re-render every minute so "5 min ago" stays true. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

export function msgTime(iso: string, now: number): string {
  const d = new Date(iso);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  return sameDay ? timeFmt.format(d) : `${dayFmt.format(d)}, ${timeFmt.format(d)}`;
}

export function relTime(iso: string | null, now: number): string {
  if (!iso) return "";
  const diff = Math.max(0, now - Date.parse(iso));
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return dayFmt.format(new Date(iso));
}

export function dayDivider(iso: string, now: number): string {
  const d = new Date(iso);
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return "Today";
  const y = new Date(now - 86_400_000);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return dayFmt.format(d);
}
