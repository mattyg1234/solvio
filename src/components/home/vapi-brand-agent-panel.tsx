"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { VoiceSessionWaveform } from "@/components/home/voice-session-waveform";
import { cn } from "@/lib/utils";

type Phase = "idle" | "connecting" | "live" | "error";

type Bubble = { id: string; role: "user" | "assistant"; text: string };

type VapiBrandAgentPanelProps = {
  /** Vapi Dashboard → API keys → Public key — safe for the browser bundle. */
  publicKey: string;
  assistantId: string;
  surface?: "marketing" | "onboarding";
  className?: string;
};

const copy = {
  marketing: {
    productLine: "Solvio Voice",
    eyebrowAssistant: "Your brand, your cadence",
    idleBadge: "Purple mic · live assistant",
    emptyHint:
      "You can build a realistic receptionist-grade voice agent with personalised accent and toning—the warmth, pacing and vowels you prefer so every call still feels unmistakably you. Behind the velvet rope I quietly keep dinner tables moving, RSVP lists humming, salons filled, retreats scheduled and follow-ups chased while your crew stays focussed on hospitality. Speak freely: ask what Solvio Voice can offload this week.",
    footer:
      "Click the purple microphone below to chat with me now—I will answer live about how Solvio boosts sales and helps you organise bookings, communications and calendars more effortlessly.",
    assistantLabel: "Solvio",
  },
  onboarding: {
    productLine: "Try Solvio Voice",
    eyebrowAssistant: "Live conversational AI",
    idleBadge: "Purple mic · start call",
    emptyHint:
      "Create agents with nuanced accent and pacing, then rehearse bookings, timelines and confirmations with me before you expose them to guests.",
    footer: "Click the microphone to start a live session. Leave your microphone on while we talk—you can tap again to disconnect.",
    assistantLabel: "Solvio",
  },
} as const;

function nextBubbleId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function bubbleFromAppMessage(raw: unknown): Pick<Bubble, "role" | "text"> | null {
  if (!raw || typeof raw !== "object") return null;
  const msg = raw as Record<string, unknown>;
  if (msg.type !== "transcript") return null;
  if (msg.transcriptType !== "final") return null;
  const text = typeof msg.transcript === "string" ? msg.transcript.trim() : "";
  if (!text) return null;
  if (msg.role === "assistant") return { role: "assistant", text };
  if (msg.role === "user") return { role: "user", text };
  return null;
}

