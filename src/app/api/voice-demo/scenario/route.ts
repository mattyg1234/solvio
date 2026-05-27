import { NextResponse } from "next/server";

import { getMarketingCopy } from "@/lib/marketing-copy";
import { isMarketingLocale } from "@/lib/marketing-locale";
import { resolveMarketingVapiAssistantId } from "@/lib/marketing-vapi-config";
import { getVapiMarketingBootstrap } from "@/lib/vapi-marketing-bootstrap";

type Line = { role: "user" | "assistant"; text: string };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const localeParam = searchParams.get("locale");
  const locale = isMarketingLocale(localeParam) ? localeParam : "en";
  const copy = getMarketingCopy(locale);
  const assistantId = resolveMarketingVapiAssistantId(locale);
  const boot = await getVapiMarketingBootstrap(assistantId);

  const lines: Line[] = copy.voice.scenarioApiDefaults.map((line, i) =>
    i === 0 && boot?.firstMessage?.trim()
      ? { role: "assistant", text: boot.firstMessage.trim() }
      : line,
  );

  const openingFromVapi = Boolean(boot?.firstMessage?.trim());

  return NextResponse.json(
    {
      source: openingFromVapi ? "vapi_opening" : "default",
      syncedVoiceId: Boolean(boot?.elevenlabsVoiceId),
      lines,
    },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
