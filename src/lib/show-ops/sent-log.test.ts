import assert from "node:assert/strict";
import test from "node:test";

import { SHOW_OPS_OUTBOUND_HELD } from "@/lib/show-ops/outbound";
import { sentEmailStatus } from "@/lib/show-ops/sent-email-log";
import { emailStatus, phoneStatus } from "@/lib/show-ops/sent-log";

test("send results become sent, held or failed rows", () => {
  assert.equal(sentEmailStatus({ ok: true, id: "x" }), "sent");
  assert.equal(sentEmailStatus({ ok: false, message: SHOW_OPS_OUTBOUND_HELD }), "held");
  assert.equal(sentEmailStatus({ ok: false, message: "Invalid email" }), "failed");
});

test("email status reads Resend's latest event", () => {
  assert.deepEqual(emailStatus("sent", "delivered"), { label: "Delivered", tone: "ok" });
  assert.equal(emailStatus("sent", "bounced").tone, "bad");
  assert.equal(emailStatus("sent", undefined).label, "Sent");
  assert.equal(emailStatus("held", undefined).tone, "warn");
  assert.equal(emailStatus("failed", "delivered").label, "Not sent");
});

test("phone status words", () => {
  assert.equal(phoneStatus("read").label, "Read");
  assert.equal(phoneStatus("failed").tone, "bad");
  assert.equal(phoneStatus("sent").label, "Sent");
});
