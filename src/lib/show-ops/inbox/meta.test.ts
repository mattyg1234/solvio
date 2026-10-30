import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import { parseTwilioMeta, templateRef } from "./connection";
import { metaErrorText, metaMessagePayload, parseMetaWebhook, validMetaSignature } from "./meta";

const PHONE_ID = "123456789012345";

function hook(value: Record<string, unknown>, phoneId = PHONE_ID) {
  return {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: phoneId, display_phone_number: "34 651 66 27 16" }, ...value } }] }],
  };
}

test("template payload sends blanks in number order, by name and language", () => {
  const p = metaMessagePayload("+447700900123", {
    template: { name: "mht_booking_with_transport", language: "en_GB", variables: { "2": "Tenerife", "1": "Sarah", "10": "x" } },
  }) as { to: string; template: { name: string; language: { code: string }; components: Array<{ parameters: Array<{ text: string }> }> } };
  assert.equal(p.to, "447700900123");
  assert.equal(p.template.name, "mht_booking_with_transport");
  assert.equal(p.template.language.code, "en_GB");
  assert.deepEqual(p.template.components[0].parameters.map((x) => x.text), ["Sarah", "Tenerife", "x"]);
});

test("free text payload", () => {
  const p = metaMessagePayload("+34600000000", { body: "Hello" }) as { type: string; text: { body: string } };
  assert.equal(p.type, "text");
  assert.equal(p.text.body, "Hello");
});

test("inbound text, photo and name are read for our number only", () => {
  const payload = hook({
    contacts: [{ wa_id: "447700900123", profile: { name: "Sarah J" } }],
    messages: [
      { from: "447700900123", id: "wamid.AAA", type: "text", text: { body: "Hi there" } },
      { from: "447700900123", id: "wamid.BBB", type: "image", image: { id: "998877665544", mime_type: "image/jpeg", caption: "our hotel" } },
    ],
  });
  const { messages } = parseMetaWebhook(payload, PHONE_ID);
  assert.equal(messages.length, 2);
  assert.deepEqual(
    { ...messages[0], media: messages[0].media.length },
    { sid: "wamid.AAA", channel: "whatsapp", from: "+447700900123", to: "+34651662716", body: "Hi there", profileName: "Sarah J", media: 0 },
  );
  assert.deepEqual(messages[1].media, [{ url: "meta-media:998877665544", type: "image/jpeg" }]);
  assert.equal(messages[1].body, "our hotel");
  assert.equal(parseMetaWebhook(hook({ messages: [{ from: "44", id: "x", type: "text", text: { body: "a" } }] }, "999999999"), PHONE_ID).messages.length, 0);
});

test("delivery ticks and failures", () => {
  const { statuses } = parseMetaWebhook(
    hook({
      statuses: [
        { id: "wamid.AAA", status: "delivered" },
        { id: "wamid.BBB", status: "failed", errors: [{ code: 131047, title: "Re-engagement message" }] },
        { id: "wamid.CCC", status: "deleted" },
      ],
    }),
    PHONE_ID,
  );
  assert.deepEqual(statuses.map((s) => [s.id, s.status, s.code]), [
    ["wamid.AAA", "delivered", null],
    ["wamid.BBB", "failed", "131047"],
  ]);
  assert.match(metaErrorText("131047"), /24-hour/);
});

test("signature is HMAC-SHA256 of the raw body with the app secret", () => {
  const secret = "0123456789abcdef0123456789abcdef";
  const body = JSON.stringify({ a: 1 });
  const sig = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.ok(validMetaSignature(secret, sig, body));
  assert.ok(!validMetaSignature(secret, sig, body + " "));
  assert.ok(!validMetaSignature(secret, null, body));
});

test("templates: Twilio by HX SID, Meta by approved name", () => {
  const meta = parseTwilioMeta({
    account_sid: "AC" + "a".repeat(32),
    pickup_content_sid: "HX" + "b".repeat(32),
    whatsapp_provider: "meta",
    meta_phone_number_id: PHONE_ID,
    meta_templates: { mht_transport_confirmation: "en" },
  });
  const creds = { accessToken: "t", appSecret: "s", phoneNumberId: PHONE_ID, wabaId: "1" };
  assert.deepEqual(templateRef({ meta, metaCreds: creds }, "pickup"), { name: "mht_transport_confirmation", language: "en" });
  assert.equal(templateRef({ meta, metaCreds: creds }, "booking"), null);
  // Meta chosen but not saved → Twilio.
  assert.deepEqual(templateRef({ meta, metaCreds: null }, "pickup"), { sid: "HX" + "b".repeat(32) });
});
