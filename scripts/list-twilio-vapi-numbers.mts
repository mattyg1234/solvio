import {
  getTwilioAccountSid,
  getTwilioAuthToken,
  getTwilioSmsFrom,
} from "../src/lib/twilio-webhook";
import { getSolvioVapiApiKey } from "../src/lib/voice-platform-env";

async function main() {
  const sid = getTwilioAccountSid();
  const token = getTwilioAuthToken();
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const tw = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PageSize=50`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  const twJson = (await tw.json()) as { incoming_phone_numbers?: Array<{ phone_number: string; voice_url?: string; sms_url?: string }> };
  console.log("SOLVIO_TWILIO_FROM_NUMBER:", getTwilioSmsFrom() || "(empty)");
  console.log("\nTwilio incoming:");
  for (const n of twJson.incoming_phone_numbers ?? []) {
    console.log(" ", n.phone_number, "\n    voice:", n.voice_url, "\n    sms:", n.sms_url);
  }

  const vapiKey = getSolvioVapiApiKey();
  if (vapiKey) {
    const vr = await fetch("https://api.vapi.ai/phone-number", {
      headers: { Authorization: `Bearer ${vapiKey}` },
    });
    const phones = (await vr.json()) as Array<{ id: string; number?: string; name?: string }>;
    console.log("\nVapi phone numbers:");
    for (const p of Array.isArray(phones) ? phones : []) {
      console.log(" ", p.id, p.number, p.name ?? "");
    }
  }
}

main().catch(console.error);
