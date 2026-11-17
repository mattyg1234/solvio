import assert from "node:assert/strict";
import test from "node:test";

import {
  MailerLiteClient,
  bookingIsland,
  cleanGuestEmail,
  groupsForBooking,
  needsMailerLiteAdd,
  parseMailerLiteGroups,
  splitGuestName,
  type MailerLiteBooking,
} from "@/lib/show-ops/mailerlite";

const base: MailerLiteBooking = {
  id: "b1",
  guest_name: "Sarah Jane Smith",
  guest_email: "Sarah@Example.com ",
  guest_mobile: "+447700900000",
  island: "Tenerife",
  marketing_opt_in_at: "2026-11-12T10:00:00Z",
  whatsapp_opted_out_at: null,
  mailerlite_synced_at: null,
};

test("only guests who said YES, have an email and are not yet sent", () => {
  assert.equal(needsMailerLiteAdd(base), true);
  assert.equal(needsMailerLiteAdd({ ...base, marketing_opt_in_at: null }), false);
  assert.equal(needsMailerLiteAdd({ ...base, whatsapp_opted_out_at: "2026-11-12T11:00:00Z" }), false);
  assert.equal(needsMailerLiteAdd({ ...base, mailerlite_synced_at: "2026-11-12T11:00:00Z" }), false);
  assert.equal(needsMailerLiteAdd({ ...base, guest_email: "" }), false);
  assert.equal(needsMailerLiteAdd({ ...base, guest_email: "a@b.com, c@d.com" }), false);
});

test("emails and names are tidied for MailerLite", () => {
  assert.equal(cleanGuestEmail("  Sarah@Example.com "), "sarah@example.com");
  assert.equal(cleanGuestEmail("not an email"), null);
  assert.deepEqual(splitGuestName("Sarah Jane Smith"), { name: "Sarah", last_name: "Jane Smith" });
  assert.deepEqual(splitGuestName("  Cher "), { name: "Cher", last_name: "" });
});

test("main group plus the island's own group", () => {
  const groups = parseMailerLiteGroups({ groups: { all: "100", islands: { Tenerife: "200", Lanzarote: "", Bogus: "9" } } });
  assert.deepEqual(groups, { all: "100", islands: { Tenerife: "200" } });
  assert.deepEqual(groupsForBooking(groups, "Tenerife"), ["100", "200"]);
  assert.deepEqual(groupsForBooking(groups, "Lanzarote"), ["100"]);
  assert.equal(bookingIsland("LPA"), "Gran Canaria");
  assert.equal(bookingIsland("ace"), "Lanzarote");
  assert.equal(bookingIsland(""), null);
});

test("subscriber is sent without a status, so MailerLite unsubscribes stay unsubscribed", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fake = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ data: { id: "555" } }), { status: 200 });
  }) as unknown as typeof fetch;
  const id = await new MailerLiteClient("tok", fake).upsertSubscriber({ email: "a@b.com", name: "A", last_name: "B", phone: "+34600000000", groups: ["100"] });
  assert.equal(id, "555");
  assert.equal(calls[0].url, "https://connect.mailerlite.com/api/subscribers");
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body, { email: "a@b.com", fields: { name: "A", last_name: "B", phone: "+34600000000" }, groups: ["100"] });
  assert.equal("status" in body, false);
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer tok");
});

test("a bad token reads as a plain message", async () => {
  const fake = (async () => new Response(JSON.stringify({ message: "Unauthenticated." }), { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(new MailerLiteClient("bad", fake).listGroups(), (e: Error & { status?: number }) => e.status === 401);
});
