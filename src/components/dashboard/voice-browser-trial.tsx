"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, MessageCircle, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Msg = { role: "guest" | "agent"; text: string };

function synthesizeReply(businessName: string, persona: string, userLine: string): string {
  const clip = persona.trim().slice(0, 1400);
  const intent = userLine.trim() || "your question";
  return (
    `Thanks for reaching ${businessName}. ` +
    `I'm operating from your configured briefing (${clip ? "loaded" : "still generic"} instructions). ` +
    `Regarding “${intent.slice(0, 220)}${intent.length > 220 ? "…" : ""}”—I'll capture what we need and offer to send someone from the team if it gets nuanced. ` +
    `Would you prefer SMS or email for follow-up?`
  );
}

type VoiceBrowserTrialProps = {
  businessName: string;
  agentPrompt: string;
  toneLabel: string;
};

export function VoiceBrowserTrial({ businessName, agentPrompt, toneLabel }: VoiceBrowserTrialProps) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "agent",
      text: `Hi — thanks for calling ${businessName}. I'm your AI reception (${toneLabel} tone). What can I help with today?`,
    },
  ]);
  const [draft, setDraft] = useState("");
  const [speak, setSpeak] = useState(true);
  const [busy, setBusy] = useState(false);
  const synthRef = useRef(typeof window !== "undefined" ? window.speechSynthesis : null);

  const speakLine = useCallback(
    (text: string) => {
      if (!speak || !synthRef.current) return;
      synthRef.current.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1;
      synthRef.current.speak(u);
    },
    [speak],
  );

  function sendGuestLine() {
    const line = draft.trim();
    if (!line || busy) return;
    setBusy(true);
    setDraft("");
    setMessages((prev) => [...prev, { role: "guest", text: line }]);

    window.setTimeout(() => {
      const reply = synthesizeReply(businessName, agentPrompt, line);
      setMessages((prev) => [...prev, { role: "agent", text: reply }]);
      speakLine(reply);
      setBusy(false);
    }, 420);
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[#ebe7f7] bg-[#fafbff] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <MessageCircle className="mt-0.5 h-5 w-5 text-[#7c3aed]" aria-hidden />
          <div>
            <h3 className="text-lg font-semibold text-[#0f172a]">Try it in the browser</h3>
            <p className="mt-1 text-sm leading-relaxed text-[#64748b]">
              This preview stitches your briefing into placeholder replies — swap for streamed Vapi audio anytime. Toggle voice output if your browser allows synthesis.
            </p>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#475569]">
          <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} className="rounded border-[#cbd5e1]" />
          <Volume2 className="h-4 w-4 text-[#64748b]" aria-hidden />
          Speak replies
        </label>
      </div>

      <div className="max-h-[280px] space-y-3 overflow-y-auto rounded-xl border border-[#f1eefc] bg-white px-4 py-4">
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={cn(
              "flex",
              m.role === "guest" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[92%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                m.role === "guest" ? "bg-[#f5f3ff] text-[#312e81]" : "bg-[#f8fafc] text-[#0f172a]",
              )}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">
                {m.role === "guest" ? "Caller" : "AI reception"}
              </span>
              <span className="mt-1 block whitespace-pre-wrap">{m.text}</span>
            </div>
          </div>
        ))}
        {busy ? (
          <p className="flex items-center gap-2 text-xs text-[#64748b]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Thinking…
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              sendGuestLine();
            }
          }}
          placeholder='Type as if you’re the caller ("need a boiler quote tomorrow")…'
          className="h-11 flex-1 rounded-xl border border-[#ebe7f7] bg-white px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
        />
        <Button type="button" className="rounded-full px-6 font-semibold shadow-md shadow-[#7c3aed]/25" onClick={() => sendGuestLine()} disabled={busy}>
          Send
        </Button>
      </div>
    </div>
  );
}
