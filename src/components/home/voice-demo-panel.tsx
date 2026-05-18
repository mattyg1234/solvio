"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Phase = "idle" | "listening" | "thinking" | "speaking";

type Bubble = { id: string; role: "user" | "assistant"; text: string };

const DEMO_LINES: Omit<Bubble, "id">[] = [
  {
    role: "user",
    text: "How can Solvio help my restaurant?",
  },
  {
    role: "assistant",
    text:
      "I can answer calls, take reservations, send confirmations and help you never miss bookings again.",
  },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function Waveform({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  const bars = 40;

  return (
    <div className="flex h-16 items-end justify-center gap-[3px] px-6 pt-2">
      {Array.from({ length: bars }).map((_, i) => (
        <motion.span
          key={i}
          className="block h-11 w-[3px] origin-bottom rounded-full bg-gradient-to-t from-[#7c3aed] via-[#8b5cf6] to-[#a78bfa] opacity-90"
          animate={
            reduce
              ? { scaleY: active ? 0.65 : 0.35 }
              : active
                ? {
                    scaleY: [0.35, 1.05 + (i % 6) * 0.06, 0.45, 0.95],
                  }
                : { scaleY: 0.28 }
          }
          transition={
            reduce
              ? { duration: 0.25 }
              : {
                  duration: 1.05 + (i % 9) * 0.05,
                  repeat: active ? Infinity : 0,
                  repeatType: "mirror",
                  ease: [0.22, 1, 0.36, 1],
                }
          }
        />
      ))}
    </div>
  );
}

export function VoiceDemoPanel({
  className,
  autoPlay = false,
}: {
  className?: string;
  autoPlay?: boolean;
}) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const ranAuto = useRef(false);
  const running = useRef(false);

  const clearAndPlay = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBubbles([]);
    setPhase("listening");
    await sleep(reduce ? 400 : 900);
    setPhase("thinking");
    await sleep(reduce ? 250 : 550);

    const idBase = Date.now().toString();
    setBubbles([{ id: `${idBase}-u`, role: "user", text: DEMO_LINES[0].text }]);
    setPhase("speaking");
    await sleep(reduce ? 350 : 750);

    setBubbles((prev) => [
      ...prev,
      { id: `${idBase}-a`, role: "assistant", text: DEMO_LINES[1].text },
    ]);
    await sleep(reduce ? 600 : 1400);
    setPhase("idle");
    running.current = false;
  }, [reduce]);

  useEffect(() => {
    if (!autoPlay || ranAuto.current) return;
    ranAuto.current = true;
    void clearAndPlay();
  }, [autoPlay, clearAndPlay]);

  const listening = phase === "listening";
  const micGlow =
    listening || phase === "thinking"
      ? "shadow-[0_0_0_14px_rgba(167,139,250,0.35)] scale-[1.03]"
      : "shadow-[0_8px_40px_-12px_rgba(124,58,237,0.55)]";

  return (
    <Card
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-[#ebe7f7]/90 bg-white/95 p-6 shadow-[0_24px_80px_-48px_rgba(124,58,237,0.65)] backdrop-blur-xl sm:p-8",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_-10%,rgba(167,139,250,0.25),transparent_45%),radial-gradient(circle_at_90%_120%,rgba(124,58,237,0.12),transparent_42%)]" />

      <div className="relative flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
              <Sparkles className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#94a3b8]">
                Solvio Voice
              </p>
              <p className="text-sm font-semibold text-[#0f172a]">Assistant preview</p>
            </div>
          </div>
          <AnimatePresence mode="wait">
            {listening ? (
              <motion.div
                key="listening"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22 }}
              >
                <Badge className="rounded-full bg-[#ede9fe] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5b21b6] hover:bg-[#ede9fe]">
                  Listening…
                </Badge>
              </motion.div>
            ) : phase === "thinking" ? (
              <motion.div key="think" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Badge
                  variant="secondary"
                  className="rounded-full px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]"
                >
                  Thinking…
                </Badge>
              </motion.div>
            ) : phase === "speaking" ? (
              <motion.div key="speak" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Badge className="rounded-full bg-[#7c3aed] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white hover:bg-[#7c3aed]">
                  Responding…
                </Badge>
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Badge variant="outline" className="rounded-full border-[#ebe7f7] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#64748b]">
                  Tap mic to hear Solvio
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Waveform active={listening || phase === "thinking" || phase === "speaking"} />

        <div className="min-h-[220px] rounded-[22px] border border-[#f1eefc] bg-[#fafbff]/90 p-4">
          <div className="flex max-h-[260px] flex-col gap-3 overflow-y-auto pr-1">
            <AnimatePresence initial={false}>
              {bubbles.length === 0 && phase === "idle" && (
                <motion.p
                  key="hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-2xl bg-[#f8fafc] px-4 py-6 text-center text-sm leading-relaxed text-[#64748b]"
                >
                  Ask anything — Solvio replies like a calm teammate at your front desk.
                </motion.p>
              )}
              {bubbles.map((b, idx) => (
                <motion.div
                  key={b.id}
                  layout
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    duration: reduce ? 0.18 : 0.38,
                    delay: reduce ? 0 : idx * 0.06,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className={cn(
                    "max-w-[92%] rounded-3xl px-4 py-3 text-[15px] leading-relaxed shadow-sm",
                    b.role === "user"
                      ? "ml-auto bg-[#f8fafc] text-[#0f172a] ring-1 ring-[#ebe7f7]"
                      : "mr-auto bg-gradient-to-br from-[#7c3aed] via-[#6d28d9] to-[#5b21b6] text-white ring-1 ring-white/25",
                  )}
                >
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.26em] text-current opacity-75">
                    {b.role === "user" ? "Guest" : "Solvio"}
                  </span>
                  {b.text}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-[#ebe7f7] px-6 font-semibold text-[#64748b] hover:bg-[#f8fafc]"
            onClick={() => void clearAndPlay()}
          >
            Replay conversation
          </Button>

          <motion.div whileTap={{ scale: reduce ? 1 : 0.96 }} className="relative">
            <motion.button
              type="button"
              aria-label={listening ? "Listening" : "Talk to Solvio"}
              aria-pressed={listening || phase !== "idle"}
              onClick={() => void clearAndPlay()}
              className={cn(
                "relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#7c3aed] via-[#6d28d9] to-[#a78bfa] text-white outline-none ring-offset-4 ring-offset-white transition-transform focus-visible:ring-4 focus-visible:ring-[#a78bfa]",
                micGlow,
              )}
              animate={
                reduce
                  ? {}
                  : {
                      rotate: listening ? [0, -3, 3, 0] : [0, 1.5, -1.5, 0],
                    }
              }
              transition={{
                duration: listening ? 1.8 : 6,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <Mic className="h-9 w-9" aria-hidden />
            </motion.button>
            {!reduce && (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full bg-[#a78bfa]/35 blur-xl"
                animate={{ opacity: listening ? [0.35, 0.85, 0.35] : [0.25, 0.45, 0.25], scale: listening ? [1, 1.15, 1] : [1, 1.05, 1] }}
                transition={{ duration: listening ? 1.8 : 4.5, repeat: Infinity }}
              />
            )}
          </motion.div>
        </div>

        <p className="text-center text-[11px] font-medium uppercase tracking-[0.28em] text-[#94a3b8]">
          Interactive preview — tap the mic to hear how Solvio sounds with guests.
        </p>
      </div>
    </Card>
  );
}
