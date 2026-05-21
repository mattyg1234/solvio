"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, MessageCircleQuestion, Send, Sparkles } from "lucide-react";

import { askSolvioAction, type AskMessage } from "@/app/dashboard/ask/actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SUGGESTED_QUESTIONS = [
  "What table did the last caller want to book?",
  "How busy are we on Wednesday?",
  "Show me bookings for next Friday.",
  "Did anyone mention a birthday on calls this week?",
  "What events are coming up in the next 14 days?",
];

export function AskSolvioChat() {
  const [history, setHistory] = useState<AskMessage[]>([]);
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
    const nextHistory: AskMessage[] = [...history, { role: "user", content: trimmed }];
    setHistory(nextHistory);
    startTransition(() => {
      void askSolvioAction({ history, message: trimmed }).then((res) => {
        if (res.ok) {
          setHistory([...nextHistory, { role: "assistant", content: res.reply }]);
        } else {
          setError(res.message);
          // Roll back the optimistic user message so they can try again.
          setHistory(history);
          setInput(trimmed);
        }
      });
    });
  }

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[480px] flex-col overflow-hidden rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-[#f1eefc] bg-gradient-to-r from-[#faf7ff] to-white px-6 py-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ede9fe] text-[#7c3aed]">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-[#0f172a]">Ask Solvio</p>
          <p className="text-xs text-[#64748b]">
            Looks up your bookings, calls, and events to answer in plain English.
          </p>
        </div>
      </div>

      <div ref={scrollerRef} className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {history.length === 0 ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3">
              <p className="text-sm font-semibold text-[#0f172a]">Try one of these to get started:</p>
              <p className="mt-1 text-xs text-[#64748b]">
                Click a suggestion or type your own question.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={pending}
                  onClick={() => send(q)}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "rounded-full border-[#ebe7f7] font-medium",
                  )}
                >
                  <MessageCircleQuestion className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
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
              "max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
              m.role === "user"
                ? "ml-auto bg-[#7c3aed] text-white"
                : "mr-auto bg-[#faf7ff] text-[#0f172a] ring-1 ring-[#ebe7f7]",
            )}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}

        {pending ? (
          <div className="mr-auto inline-flex items-center gap-2 rounded-2xl bg-[#faf7ff] px-4 py-3 text-sm text-[#64748b] ring-1 ring-[#ebe7f7]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Looking that up…
          </div>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>
        ) : null}
      </div>

      <form
        className="flex items-center gap-2 border-t border-[#f1eefc] bg-white px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={pending}
          placeholder="Ask anything about your bookings, calls, or events…"
          className="h-11 flex-1 rounded-full border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className={cn(
            buttonVariants({ variant: "default", size: "default" }),
            "h-11 rounded-full px-5 font-semibold shadow-md shadow-[#7c3aed]/20",
          )}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <>
              <Send className="mr-1.5 inline h-4 w-4" aria-hidden />
              Ask
            </>
          )}
        </button>
      </form>
    </div>
  );
}