export function VapiBrandAgentPanel({
  publicKey,
  assistantId,
  surface = "marketing",
  className,
}: VapiBrandAgentPanelProps) {
  const meta = copy[surface];
  const reduce = useReducedMotion();
  const keysRef = useRef({ publicKey, assistantId });
  keysRef.current = { publicKey, assistantId };

  const [phase, setPhase] = useState<Phase>("idle");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  type VapiInstance = InstanceType<(typeof import("@vapi-ai/web"))["default"]>;
  const vapiRef = useRef<VapiInstance | null>(null);
  const buildingRef = useRef(false);

  /** Prevents stale `start()` resolutions from flipping UI after cancel. */
  const sessionCtlRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  const detachListenersRef = useRef<(() => void) | null>(null);

  const cleanupClient = useCallback(async () => {
    detachListenersRef.current?.();
    detachListenersRef.current = null;

    const v = vapiRef.current;
    vapiRef.current = null;

    await v?.stop?.().catch(() => {});
  }, []);

  const startSession = useCallback(async () => {
    if (buildingRef.current) return;

    buildingRef.current = true;
    const ctl = { cancelled: false };
    sessionCtlRef.current = ctl;

    setPhase("connecting");
    setErrorDetail(null);

    await cleanupClient();

    if (ctl.cancelled) {
      buildingRef.current = false;
      return;
    }

    try {
      const { default: Vapi } = await import("@vapi-ai/web");
      const { publicKey: pk, assistantId: aid } = keysRef.current;

      const vapi = new Vapi(pk);

      const onMessage = (message: unknown) => {
        if (sessionCtlRef.current !== ctl || ctl.cancelled) return;

        const next = bubbleFromAppMessage(message);
        if (!next) return;

        setBubbles((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === next.role && last.text === next.text) return prev;
          return [...prev, { ...next, id: nextBubbleId() }];
        });
      };

      const onListening = () => {
        if (sessionCtlRef.current !== ctl || ctl.cancelled) return;
        setPhase("live");
      };

      const onCallEnd = () => {
        if (sessionCtlRef.current !== ctl || ctl.cancelled) return;
        ctl.cancelled = true;
        buildingRef.current = false;
        setPhase("idle");
        void cleanupClient().catch(() => {});
      };

      const onErr = (e: unknown) => {
        if (sessionCtlRef.current !== ctl || ctl.cancelled) return;

        console.error("[VapiBrandAgent]", e);
        let msg = "Could not stay connected.";
        if (typeof e === "object" && e && "error" in e) {
          const er = e as { error?: { message?: string } };
          msg = typeof er.error?.message === "string" ? er.error.message : msg;
        } else if (
          typeof e === "object" &&
          e &&
          "message" in e &&
          typeof (e as { message: unknown }).message === "string"
        ) {
          msg = (e as { message: string }).message;
        }

        ctl.cancelled = true;
        buildingRef.current = false;
        setErrorDetail(msg);
        setPhase("error");
        void cleanupClient().catch(() => {});
      };

      vapi.on("message", onMessage);
      vapi.on("call-start", onListening);
      vapi.on("call-end", onCallEnd);
      vapi.on("error", onErr);

      detachListenersRef.current = () => {
        vapi.removeListener("message", onMessage);
        vapi.removeListener("call-start", onListening);
        vapi.removeListener("call-end", onCallEnd);
        vapi.removeListener("error", onErr);
      };

      vapiRef.current = vapi;

      const call = await vapi.start(aid);

      if (sessionCtlRef.current !== ctl || ctl.cancelled) {
        await cleanupClient().catch(() => {});
        buildingRef.current = false;
        return;
      }

      buildingRef.current = false;

      if (!call) {
        ctl.cancelled = true;
        setPhase("error");
        setErrorDetail("Could not connect. Confirm voice settings for this deployment, refresh, and try again.");
        await cleanupClient().catch(() => {});
        return;
      }

      setPhase((p) => (ctl.cancelled ? p : "live"));
    } catch (e) {
      if (sessionCtlRef.current === ctl && !ctl.cancelled) {
        console.error("[VapiBrandAgent] start", e);
        setPhase("error");
        const message =
          typeof e === "object" && e !== null && "message" in e ? String((e as Error).message) : "Something went wrong connecting the assistant.";
        setErrorDetail(message);
      }
      await cleanupClient().catch(() => {});
      buildingRef.current = false;
    }
  }, [cleanupClient]);

  const stopSession = useCallback(async () => {
    sessionCtlRef.current.cancelled = true;
    buildingRef.current = false;
    setPhase("idle");
    await cleanupClient().catch(() => {});
  }, [cleanupClient]);

  useEffect(() => {
    return () => {
      sessionCtlRef.current.cancelled = true;
      buildingRef.current = false;
      void cleanupClient().catch(() => {});
    };
  }, [cleanupClient]);

  const listening = phase === "live";

  const micGlow =
    listening || phase === "connecting"
      ? "shadow-[0_0_0_14px_rgba(167,139,250,0.35)] scale-[1.03]"
      : "shadow-[0_8px_40px_-12px_rgba(124,58,237,0.55)]";

  const waveformActive = phase !== "idle" && phase !== "error";

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
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#94a3b8]">{meta.productLine}</p>
              <p className="text-sm font-semibold text-[#0f172a]">{meta.eyebrowAssistant}</p>
            </div>
          </div>
          <AnimatePresence mode="wait">
            {phase === "connecting" ? (
              <motion.div key="connecting" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
                <Badge
                  variant="secondary"
                  className="rounded-full px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]"
                >
                  Connecting…
                </Badge>
              </motion.div>
            ) : listening ? (
              <motion.div key="listening" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Badge className="rounded-full bg-[#7c3aed] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white hover:bg-[#7c3aed]">
                  Live…
                </Badge>
              </motion.div>
            ) : phase === "error" ? (
              <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Badge
                  variant="destructive"
                  className="rounded-full px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]"
                >
                  Disconnected
                </Badge>
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Badge
                  variant="outline"
                  className="rounded-full border-[#ebe7f7] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#64748b]"
                >
                  {meta.idleBadge}
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <VoiceSessionWaveform active={waveformActive} />

        <div className="min-h-[220px] rounded-[22px] border border-[#f1eefc] bg-[#fafbff]/90 p-4">
          <div className="flex max-h-[260px] flex-col gap-3 overflow-y-auto pr-1">
            {phase === "error" && (
              <p className="rounded-2xl border border-red-100 bg-red-50/80 px-4 py-5 text-center text-sm leading-relaxed text-red-800">
                {errorDetail ??
                  "The voice session dropped. Check your microphone permission, refresh if needed, and try again."}
              </p>
            )}
            <AnimatePresence initial={false}>
              {bubbles.length === 0 && phase !== "error" && (
                <motion.p
                  key="hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-2xl bg-[#f8fafc] px-4 py-6 text-center text-sm leading-relaxed text-[#64748b]"
                >
                  {meta.emptyHint}
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
                    {b.role === "user" ? "You" : meta.assistantLabel}
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
            disabled={listening || phase === "connecting"}
            onClick={() => {
              setErrorDetail(null);
              setPhase("idle");
              setBubbles([]);
            }}
          >
            Reset transcript
          </Button>

          <motion.div whileTap={{ scale: reduce ? 1 : 0.96 }} className="relative">
            <motion.button
              type="button"
              aria-label={
                phase === "idle" || phase === "error"
                  ? meta.idleBadge
                  : phase === "connecting"
                    ? "Cancel connecting"
                    : "End session"
              }
              aria-pressed={listening || phase === "connecting"}
              onClick={() => {
                if (phase === "connecting" || phase === "live") {
                  void stopSession();
                } else {
                  void startSession();
                }
              }}
              className={cn(
                "relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#7c3aed] via-[#6d28d9] to-[#a78bfa] text-white outline-none ring-offset-4 ring-offset-white transition-transform focus-visible:ring-4 focus-visible:ring-[#a78bfa]",
                micGlow,
              )}
              animate={
                reduce
                  ? {}
                  : {
                      rotate: listening ? [0, -3, 3, 0] : phase === "connecting" ? [0, -2, 2, 0] : [0, 1.5, -1.5, 0],
                    }
              }
              transition={{
                duration: listening || phase === "connecting" ? 1.8 : 6,
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
                animate={{
                  opacity: listening || phase === "connecting" ? [0.35, 0.85, 0.35] : [0.25, 0.45, 0.25],
                  scale: listening || phase === "connecting" ? [1, 1.15, 1] : [1, 1.05, 1],
                }}
                transition={{ duration: listening || phase === "connecting" ? 1.8 : 4.5, repeat: Infinity }}
              />
            )}
          </motion.div>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {phase === "error" ? (
            <Button
              type="button"
              className="rounded-full bg-[#7c3aed] px-6 font-semibold text-white hover:bg-[#6d28d9]"
              onClick={() => {
                setErrorDetail(null);
                setPhase("idle");
                void startSession();
              }}
            >
              Try again
            </Button>
          ) : null}
        </div>

        <p className="text-center text-[12px] font-medium leading-relaxed text-[#64748b]">{meta.footer}</p>
        <p className="mt-3 text-center text-[10px] font-medium uppercase tracking-[0.26em] text-[#94a3b8]">
          {surface === "marketing"
            ? "Live voice in your browser · allow microphone access when prompted"
            : "Mic stays active during the session · tap the purple microphone to end"}
        </p>
      </div>
    </Card>
  );
}
