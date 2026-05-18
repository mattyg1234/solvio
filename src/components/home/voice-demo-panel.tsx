"use client";

/**
 * Scripted conversation; assistant lines call `/api/voice-demo/tts` (ElevenLabs on the server).
 * Fallback: browser `speechSynthesis` when env is missing or ElevenLabs errors.
 */

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { Mic, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { VoiceSessionWaveform } from "@/components/home/voice-session-waveform";
import { cn } from "@/lib/utils";

type Phase = "idle" | "listening" | "thinking" | "speaking";

type Bubble = { id: string; role: "user" | "assistant"; text: string };

export type VoiceDemoScenario = "default" | "personal_voice";

type ScenarioMeta = {
  productLine: string;
  eyebrowAssistant: string;
  idleBadge: string;
  emptyHint: string;
  footer: string;
  assistantLabel: string;
  lines: Omit<Bubble, "id">[];
};

const SCENARIOS: Record<VoiceDemoScenario, ScenarioMeta> = {
  default: {
    productLine: "Solvio Voice",
    eyebrowAssistant: "Quick peek",
    idleBadge: "Tap mic — hear preview",
    emptyHint: "Short preview — Solvio answering for your storefront.",
    footer: "Powered by ElevenLabs with SOLVIO_VOICE_DEMO_VOICE_ID on the server.",
    assistantLabel: "Your reception",
    lines: [
      {
        role: "user",
        text: "What does Solvio do for busy venues?",
      },
      {
        role: "assistant",
        text: "Solvio picks up bookings, sends confirmations guests actually receive, and keeps deposits flowing through Stripe — calmly, even after hours.",
      },
    ],
  },
  personal_voice: {
    productLine: "Solvio Voice",
    eyebrowAssistant: "Personalised cadence · live or preview",
    idleBadge: "Purple mic · listen or replay",
    emptyHint:
      "Build a convincing voice receptionist with personalised accent, rhythm and tonal finishing touches so callers still swear it is someone from your podium. Beneath that polish Solvio stitches together bookings, plated dinner rotations, tastings, salons, launches and confirmations that politely nag themselves closed. Explore the story on-screen — then audition the pacing below.",
    footer:
      "Click the purple microphone to replay how it sounds live in motion. Deploy Vapi on your domain so callers can converse in real time about boosting sales and organising calendars more effortlessly.",
    assistantLabel: "Solvio voice preview",
    lines: [
      {
        role: "assistant",
        text:
          "This is how a tailored Solvio voice layer sounds when guests ask for dinner slots, tastings or private rooms—matching the pacing and colouring you bake into the persona.",
      },
      {
        role: "user",
        text: "What will you automate while I coach the floor?",
      },
      {
        role: "assistant",
        text:
          "Reminders chase themselves, itineraries stay tidy, confirmations flow by SMS or email, and transcripts land in Solvio instead of voicemail chaos—even when you are juggling multiple venues.",
      },
    ],
  },
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cancelBrowserSpeech() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function speakFallbackBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

async function speakAssistantLine(text: string, audioRef: MutableRefObject<HTMLAudioElement | null>) {
  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current.src = "";
    audioRef.current = null;
  }
  cancelBrowserSpeech();

  let res: Response;
  try {
    res = await fetch("/api/voice-demo/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    await speakFallbackBrowser(text);
    return;
  }

  if (!res.ok) {
    await speakFallbackBrowser(text);
    return;
  }

  const blob = await res.blob();

  if (blob.size < 160) {
    await speakFallbackBrowser(text);
    return;
  }

  const head = await blob.slice(0, 3).arrayBuffer();
  const bytes = new Uint8Array(head);
  const mp3sync = bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] ?? 0) >= 0xe0;
  const id3 = bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  if (!mp3sync && !id3) {
    await speakFallbackBrowser(text);
    return;
  }

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audioRef.current = audio;

  await new Promise<void>((resolve) => {
    const done = () => {
      URL.revokeObjectURL(url);
      if (audioRef.current === audio) audioRef.current = null;
      resolve();
    };
    audio.addEventListener("ended", done, { once: true });
    audio.addEventListener(
      "error",
      () => {
        cancelBrowserSpeech();
        void speakFallbackBrowser(text).finally(done);
      },
      { once: true },
    );
    void audio.play().catch(() => {
      cancelBrowserSpeech();
      void speakFallbackBrowser(text).finally(done);
    });
  });
}

