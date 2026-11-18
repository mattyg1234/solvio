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

function fakeFetch(answers: Array<{ status: number; body: unknown } | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const a = answers.shift()!;
    if (a instanceof Error) throw a;
    return { ok: a.status < 300, status: a.status, json: async () => a.body } as Response;
  }) as unknown as typeof fetch;
  return { f, calls };
}

test("sends through SMTP2GO from MHT's address when the key is set", async () => {
  const { client, calls: resendCalls } = fakeClient([]);
  const { f, calls } = fakeFetch([{ status: 200, body: { data: { succeeded: 1, failed: 0, email_id: "abc" } } }]);
  const r = await sendShowOpsMail(
    client,
    { to: "g@x.com", subject: "Your ticket", html: "<p>h</p>", text: "h", attachments: [{ filename: "t.pdf", content: Buffer.from("PDF") }] },
    env({ SMTP2GO_API_KEY: "api-TEST" }),
    f,
  );
  assert.deepEqual(r, { data: { id: "abc" }, error: null });
  assert.equal(resendCalls.length, 0);
  assert.equal(calls[0].url, "https://api.smtp2go.com/v3/email/send");
  assert.equal((calls[0].init.headers as Record<string, string>)["X-Smtp2go-Api-Key"], "api-TEST");
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.sender, "MHT Shows <reservations@musichalltavern.com>");
  assert.deepEqual(body.to, ["g@x.com"]);
  assert.equal(body.html_body, "<p>h</p>");
  assert.deepEqual(body.attachments, [{ filename: "t.pdf", fileblob: Buffer.from("PDF").toString("base64"), mimetype: "application/pdf" }]);
});

test("falls back to Resend with Reply-To when SMTP2GO refuses or is down", async () => {
  for (const answer of [{ status: 400, body: { data: { error: "Sender not verified" } } }, new Error("network down")]) {
    const { client, calls: resendCalls } = fakeClient([{ data: { id: "r1" }, error: null }]);
    const { f } = fakeFetch([answer]);
    const r = await sendShowOpsMail(client, { to: "g@x.com", subject: "s", html: "h" }, env({ SMTP2GO_API_KEY: "api-TEST" }), f);
    assert.equal(r.error, null);
    assert.equal(resendCalls[0].from, "Solvio Bookings <hello@solviosystems.com>");
    assert.equal(resendCalls[0].replyTo, "reservations@musichalltavern.com");
  }
});
