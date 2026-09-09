import assert from "node:assert/strict";
import { test } from "node:test";

import { availabilityForRange, basicAuthMatches, bookingItemsToPax, cancellationRefusal, gygDateTime, leadTraveller, parseGygDateTime, utcOffsetFor, zoneForIsland } from "./gyg";

const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`;

test("basic auth: exact match only, closed when unconfigured", () => {
  assert.equal(basicAuthMatches(basic("gyg", "s3cret"), "gyg", "s3cret"), true);
  assert.equal(basicAuthMatches(basic("gyg", "wrong"), "gyg", "s3cret"), false);
  assert.equal(basicAuthMatches(basic("gyg", "s3cret"), undefined, "s3cret"), false);
  assert.equal(basicAuthMatches("Bearer abc", "gyg", "s3cret"), false);
  assert.equal(basicAuthMatches(null, "gyg", "s3cret"), false);
});

test("datetimes are local with the island's offset", () => {
  assert.equal(zoneForIsland("UK Tour"), "Europe/London");
  assert.equal(zoneForIsland("Tenerife"), "Atlantic/Canary");
  assert.equal(utcOffsetFor("2026-07-10", "Atlantic/Canary"), "+01:00");
  assert.equal(utcOffsetFor("2026-12-05", "Atlantic/Canary"), "+00:00");
  assert.equal(gygDateTime("2026-12-05", "19:00:00", "Tenerife"), "2026-12-05T19:00:00+00:00");
  assert.equal(gygDateTime("2026-07-10", null, "Lanzarote"), "2026-07-10T19:00:00+01:00");
  assert.deepEqual(parseGygDateTime("2026-12-05T19:00:00+00:00"), { date: "2026-12-05", time: "19:00" });
  assert.deepEqual(parseGygDateTime("2026-12-05"), { date: "2026-12-05", time: null });
  assert.equal(parseGygDateTime("yesterday"), null);
});

test("booking items map to adults/children/infants with the right error codes", () => {
  const ok = bookingItemsToPax([{ category: "ADULT", count: 2 }, { category: "CHILD", count: 1 }, { category: "INFANT", count: 1 }, { category: "SENIOR", count: 1 }]);
  assert.deepEqual(ok, { ok: true, pax: { adults: 3, children: 1, infants: 1, total: 5 } });
  const bad = bookingItemsToPax([{ category: "PET", count: 1 }]);
  assert.equal(!bad.ok && bad.error.errorCode, "INVALID_TICKET_CATEGORY");
  const group = bookingItemsToPax([{ category: "GROUP", count: 1 }]);
  assert.equal(!group.ok && group.error.errorCode, "INVALID_TICKET_CATEGORY");
  const infantsOnly = bookingItemsToPax([{ category: "INFANT", count: 2 }]);
  assert.equal(!infantsOnly.ok && infantsOnly.error.errorCode, "INVALID_PARTICIPANTS_CONFIGURATION");
  assert.equal(bookingItemsToPax([]).ok, false);
});

test("availability: weekly pattern plus one-off nights, minus closes, capacity − booked − holds", () => {
  const rows = availabilityForRange(
    { capacity: 100, runWeekdays: [1, 4], showTime: "19:00:00", island: "Tenerife", cutoffMinutes: 120 },
    "2026-12-07", // Monday
    "2026-12-13",
    { "2026-12-07": 90, "2026-12-09": 10 }, // Wed 9th is a one-off night
    { "2026-12-07": 15 },
    new Set(["2026-12-10"]), // Thursday closed
    "MHT-TFS",
  );
  assert.deepEqual(rows.map((r) => [r.dateTime, r.vacancies, r.cutoffSeconds]), [
    ["2026-12-07T19:00:00+00:00", 0, 7200],
    ["2026-12-09T19:00:00+00:00", 90, 7200],
    ["2026-12-10T19:00:00+00:00", 0, 7200],
  ]);
  assert.equal(availabilityForRange({ capacity: null, runWeekdays: [1], showTime: null, island: "Tenerife", cutoffMinutes: 0 }, "2026-12-07", "2026-12-07", {}, {}, new Set(), "p")[0].vacancies, 999);
  assert.deepEqual(availabilityForRange({ capacity: 10, runWeekdays: [1], showTime: null, island: "Tenerife", cutoffMinutes: 0 }, "2026-12-13", "2026-12-07", {}, {}, new Set(), "p"), []);
});

test("lead traveller and cancellation refusals", () => {
  assert.deepEqual(leadTraveller([{ firstName: "Ana", lastName: "Pérez", email: "ana@x.com", phoneNumber: "+34 600" }]), { name: "Ana Pérez", email: "ana@x.com", phone: "+34 600" });
  assert.deepEqual(leadTraveller([]), { name: "GetYourGuide guest", email: null, phone: null });
  const now = new Date("2026-12-10T12:00:00Z");
  assert.equal(cancellationRefusal({ show_date: "2026-12-11", arrived_at: null, cancelled_at: null }, now), null);
  assert.equal(cancellationRefusal({ show_date: "2026-12-09", arrived_at: null, cancelled_at: null }, now)?.errorCode, "BOOKING_IN_PAST");
  assert.equal(cancellationRefusal({ show_date: "2026-12-11", arrived_at: "2026-12-11T19:05:00Z", cancelled_at: null }, now)?.errorCode, "BOOKING_REDEEMED");
  assert.equal(cancellationRefusal({ show_date: "2026-12-11", arrived_at: null, cancelled_at: "2026-12-01T00:00:00Z" }, now)?.errorCode, "BOOKING_ALREADY_CANCELLED");
});
