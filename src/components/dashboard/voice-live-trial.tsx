"use client";

import dynamic from "next/dynamic";

import { buttonVariants } from "@/components/ui/button";
import { resolveMarketingVapiPublicKey } from "@/lib/marketing-vapi-config";
import { cn } from "@/lib/utils";

const VapiBrandAgentPanel = dynamic(
  () =>
    import("@/components/home/vapi-brand-agent-panel").then((m) => ({
      default: m.VapiBrandAgentPanel,
    })),
  { ssr: false },
);

type VoiceLiveTrialProps = {
  vapiAssistantId: string;
  vapiAssistantName: string;
  /** From SSR when set — avoids client-only NEXT_PUBLIC env gaps in dashboard bundles. */
  vapiPublicKey?: string;
  firstMessage?: string;
  voiceName?: string;
  /** When true, inline mic is hidden until merchant saves again. */
  disabled?: boolean;
  onRequestTest?: () => void;
  onBubblesChange?: (bubbles: { role: "user" | "assistant"; text: string }[]) => void;
  onCallEnded?: (transcript: string) => void;
};

/** Live Vapi only — same stack as the homepage; no browser speech fallback. */
export function VoiceLiveTrial({
  vapiAssistantId,
  vapiAssistantName,
  vapiPublicKey,
  firstMessage,
  voiceName,
  disabled = false,
  onRequestTest,
  onBubblesChange,
  onCallEnded,
}: VoiceLiveTrialProps) {
  const publicKey = vapiPublicKey?.trim() || resolveMarketingVapiPublicKey();
  const assistantId = vapiAssistantId.trim();
  const voiceLabel = voiceName?.trim() || "your selected voice";

  if (publicKey && assistantId && disabled) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-relaxed text-amber-950">
        <p className="font-semibold text-[#0f172a]">Save before testing live</p>
        <p className="mt-1">
          You changed settings since the last save. Tap <span className="font-semibold">Save receptionist</span> to
          push {voiceLabel} and your latest instructions, then test again.
        </p>
        {onRequestTest ? (
          <button
            type="button"
            disabled
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3 rounded-full opacity-50")}
          >
            Test live (save first)
          </button>
        ) : null}
      </div>
    );
  }

  if (publicKey && assistantId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[#64748b]">
          Talking to{" "}
          <span className="font-semibold text-[#0f172a]">{vapiAssistantName || "your receptionist"}</span> — voice{" "}
          <span className="font-semibold text-[#0f172a]">{voiceLabel}</span>. Save again after any edits.
        </p>
        <VapiBrandAgentPanel
          publicKey={publicKey}
          assistantId={assistantId}
          firstMessage={firstMessage}
          surface="onboarding"
          onBubblesChange={onBubblesChange}
          onCallEnded={onCallEnded}
        />
      </div>
    );
  }

  const missing: string[] = [];
  if (!publicKey) missing.push("NEXT_PUBLIC_VAPI_PUBLIC_KEY (deployment env)");
  if (!assistantId) missing.push("vapi_assistant_id (returned from save)");

  return (
    <div className="rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-4 text-sm leading-relaxed text-[#64748b]">
      <p className="font-semibold text-[#0f172a]">Mic can&apos;t go live yet.</p>
      <p className="mt-1">
        Missing:{" "}
        {missing.map((m, i) => (
          <span key={m}>
            <code className="font-mono text-xs">{m}</code>
            {i < missing.length - 1 ? ", " : ""}
          </span>
        ))}
        .
      </p>
      {!assistantId ? (
        <p className="mt-2 text-xs">
          Save your receptionist once — we&apos;ll provision the assistant and link it to your account so you can test and edit anytime.
        </p>
      ) : null}
    </div>
  );
}
