import assert from "node:assert/strict";
import test from "node:test";

import { crossedFields, isSaleStatusField, saleStatusMap, saleStatusStamp } from "@/lib/show-ops/sale-status";

test("blank night has no crosses", () => {
  assert.deepEqual(crossedFields(undefined), []);
  const m = saleStatusMap([{ show_date: "2026-11-06", island: "Lanzarote" }]);
  assert.deepEqual(crossedFields(m.get("2026-11-06|Lanzarote")), []);
});

test("crosses come back in handover order", () => {
  const m = saleStatusMap([
    { show_date: "2026-11-06", island: "Lanzarote", full_stop_sale: true, transport_closed: true },
  ]);
  assert.deepEqual(crossedFields(m.get("2026-11-06|Lanzarote")), ["transport_closed", "full_stop_sale"]);
  assert.equal(m.get("2026-11-06|Tenerife"), undefined);
});

test("only the three known fields can be toggled", () => {
  assert.ok(isSaleStatusField("part_stop_sale"));
  assert.ok(!isSaleStatusField("updated_by"));
  assert.ok(!isSaleStatusField("business_id"));
});

test("stamp is in Canary time with the name", () => {
  const m = saleStatusMap([
    { show_date: "2026-11-06", island: "Tenerife", updated_at: "2026-11-05T21:00:00Z", updated_by_name: "Nic" },
  ]);
  assert.equal(saleStatusStamp(m.get("2026-11-06|Tenerife")), "Nic · 5 Nov, 21:00");
});
