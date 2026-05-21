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
          Save didn&apos;t hand back a Vapi assistant id — check the server-action response for{" "}
          <code className="font-mono">assistantId</code>, or whether your business already has one stored.
        </p>
      ) : null}
    </div>
  );
}
