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
};

/** Live Vapi receptionist in dashboard setup; scripted fallback when public key is missing. */
export function VoiceLiveTrial({
  businessName,
  agentPrompt,
  toneLabel,
  vapiAssistantId,
  vapiAssistantName,
}: VoiceLiveTrialProps) {
  const publicKey = resolveMarketingVapiPublicKey();
  const assistantId = vapiAssistantId.trim();

  if (publicKey && assistantId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[#64748b]">
          Same receptionist as the public homepage — powered by{" "}
          <span className="font-semibold text-[#0f172a]">{vapiAssistantName || "your Vapi assistant"}</span>.
        </p>
        <VapiBrandAgentPanel publicKey={publicKey} assistantId={assistantId} surface="onboarding" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Add <code className="font-mono text-xs">NEXT_PUBLIC_VAPI_PUBLIC_KEY</code> to this deployment to use your real
        Vapi receptionist here. Until then, a short scripted sample appears below.
      </p>
      <VoiceBrowserTrial businessName={businessName} agentPrompt={agentPrompt} toneLabel={toneLabel} />
    </div>
  );
}
