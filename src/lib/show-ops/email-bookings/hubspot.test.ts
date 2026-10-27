import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanHubSpotToken, emailsFromMessages } from "./hubspot";
import { suggestSenders } from "./inbox";

const email = (address: string) => ({ name: "GetYourGuide", deliveryIdentifier: { type: "HS_EMAIL_ADDRESS", value: address } });

test("only incoming emails are kept, with a thread:message id", () => {
  const out = emailsFromMessages("123", [
    { id: "a", type: "MESSAGE", direction: "INCOMING", createdAt: "2026-10-20T10:00:00Z", subject: "New booking - GYG123ABC", text: "Lead traveller: Jane", senders: [email("Partner@GetYourGuide.com")] },
    { id: "b", type: "MESSAGE", direction: "OUTGOING", createdAt: "2026-10-20T11:00:00Z", subject: "Re: New booking", text: "Thanks", senders: [email("bookings@musichalltavern.com")] },
    { id: "c", type: "COMMENT", direction: "INCOMING", createdAt: "2026-10-20T12:00:00Z", text: "internal note", senders: [] },
    { id: "d", type: "MESSAGE", direction: "INCOMING", createdAt: "2026-10-20T13:00:00Z", text: "chat", senders: [{ name: "Visitor", deliveryIdentifier: { type: "CHANNEL_SPECIFIC_OPAQUE_ID", value: "x8f2" } }] },
    { id: "e", type: "MESSAGE", direction: "INCOMING", createdAt: "2026-10-20T14:00:00Z", subject: "New order #1", text: "x", senders: [{ name: "Shop", deliveryIdentifier: { type: "CHANNEL_SPECIFIC_OPAQUE_ID", value: "shop@musichalltavern.com" } }] },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[1].from, "shop@musichalltavern.com");
  assert.equal(out[0].id, "123:a");
  assert.equal(out[0].from, "partner@getyourguide.com");
  assert.equal(out[0].subject, "New booking - GYG123ABC");
  assert.equal(out[0].truncated, false);
});

test("HTML-only and truncated messages", () => {
  const [m] = emailsFromMessages("9", [
    { id: "x", type: "MESSAGE", direction: "INCOMING", createdAt: "2026-10-21T09:00:00Z", richText: "<p>Order&nbsp;#TFS/20957</p>", truncationStatus: "TRUNCATED_TO_MOST_RECENT_REPLY", senders: [email("shop@musichalltavern.com")] },
  ]);
  assert.equal(m.text, "Order #TFS/20957");
  assert.equal(m.truncated, true);
  assert.equal(m.subject, "(no subject)");
});

test("token check", () => {
  const sample = ["test", "only", "not", "a", "real", "key", "value"].join("-");
  assert.equal(cleanHubSpotToken(`  ${sample} `), sample);
  assert.equal(cleanHubSpotToken("short"), null);
  assert.equal(cleanHubSpotToken("has spaces in the middle of it ok"), null);
});

test("suggested senders group booking-looking subjects by domain", () => {
  const s = suggestSenders(
    [
      { subject: "New booking for Saturday", date: "2026-10-22T00:00:00Z", from: "Hotel Desk <desk@hotel-sol.es>" },
      { subject: "Reservation request: 4 people", date: "2026-10-21T00:00:00Z", from: "Other <res@hotel-sol.es>" },
      { subject: "Re: New booking", date: "2026-10-20T00:00:00Z", from: "desk@hotel-sol.es" },
    ],
    "bookings@musichalltavern.com",
  );
  assert.equal(s.length, 1);
  assert.equal(s[0].sender, "hotel-sol.es");
  assert.equal(s[0].found, 2);
});
