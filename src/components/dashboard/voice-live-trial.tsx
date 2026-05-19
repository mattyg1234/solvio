"use client";

import dynamic from "next/dynamic";

import { VoiceBrowserTrial } from "@/components/dashboard/voice-browser-trial";
import { resolveMarketingVapiPublicKey } from "@/lib/marketing-vapi-config";

const VapiBrandAgentPanel = dynamic(
  () =>
    import("@/components/home/vapi-brand-agent-panel").then((m) => ({
      default: m.VapiBrandAgentPanel,
    })),
  { ssr: false },
);

type VoiceLiveTrialProps = {
  businessName: string;
  agentPrompt: string;
  toneLabel: string;
  vapiAssistantId: string;
  vapiAssistantName: string;
  firstMessage?: string;
};

/** Live Vapi receptionist — connects directly to the merchant's Vapi assistant. */
export function VoiceLiveTrial({
  businessName,
  agentPrompt,
  toneLabel,
  vapiAssistantId,
  vapiAssistantName,
  firstMessage,
}: VoiceLiveTrialProps) {
  const publicKey = resolveMarketingVapiPublicKey();
  const assistantId = vapiAssistantId.trim();

  if (publicKey && assistantId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[#64748b]">
          Talking to{" "}
          <span className="font-semibold text-[#0f172a]">{vapiAssistantName || "your receptionist"}</span> — powered
          by your Vapi assistant (save to push the latest voice and instructions).
        </p>
        <VapiBrandAgentPanel
          publicKey={publicKey}
          assistantId={assistantId}
          firstMessage={firstMessage}
          surface="onboarding"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Save your receptionist first to create a Vapi assistant, with{" "}
        <code className="font-mono text-xs">NEXT_PUBLIC_VAPI_PUBLIC_KEY</code> set on this deployment for live voice
        here.
      </p>
      <VoiceBrowserTrial businessName={businessName} agentPrompt={agentPrompt} toneLabel={toneLabel} />
    </div>
  );
}
