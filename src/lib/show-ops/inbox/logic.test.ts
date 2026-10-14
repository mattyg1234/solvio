import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canUseShowOpsInbox,
  firstName,
  formatPhone,
  inboxFilters,
  inboxSeesAll,
  mapTwilioStatus,
  matchesInboxFilter,
  matchesInboxSearch,
  normalisePhone,
  parseInboundTwilio,
  phoneTail,
  previewOf,
  replyBlock,
  shouldApplyStatus,
  twilioErrorText,
  twilioSignature,
  validTwilioSignature,
  whatsappWindowLeft,
  whatsappWindowOpen,
  WHATSAPP_WINDOW_MS,
} from "@/lib/show-ops/inbox/logic";

const SID = "SM" + "a".repeat(32);

test("guest numbers become E.164", () => {
  assert.equal(normalisePhone("+34 612 345 678"), "+34612345678");
  assert.equal(normalisePhone("612345678"), "+34612345678");
  assert.equal(normalisePhone("0034 612-345-678"), "+34612345678");
  assert.equal(normalisePhone("07700 900123"), "+447700900123");
  assert.equal(normalisePhone("+44 (0)7700 900123"), "+447700900123");
  assert.equal(normalisePhone("whatsapp:+447700900123"), "+447700900123");
  assert.equal(normalisePhone("447700900123"), "+447700900123");
  assert.equal(normalisePhone("+1 415 555 0100"), "+14155550100");
  assert.equal(normalisePhone("12345"), null);
  assert.equal(normalisePhone("call me"), null);
  assert.equal(normalisePhone(""), null);
  assert.equal(normalisePhone(undefined), null);
});

test("phone tail and display", () => {
  assert.equal(phoneTail("+34 612 345 678"), "612345678");
  assert.equal(formatPhone("+34612345678"), "+34 612 345 678");
  assert.equal(formatPhone("+447700900123"), "+44 7700 900123");
  assert.equal(formatPhone("+14155550100"), "+14155550100");
});

test("who gets the inbox, and who sees all of it", () => {
  for (const r of ["owner", "admin", "finance", "office", "booker"]) assert.equal(canUseShowOpsInbox(r), true, r);
  assert.equal(canUseShowOpsInbox("seller"), false);
  assert.equal(canUseShowOpsInbox(null), false);
  assert.equal(inboxSeesAll("owner", false), true);
  assert.equal(inboxSeesAll("admin", false), true);
  assert.equal(inboxSeesAll("booker", false), false);
  assert.equal(inboxSeesAll("booker", true), true);
  assert.equal(inboxSeesAll("office", true), true);
  // A partner login never sees the inbox, even with the flag set by mistake.
  assert.equal(inboxSeesAll("seller", true), false);
});

test("WhatsApp 24-hour window", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  assert.equal(whatsappWindowOpen(null, now), false);
  assert.equal(whatsappWindowOpen("2026-10-14T11:00:00Z", now), true);
  assert.equal(whatsappWindowOpen(new Date(now - WHATSAPP_WINDOW_MS + 1000).toISOString(), now), true);
  assert.equal(whatsappWindowOpen(new Date(now - WHATSAPP_WINDOW_MS).toISOString(), now), false);
  assert.equal(whatsappWindowLeft("2026-10-14T11:00:00Z", now), 23 * 3600_000);
  assert.equal(whatsappWindowLeft("2026-10-12T11:00:00Z", now), 0);
});

test("reply rules", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  const base = { meId: "me", channel: "whatsapp" as const, lastInboundAt: "2026-10-14T11:00:00Z", senderConfigured: true, now };
  assert.deepEqual(replyBlock({ ...base, seesAll: false, assignedTo: "me" }), { ok: true });
  assert.equal(replyBlock({ ...base, seesAll: false, assignedTo: "other" }).ok, false);
  assert.equal(replyBlock({ ...base, seesAll: false, assignedTo: null }).ok, false);
  // Whole-inbox people may answer anything.
  assert.deepEqual(replyBlock({ ...base, seesAll: true, assignedTo: "other" }), { ok: true });
  const closed = replyBlock({ ...base, seesAll: true, assignedTo: null, lastInboundAt: "2026-10-12T11:00:00Z" });
  assert.equal(closed.ok === false && closed.reason, "window");
  // SMS has no window.
  assert.deepEqual(replyBlock({ ...base, channel: "sms", seesAll: true, assignedTo: null, lastInboundAt: null }), { ok: true });
  const noSender = replyBlock({ ...base, seesAll: true, assignedTo: null, senderConfigured: false });
  assert.equal(noSender.ok === false && noSender.reason, "no_sender");
});

