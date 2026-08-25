"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, MessageCircle, Send, Sparkles } from "lucide-react";

import { askOpsBrainAction, type OpsAskMessage } from "@/app/dashboard/show-ops/ask/actions";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "How many bookings do we have today?",
  "How many bus seats do we need tomorrow?",
  "What’s unpaid on deposits this week?",
  "Find booking for guest Smith",
  "Create a booking for 2 adults tomorrow — walk me through it",
];

export function OpsBrainChat({
  displayName,
  primaryColor = "#7c3aed",
}: {
  displayName: string;
  primaryColor?: string;
}) {
  const [history, setHistory] = useState<OpsAskMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [history, pending]);

  function send(message: string) {
    const trimmed = message.trim();
    if (!trimmed) return;
    setError(null);
    setInput("");
    const nextHistory: OpsAskMessage[] = [...history, { role: "user", content: trimmed }];
    setHistory(nextHistory);
    startTransition(() => {
      void askOpsBrainAction({ history, message: trimmed }).then((res) => {
        if (res.ok) {
          setHistory([...nextHistory, { role: "assistant", content: res.reply }]);
        } else {
          setError(res.message);
          setHistory(history);
          setInput(trimmed);
        }
      });
    });
  }

  return (
    <div className="flex h-[calc(100vh-240px)] min-h-[480px] flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
          style={{ backgroundColor: primaryColor }}
        >
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">Ops Brain · {displayName}</p>
          <p className="text-xs text-slate-500">
            Asks your live bookings, buses, unpaid deposits — can draft and create bookings with your OK.
          </p>
        </div>
      </div>

      <div ref={scrollerRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {history.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={pending}
                  onClick={() => send(q)}
                  className="rounded-full bg-slate-50 px-3 py-1.5 text-left text-sm text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                >
                  <MessageCircle className="mr-1.5 inline h-3.5 w-3.5 opacity-60" aria-hidden />
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {history.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
              m.role === "user" ? "ml-auto text-white" : "mr-auto bg-slate-50 text-slate-900 ring-1 ring-slate-100",
            )}
            style={m.role === "user" ? { backgroundColor: primaryColor } : undefined}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}

        {pending ? (
          <div className="mr-auto inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500 ring-1 ring-slate-100">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Checking your ops data…
          </div>
        ) : null}

        {error ? (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-100">{error}</p>
        ) : null}
      </div>

      <form
        className="flex items-center gap-2 border-t border-slate-100 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={pending}
          placeholder="Ask about bookings, buses, unpaid…"
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-700/20"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white disabled:opacity-50"
          style={{ backgroundColor: primaryColor }}
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
