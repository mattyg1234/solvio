"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Lock, Pause, Play } from "lucide-react";

import type { SolvioVoiceEntry, SubscriptionTier } from "@/lib/solvio-voice-library";
import { isVoiceAllowedForTier, planLabelForVoice } from "@/lib/solvio-voice-library";
import { cn } from "@/lib/utils";

type ReceptionistVoicePickerProps = {
  businessId: string;
  demoSentence: string;
  voices: SolvioVoiceEntry[];
  subscriptionTier: SubscriptionTier;
  selectedVoiceId: string;
  onSelectVoice: (voice: SolvioVoiceEntry) => void;
};

function VoiceCard({
  voice,
  businessId,
  demoSentence,
  subscriptionTier,
  selected,
  onSelect,
}: {
  voice: SolvioVoiceEntry;
  businessId: string;
  demoSentence: string;
  subscriptionTier: SubscriptionTier;
  selected: boolean;
  onSelect: () => void;
}) {
  const allowed = isVoiceAllowedForTier(voice, subscriptionTier);
  const planLabel = planLabelForVoice(voice);
  const [playing, setPlaying] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setPlaying(false);
  }, []);

  async function handlePreview(e: React.MouseEvent) {
    e.stopPropagation();
    if (!allowed) return;

    if (playing) {
      stopPreview();
      return;
    }

    setPreviewError(null);
    setPlaying(true);

    let res: Response;
    try {
      res = await fetch("/api/dashboard/voice-preview/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          voiceId: voice.id,
          text: demoSentence,
        }),
      });
    } catch {
      setPreviewError("Could not reach preview.");
      setPlaying(false);
      return;
    }

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string; minTier?: string } | null;
      if (err?.error === "plan_required") {
        setPreviewError(`${planLabel ?? "Paid"} plan required.`);
      } else {
        setPreviewError("Preview unavailable right now.");
      }
      setPlaying(false);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.addEventListener(
      "ended",
      () => {
        URL.revokeObjectURL(url);
        stopPreview();
      },
      { once: true },
    );
    audio.addEventListener(
      "error",
      () => {
        URL.revokeObjectURL(url);
        setPreviewError("Playback failed.");
        stopPreview();
      },
      { once: true },
    );

    void audio.play().catch(() => {
      URL.revokeObjectURL(url);
      setPreviewError("Playback blocked.");
      stopPreview();
    });
  }

  return (
    <div
      role="button"
      tabIndex={allowed ? 0 : -1}
      onClick={() => {
        if (allowed) onSelect();
      }}
      onKeyDown={(e) => {
        if (!allowed) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group relative flex w-full flex-col rounded-2xl border px-4 py-4 text-left transition",
        selected
          ? "border-[#7c3aed] bg-[#f5f3ff] ring-2 ring-[#7c3aed]/25"
          : "border-[#ebe7f7] bg-white hover:border-[#c4b5fd]",
        !allowed ? "cursor-not-allowed opacity-70" : "cursor-pointer",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#0f172a]">{voice.name}</p>
          <p className="mt-1 text-xs leading-relaxed text-[#64748b]">{voice.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!allowed && planLabel ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">
              <Lock className="h-3 w-3" aria-hidden />
              {planLabel}
            </span>
          ) : null}
          <button
            type="button"
            disabled={!allowed}
            onClick={(e) => void handlePreview(e)}
            aria-label={playing ? `Stop ${voice.name} preview` : `Play ${voice.name} preview`}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border transition",
              selected
                ? "border-[#7c3aed]/30 bg-white text-[#7c3aed] hover:bg-[#ede9fe]"
                : "border-[#ebe7f7] bg-[#fafbff] text-[#7c3aed] hover:border-[#c4b5fd]",
              !allowed && "pointer-events-none opacity-40",
            )}
          >
            {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>
      {previewError ? <p className="mt-2 text-[11px] text-rose-600">{previewError}</p> : null}
      {selected ? (
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7c3aed]">Selected</p>
      ) : null}
    </div>
  );
}

export function ReceptionistVoicePicker({
  businessId,
  demoSentence,
  voices,
  subscriptionTier,
  selectedVoiceId,
  onSelectVoice,
}: ReceptionistVoicePickerProps) {
  const [tab, setTab] = useState<"system" | "solvio">("solvio");
  const systemVoices = voices.filter((v) => v.category === "system");
  const solvioVoices = voices.filter((v) => v.category === "solvio");
  const visible = tab === "system" ? systemVoices : solvioVoices;

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-[#64748b]">
        Tap play to hear: &ldquo;{demoSentence}&rdquo; Standard voices work on every plan. Solvio voices are
        brand-crafted — Pro and above.
      </p>

      <div className="flex gap-2 rounded-full border border-[#ebe7f7] bg-[#fafbff] p-1">
        <button
          type="button"
          onClick={() => setTab("solvio")}
          className={cn(
            "flex-1 rounded-full px-3 py-2 text-xs font-semibold transition",
            tab === "solvio" ? "bg-white text-[#7c3aed] shadow-sm" : "text-[#64748b] hover:text-[#0f172a]",
          )}
        >
          Solvio voices
          {solvioVoices.length ? (
            <span className="ml-1 text-[#94a3b8]">({solvioVoices.length})</span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => setTab("system")}
          className={cn(
            "flex-1 rounded-full px-3 py-2 text-xs font-semibold transition",
            tab === "system" ? "bg-white text-[#7c3aed] shadow-sm" : "text-[#64748b] hover:text-[#0f172a]",
          )}
        >
          Standard voices
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#ddd6fe] bg-white px-4 py-6 text-center text-sm text-[#64748b]">
          {tab === "solvio" ? (
            <>
              No Solvio brand voices configured yet. Add IDs in{" "}
              <code className="font-mono text-xs">SOLVIO_PERSONALISED_VOICES_JSON</code> on the deployment, or set{" "}
              <code className="font-mono text-xs">SOLVIO_PLATFORM_ELEVENLABS_VOICE_ID</code>.
            </>
          ) : (
            "Standard voices unavailable."
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((voice) => (
            <VoiceCard
              key={voice.id}
              voice={voice}
              businessId={businessId}
              demoSentence={demoSentence}
              subscriptionTier={subscriptionTier}
              selected={voice.id === selectedVoiceId}
              onSelect={() => onSelectVoice(voice)}
            />
          ))}
        </div>
      )}

      {subscriptionTier === "trial" ? (
        <p className="text-xs text-[#64748b]">
          You&apos;re on Trial — standard voices only. Upgrade to Pro to unlock Solvio brand voices for your
          receptionist.
        </p>
      ) : null}
    </div>
  );
}

export function ReceptionistVoicePickerSkeleton() {
  return (
    <div className="flex items-center gap-2 text-sm text-[#64748b]">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      Loading voices…
    </div>
  );
}
