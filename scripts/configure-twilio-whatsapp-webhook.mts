import { getTwilioAccountSid, getTwilioAuthToken } from "../src/lib/twilio-webhook";
import { webhookBaseUrl } from "../src/lib/twilio-webhook";

async function main() {
  const sid = getTwilioAccountSid();
  const token = getTwilioAuthToken();
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const base = webhookBaseUrl();
  const whatsappUrl = `${base}/api/webhooks/twilio/whatsapp`;

  const res = await fetch(
    "https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp&PageSize=50",
    {
      headers: { Authorization: `Basic ${auth}` },
    },
  );
  const json = (await res.json()) as {
    senders?: Array<{ sid: string; sender_id: string; status: string; webhook?: { callback_url?: string } }>;
    message?: string;
  };

  if (!res.ok) {
    console.log("WhatsApp senders API:", res.status, json.message ?? "");
    return;
  }

  const senders = json.senders ?? [];
  console.log("WhatsApp senders:", senders.length);
  for (const s of senders) {
    console.log(" ", s.sender_id, s.status, "webhook:", s.webhook?.callback_url ?? "(none)");
  }

  if (!senders.length) {
    console.log("\nNo WhatsApp senders — inbound WhatsApp relay not applicable until a sender is registered.");
    return;
  }

  for (const s of senders) {
    const patch = await fetch(`https://messaging.twilio.com/v2/Channels/Senders/${s.sid}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        WebhookCallbackUrl: whatsappUrl,
        WebhookCallbackMethod: "POST",
      }),
    });
    const body = await patch.json().catch(() => ({}));
    console.log(
      patch.ok ? "✅" : "❌",
      "Updated",
      s.sender_id,
      patch.ok ? "→" : patch.status,
      whatsappUrl,
      !patch.ok ? JSON.stringify(body).slice(0, 200) : "",
    );
  }
}

main().catch(console.error);