export function VoiceDemoPanel({
  className,
  autoPlay = false,
  scenario = "personal_voice",
}: {
  className?: string;
  autoPlay?: boolean;
  scenario?: VoiceDemoScenario;
}) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const ranAuto = useRef(false);
  const running = useRef(false);
  const scenarioRef = useRef(scenario);
  const demoAudioRef = useRef<HTMLAudioElement | null>(null);

  scenarioRef.current = scenario;
  const meta = SCENARIOS[scenario];

  const clearAndPlay = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    if (demoAudioRef.current) {
      demoAudioRef.current.pause();
      demoAudioRef.current.src = "";
      demoAudioRef.current = null;
    }
    cancelBrowserSpeech();

    const activeScenario = scenarioRef.current;
    const lines = SCENARIOS[activeScenario].lines;
    setBubbles([]);
    const idBase = Date.now().toString();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) break;

      if (line.role === "user") {
        setPhase("listening");
        await sleep(reduce ? 380 : 750);
        setPhase("thinking");
        await sleep(reduce ? 220 : 450);
      } else {
        setPhase("thinking");
        await sleep(reduce ? 220 : 450);
      }

      setPhase("speaking");
      const bubble: Bubble = {
        id: `${idBase}-${i}-${line.role}`,
        role: line.role,
        text: line.text,
      };
      setBubbles((prev) => [...prev, bubble]);

      if (line.role === "assistant") {
        try {
          await speakAssistantLine(line.text, demoAudioRef);
        } catch {
          cancelBrowserSpeech();
          await speakFallbackBrowser(line.text);
        }
      } else {
        await sleep(reduce ? 500 : 980);
      }
    }

    setPhase("idle");
    running.current = false;
  }, [reduce]);

  useEffect(() => {
    return () => {
      if (demoAudioRef.current) {
        demoAudioRef.current.pause();
        demoAudioRef.current.src = "";
        demoAudioRef.current = null;
      }
      cancelBrowserSpeech();
    };
  }, []);

  useEffect(() => {
    ranAuto.current = false;
    setPhase("idle");
    setBubbles([]);
    running.current = false;
    if (demoAudioRef.current) {
      demoAudioRef.current.pause();
      demoAudioRef.current.src = "";
      demoAudioRef.current = null;
    }
    cancelBrowserSpeech();
  }, [scenario]);

  useEffect(() => {
    if (!autoPlay || ranAuto.current) return;
    ranAuto.current = true;
    void clearAndPlay();
  }, [autoPlay, clearAndPlay, scenario]);

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
                {meta.productLine}
              </p>
              <p className="text-sm font-semibold text-[#0f172a]">{meta.eyebrowAssistant}</p>
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
                  {meta.idleBadge}
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <VoiceSessionWaveform active={listening || phase === "thinking" || phase === "speaking"} />

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
                    {b.role === "user" ? "Caller" : meta.assistantLabel}
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
              aria-label={listening ? "Listening" : meta.idleBadge}
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

        {scenario === "personal_voice" ? (
          <>
            <p className="text-center text-[12px] font-medium leading-relaxed text-[#64748b]">{meta.footer}</p>
            <p className="mt-2 text-center text-[10px] font-medium uppercase tracking-[0.26em] text-[#94a3b8]">
              Scripted audio via SOLVIO_ELEVENLABS_API_KEY + SOLVIO_VOICE_DEMO_VOICE_ID · browser fallback if synth fails
            </p>
          </>
        ) : (
          <p className="text-center text-[11px] font-medium uppercase tracking-[0.28em] text-[#94a3b8]">{meta.footer}</p>
        )}
      </div>
    </Card>
  );
}
