import assert from "node:assert/strict";
import test from "node:test";

import { possibleDuplicateIds, takenAtLabel } from "@/lib/show-ops/latest-bookings";

const row = (id: string, guest_name: string, show_date = "2026-11-10", island = "Lanzarote", cancelled_at: string | null = null) => ({
  id, guest_name, show_date, island, cancelled_at,
});

test("same guest, same night, same island is flagged", () => {
  const ids = possibleDuplicateIds([row("a", "Sarah Jones"), row("b", "sarah  jones"), row("c", "Tom Smith")]);
  assert.deepEqual([...ids].sort(), ["a", "b"]);
});

test("different night or island is not a duplicate", () => {
  assert.equal(possibleDuplicateIds([row("a", "Sarah Jones"), row("b", "Sarah Jones", "2026-11-11")]).size, 0);
  assert.equal(possibleDuplicateIds([row("a", "Sarah Jones"), row("b", "Sarah Jones", "2026-11-10", "Tenerife")]).size, 0);
});

test("a cancelled copy does not count", () => {
  assert.equal(possibleDuplicateIds([row("a", "Sarah Jones"), row("b", "Sarah Jones", "2026-11-10", "Lanzarote", "2026-11-08T10:00:00Z")]).size, 0);
});

test("taken time is Canary time", () => {
  assert.equal(takenAtLabel("2026-11-08T14:03:00Z"), "Sun 8 Nov, 14:03");
});