test("Twilio signature: valid, wrong token, wrong url, tampered", () => {
  const url = "https://mht.solviosystems.com/api/show-ops/inbox/twilio/abc";
  const params = { Body: "Hola", From: "whatsapp:+34612345678", MessageSid: SID };
  const sig = twilioSignature("token123", url, params);
  assert.equal(validTwilioSignature("token123", sig, [url], params), true);
  assert.equal(validTwilioSignature("token123", sig, ["https://other.example/x", url], params), true);
  assert.equal(validTwilioSignature("wrong", sig, [url], params), false);
  assert.equal(validTwilioSignature("token123", sig, ["https://other.example/x"], params), false);
  assert.equal(validTwilioSignature("token123", sig, [url], { ...params, Body: "Adios" }), false);
  assert.equal(validTwilioSignature("token123", null, [url], params), false);
  assert.equal(validTwilioSignature("", sig, [url], params), false);
});

test("inbound webhook parsing", () => {
  const wa = parseInboundTwilio({
    MessageSid: SID,
    From: "whatsapp:+34612345678",
    To: "whatsapp:+34928000000",
    Body: "  Where is the bus?  ",
    ProfileName: "Ana",
    NumMedia: "2",
    MediaUrl0: `https://api.twilio.com/2010-04-01/Accounts/AC${"b".repeat(32)}/Messages/${SID}/Media/ME${"c".repeat(32)}`,
    MediaContentType0: "image/jpeg",
    MediaUrl1: "https://evil.example/file.jpg",
    MediaContentType1: "image/jpeg",
  });
  assert.ok(wa);
  assert.equal(wa.channel, "whatsapp");
  assert.equal(wa.from, "+34612345678");
  assert.equal(wa.to, "+34928000000");
  assert.equal(wa.body, "Where is the bus?");
  assert.equal(wa.profileName, "Ana");
  // Only Twilio-hosted media is kept.
  assert.equal(wa.media.length, 1);

  const sms = parseInboundTwilio({ MessageSid: SID, From: "+447700900123", To: "+34928000000", Body: "Hi" });
  assert.equal(sms?.channel, "sms");
  assert.equal(parseInboundTwilio({ MessageSid: "bad", From: "+447700900123", To: "+34928000000" }), null);
  assert.equal(parseInboundTwilio({ MessageSid: SID, From: "nonsense", To: "+34928000000" }), null);
});

test("delivery status never goes backwards; failures win", () => {
  assert.equal(mapTwilioStatus("accepted"), "queued");
  assert.equal(mapTwilioStatus("delivered"), "delivered");
  assert.equal(mapTwilioStatus("receiving"), null);
  assert.equal(shouldApplyStatus("queued", "sent"), true);
  assert.equal(shouldApplyStatus("delivered", "sent"), false);
  assert.equal(shouldApplyStatus("read", "delivered"), false);
  assert.equal(shouldApplyStatus("sent", "failed"), true);
  assert.equal(shouldApplyStatus("delivered", "failed"), false);
  assert.equal(shouldApplyStatus("failed", "delivered"), false);
  assert.equal(shouldApplyStatus("sent", "sent"), false);
});

test("error text, previews, first names", () => {
  assert.match(twilioErrorText("63016"), /24-hour/);
  assert.match(twilioErrorText("21610"), /STOP/);
  assert.equal(twilioErrorText("99999"), "Twilio error 99999.");
  assert.equal(twilioErrorText(null, "Custom"), "Custom");
  assert.equal(previewOf("Hello\nthere", "out"), "You: Hello there");
  assert.equal(previewOf("", "in", 2), "2 photos or files");
  assert.equal(previewOf("", "in", 1), "Photo or file");
  assert.equal(firstName("Ana María López"), "Ana");
  assert.equal(firstName(""), "there");
});

test("list tabs and search", () => {
  assert.deepEqual(inboxFilters(false), ["mine", "sent", "closed"]);
  assert.deepEqual(inboxFilters(true), ["unassigned", "mine", "sent", "all", "closed"]);
  const mine = { status: "open", assignedTo: "me", pendingHandoff: null };
  const nobody = { status: "open", assignedTo: null, pendingHandoff: null, lastInboundAt: "2026-10-14T10:00:00Z" };
  const ticketOnly = { status: "open", assignedTo: null, pendingHandoff: null, lastInboundAt: null };
  const sent = { status: "open", assignedTo: "other", pendingHandoff: { id: "h" } };
  const closed = { status: "closed", assignedTo: "me", pendingHandoff: null };
  assert.equal(matchesInboxFilter(mine, "mine", "me"), true);
  assert.equal(matchesInboxFilter(closed, "mine", "me"), false);
  assert.equal(matchesInboxFilter(nobody, "unassigned", "me"), true);
  assert.equal(matchesInboxFilter(ticketOnly, "unassigned", "me"), false);
  assert.equal(matchesInboxFilter(ticketOnly, "all", "me"), true);
  assert.equal(matchesInboxFilter(sent, "sent", "me"), true);
  assert.equal(matchesInboxFilter(sent, "all", "me"), true);
  assert.equal(matchesInboxFilter(closed, "closed", "me"), true);
  const c = { customerName: "Ana López", customerPhone: "+34612345678" };
  assert.equal(matchesInboxSearch(c, "ana"), true);
  assert.equal(matchesInboxSearch(c, "612 345"), true);
  assert.equal(matchesInboxSearch(c, "bob"), false);
  assert.equal(matchesInboxSearch(c, ""), true);
});
