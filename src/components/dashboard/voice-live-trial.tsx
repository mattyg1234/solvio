"use client";

import dynamic from "next/dynamic";

import { resolveMarketingVapiPublicKey } from "@/lib/marketing-vapi-config";

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
  firstMessage?: string;
  onBubblesChange?: (bubbles: { role: "user" | "assistant"; text: string }[]) => void;
  onCallEnded?: (transcript: string) => void;
};

/** Live Vapi only — same stack as the homepage; no browser speech fallback. */
export function VoiceLiveTrial({
  vapiAssistantId,
  vapiAssistantName,
  firstMessage,
  onBubblesChange,
  onCallEnded,
}: VoiceLiveTrialProps) {
  const publicKey = resolveMarketingVapiPublicKey();
  const assistantId = vapiAssistantId.trim();

  if (publicKey && assistantId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[#64748b]">
          Talking to{" "}
          <span className="font-semibold text-[#0f172a]">{vapiAssistantName || "your receptionist"}</span> — Solvio
          platform voice via Vapi (save to push the latest instructions).
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

  return (
    <p className="rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-4 text-sm leading-relaxed text-[#64748b]">
      Save your receptionist first to create a Vapi assistant, then tap the purple mic here. Requires{" "}
      <code className="font-mono text-xs">NEXT_PUBLIC_VAPI_PUBLIC_KEY</code> on this deployment — no scripted voice
      fallback.
    </p>
  );
}
