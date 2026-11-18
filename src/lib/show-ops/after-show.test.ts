import assert from "node:assert/strict";
import test from "node:test";

import { canaryYesterday, feedbackValues } from "@/lib/show-ops/after-show";
import { fillTemplateWording, templateSpec } from "@/lib/show-ops/inbox/templates";

test("yesterday is counted in Canary time", () => {
  assert.equal(canaryYesterday(new Date("2026-11-03T10:00:00Z")), "2026-11-02");
  assert.equal(canaryYesterday(new Date("2026-03-01T00:30:00Z")), "2026-02-28");
});

test("feedback blanks: first name, island, show date", () => {
  assert.deepEqual(feedbackValues({ guest_name: "Sarah Jones", island: "Tenerife", show_date: "2026-11-06" }), [
    "Sarah",
    "Tenerife",
    "Friday 6 November",
  ]);
});

test("feedback wording fills every blank", () => {
  const text = fillTemplateWording(templateSpec("feedback"), ["Sarah", "Tenerife", "Friday 6 November"]);
  assert.ok(text.startsWith("Hi Sarah,"));
  assert.ok(text.includes("MHT Show in Tenerife on Friday 6 November."));
  assert.ok(!/\{\{\d+\}\}/.test(text));
});

import { consentIntent, consentSummary } from "@/lib/show-ops/consent";

test("YES and STOP replies, and nothing else", () => {
  assert.equal(consentIntent("YES"), "yes");
  assert.equal(consentIntent("  yes please! "), "yes");
  assert.equal(consentIntent("Sí"), "yes");
  assert.equal(consentIntent("STOP"), "stop");
  assert.equal(consentIntent("Baja."), "stop");
  assert.equal(consentIntent("yes what time is the bus"), null);
  assert.equal(consentIntent("Hi"), null);
});

test("consent summary for the booking page", () => {
  const fmt = (iso: string) => iso.slice(0, 10);
  const base = { marketing_asked_at: null, marketing_opt_in_at: null, marketing_opt_in_source: null, whatsapp_opted_out_at: null };
  assert.match(consentSummary(base, fmt), /Not asked/);
  assert.match(consentSummary({ ...base, marketing_asked_at: "2026-11-04T10:00:00Z" }, fmt), /no answer yet/);
  assert.match(consentSummary({ ...base, marketing_opt_in_at: "2026-11-04T10:05:00Z", marketing_opt_in_source: "whatsapp_reply_yes" }, fmt), /replied YES on WhatsApp/);
  assert.match(consentSummary({ ...base, whatsapp_opted_out_at: "2026-11-05T09:00:00Z" }, fmt), /STOP/);
});

test("marketing ask: 23 to 47 hours after booking, never at night (Canary time)", async () => {
  const { marketingAskWindow, canaryHour } = await import("@/lib/show-ops/after-show");
  const noon = new Date("2026-11-18T12:00:00Z"); // winter: Canary = UTC
  assert.equal(canaryHour(noon), 12);
  const w = marketingAskWindow(noon);
  assert.equal(w.quiet, false);
  assert.equal(w.to, "2026-11-17T13:00:00.000Z");
  assert.equal(w.from, "2026-11-16T13:00:00.000Z");
  assert.equal(marketingAskWindow(new Date("2026-11-18T21:30:00Z")).quiet, true);
  assert.equal(marketingAskWindow(new Date("2026-11-18T08:59:00Z")).quiet, true);
  assert.equal(marketingAskWindow(new Date("2026-07-18T08:30:00Z")).quiet, false); // summer: 09:30 Canary
});
