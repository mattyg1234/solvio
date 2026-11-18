import assert from "node:assert/strict";
import test from "node:test";

import { bareAddress, isUnverifiedDomainError, preferredShowOpsFrom, sendShowOpsMail } from "@/lib/notifications/show-ops-mail-from";

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

test("preferred from-address only when set", () => {
  assert.equal(preferredShowOpsFrom(env({})), null);
  assert.equal(preferredShowOpsFrom(env({ SHOW_OPS_MAIL_FROM: "MHT Shows <reservations@musichalltavern.com>" })), "MHT Shows <reservations@musichalltavern.com>");
  assert.equal(bareAddress("MHT Shows <reservations@musichalltavern.com>"), "reservations@musichalltavern.com");
  assert.equal(isUnverifiedDomainError("The musichalltavern.com domain is not verified. Please, add and verify your domain on https://resend.com/domains"), true);
  assert.equal(isUnverifiedDomainError("Invalid `to` field."), false);
});

function fakeClient(answers: Array<{ data: unknown; error: { message: string } | null }>) {
  const calls: Array<Record<string, unknown>> = [];
  const client = { emails: { send: async (p: Record<string, unknown>) => { calls.push(p); return answers.shift()!; } } };
  return { client: client as never, calls };
}

test("falls back to the Solvio sender with Reply-To while the domain is unverified", async () => {
  const { client, calls } = fakeClient([
    { data: null, error: { message: "The musichalltavern.com domain is not verified." } },
    { data: { id: "2" }, error: null },
  ]);
  const r = await sendShowOpsMail(client, { to: "g@x.com", subject: "s", html: "h" }, env({ SHOW_OPS_MAIL_FROM: "MHT Shows <reservations@musichalltavern.com>" }));
  assert.equal(r.error, null);
  assert.equal(calls[0].from, "MHT Shows <reservations@musichalltavern.com>");
  assert.equal(calls[1].from, "Solvio Bookings <hello@solviosystems.com>");
  assert.equal(calls[1].replyTo, "reservations@musichalltavern.com");
});

test("no retry for other errors, and plain send when nothing is set", async () => {
  const a = fakeClient([{ data: null, error: { message: "Invalid `to` field." } }]);
  await sendShowOpsMail(a.client, { to: "bad", subject: "s", html: "h" }, env({ SHOW_OPS_MAIL_FROM: "MHT <r@musichalltavern.com>" }));
  assert.equal(a.calls.length, 1);
  const b = fakeClient([{ data: { id: "1" }, error: null }]);
  await sendShowOpsMail(b.client, { to: "g@x.com", subject: "s", html: "h" }, env({}));
  assert.equal(b.calls[0].from, "Solvio Bookings <hello@solviosystems.com>");
});
