import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ReceptionistStudio } from "@/components/dashboard/receptionist-studio";
import type { VoiceReceptionistDetails } from "@/lib/voice-receptionist";
import { voiceDetailsToClient } from "@/lib/voice-receptionist";
import { resolvePlatformElevenLabsVoice } from "@/lib/platform-voice-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Your AI receptionist · Dashboard · Solvio",
};

function parseStoredVoiceDetails(raw: unknown): VoiceReceptionistDetails {
  if (!raw || typeof raw !== "object") {
    return { greeting_style: "warm" };
  }
  const o = raw as Record<string, unknown>;
  const g = o.greeting_style;
  const greeting_style = g === "warm" || g === "casual" || g === "luxury" ? g : "warm";

  const str = (key: keyof VoiceReceptionistDetails): string | undefined =>
    typeof o[key as string] === "string" ? (o[key as string] as string) : undefined;

  return {
    greeting_style,
    receptionist_name: str("receptionist_name"),
    languages_note: str("languages_note"),
    escalation_phone: str("escalation_phone"),
    reception_identity: str("reception_identity"),
    reception_scope: str("reception_scope"),
    caller_intake_priorities: str("caller_intake_priorities"),
    agent_goal: str("agent_goal"),
    conversation_feel: str("conversation_feel"),
    outbound_number_note: str("outbound_number_note"),
    agent_first_message: str("agent_first_message"),
    agent_prompt_custom: str("agent_prompt_custom"),
    elevenlabs_voice_id: str("elevenlabs_voice_id"),
    elevenlabs_voice_name: str("elevenlabs_voice_name"),
    vapi_assistant_id: str("vapi_assistant_id"),
    vapi_assistant_name: str("vapi_assistant_name"),
  };
}

export default async function VoiceSetupPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: biz } = await supabase
    .from("businesses")
    .select("id,name,voice_receptionist_details,voice_receptionist_completed_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!biz) {
    redirect("/dashboard/settings");
  }

  const stored = parseStoredVoiceDetails(biz.voice_receptionist_details);
  const platformVoice = await resolvePlatformElevenLabsVoice();

  return (
    <ReceptionistStudio
      businessId={biz.id}
      businessName={biz.name}
      initialDetails={voiceDetailsToClient(stored)}
      voiceComplete={Boolean(biz.voice_receptionist_completed_at)}
      platformVoiceId={platformVoice.voiceId}
      platformVoiceSource={platformVoice.source}
    />
  );
}
