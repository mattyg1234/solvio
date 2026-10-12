"use client";

import { Check, Loader2 } from "lucide-react";
import { useId, useState } from "react";

import { ChatAvatar, roleTag } from "@/components/show-ops/chat/chat-parts";
import { CHAT_MAX_GROUP_NAME } from "@/lib/show-ops/chat/logic";
import type { ChatPerson } from "@/lib/show-ops/chat/types";
import { cn } from "@/lib/utils";

/** Start a one-to-one chat (pick one person) or a named group (pick several). */
export function NewChatForm({
  people,
  meId,
  busy,
  error,
  onDirect,
  onGroup,
  onCancel,
}: {
  people: ChatPerson[];
  meId: string;
  busy: boolean;
  error: string | null;
  onDirect: (userId: string) => void;
  onGroup: (name: string, userIds: string[]) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const id = useId();
  const others = people.filter((p) => p.id !== meId);
  const shown = filter.trim()
    ? others.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : others;

  return (
    <div className="border-b border-slate-100 p-3">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold" role="tablist">
        {(["direct", "group"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn("rounded-lg px-2 py-1.5", mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
          >
            {m === "direct" ? "Message someone" : "New group"}
          </button>
        ))}
      </div>

      {mode === "group" ? (
        <div className="mt-3">
          <label htmlFor={`${id}-name`} className="text-xs font-semibold text-slate-600">
            Group name
          </label>
          <input
            id={`${id}-name`}
            value={name}
            maxLength={CHAT_MAX_GROUP_NAME}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Lanzarote pick-ups"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
          />
        </div>
      ) : null}

      {others.length > 6 ? (
        <input
          aria-label="Find a teammate"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a teammate"
          className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
        />
      ) : null}

      <ul className="mt-2 max-h-64 overflow-y-auto" aria-label="Teammates">
        {others.length === 0 ? <li className="px-2 py-2 text-sm text-slate-500">Nobody else is on the team yet.</li> : null}
        {shown.map((p) => {
          const on = picked.includes(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                disabled={busy}
                aria-pressed={mode === "group" ? on : undefined}
                onClick={() => {
                  if (mode === "direct") onDirect(p.id);
                  else setPicked((cur) => (on ? cur.filter((x) => x !== p.id) : [...cur, p.id]));
                }}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-violet-50 disabled:opacity-60"
              >
                <ChatAvatar id={p.id} name={p.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{p.name}</span>
                  <span className="block truncate text-xs text-slate-500">{roleTag(p.role)}</span>
                </span>
                {mode === "group" ? (
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-md ring-1",
                      on ? "bg-[var(--show-ops-primary,#7c3aed)] text-white ring-transparent" : "ring-slate-300",
                    )}
                  >
                    {on ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        {mode === "group" ? (
          <button
            type="button"
            disabled={busy || !name.trim() || !picked.length}
            onClick={() => onGroup(name, picked)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Create group{picked.length ? ` (${picked.length + 1})` : ""}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
