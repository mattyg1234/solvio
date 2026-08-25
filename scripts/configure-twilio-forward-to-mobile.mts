/**
 * Point the Solvio Twilio English number at voice/SMS/WhatsApp forward webhooks.
 *
 * Requires in .env.local (or shell):
 *   SOLVIO_TWILIO_ACCOUNT_SID
 *   SOLVIO_TWILIO_AUTH_TOKEN
 *   SOLVIO_TWILIO_FROM_NUMBER  (+44…)
 * Optional:
 *   SOLVIO_TWILIO_FORWARD_TO (+34604189230 default)
 *   NEXT_PUBLIC_SITE_URL (defaults to https://www.solviosystems.com)
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/configure-twilio-forward-to-mobile.mts
 */

import {
  DEFAULT_TWILIO_FORWARD_TO,
  getTwilioAccountSid,
  getTwilioAuthToken,
  getTwilioForwardTo,
  getTwilioSmsFrom,
  webhookBaseUrl,
} from "../src/lib/twilio-webhook";

type IncomingNumber = {
  sid: string;
  phone_number: string;
  friendly_name: string;
  voice_url: string | null;
  sms_url: string | null;
};

function authHeader(): string {
  const sid = getTwilioAccountSid();
  const token = getTwilioAuthToken();
  if (!sid || !token) {
    throw new Error("Missing SOLVIO_TWILIO_ACCOUNT_SID / SOLVIO_TWILIO_AUTH_TOKEN");
  }
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

async function twilioGet(path: string) {
  const res = await fetch(`https://api.twilio.com${path}`, {
    headers: { Authorization: authHeader() },
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.message || res.status));
  }
  return json;
}

async function twilioPost(path: string, body: Record<string, string>) {
  const res = await fetch(`https://api.twilio.com${path}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.message || res.status));
  }
  return json;
}

async function main() {
  const sid = getTwilioAccountSid();
  const fromEnv = getTwilioSmsFrom();
  const forwardTo = getTwilioForwardTo();
  const base = webhookBaseUrl();

  console.log("Twilio account:", sid);
  console.log("Forward to:", forwardTo);
  console.log("Webhook base:", base);

  const list = await twilioGet(
    `/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PageSize=50`,
  );
  const numbers = (list.incoming_phone_numbers as IncomingNumber[] | undefined) || [];

  if (!numbers.length) {
    throw new Error("No incoming phone numbers on this Twilio account.");
  }

  let target =
    numbers.find((n) => n.phone_number === fromEnv) ||
    numbers.find((n) => n.phone_number.startsWith("+44")) ||
    numbers[0];

  console.log("\nConfiguring:", target.phone_number, `(${target.friendly_name})`);

  const voiceUrl = `${base}/api/webhooks/twilio/voice`;
  const smsUrl = `${base}/api/webhooks/twilio/sms`;

  const updated = await twilioPost(
    `/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers/${target.sid}.json`,
    {
      VoiceUrl: voiceUrl,
      VoiceMethod: "POST",
      SmsUrl: smsUrl,
      SmsMethod: "POST",
    },
  );

  console.log("\n✅ Updated webhooks:");
  console.log("  Voice →", voiceUrl);
  console.log("  SMS   →", smsUrl);
  console.log("  WhatsApp inbound: set the same SMS URL on your WhatsApp sender in Twilio Console");
  console.log("    →", `${base}/api/webhooks/twilio/whatsapp`);
  console.log("\n⚠️  Voice forwarding replaces any Vapi/AI receptionist on this number until you change it back.");
  console.log("\nNumber now:", updated.phone_number, updated.voice_url, updated.sms_url);

  if (forwardTo === DEFAULT_TWILIO_FORWARD_TO) {
    console.log("\n(Set SOLVIO_TWILIO_FORWARD_TO on Vercel if you need a different mobile.)");
  }
}

main().catch((err) => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
