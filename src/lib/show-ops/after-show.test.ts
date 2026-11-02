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
