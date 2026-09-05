import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeBusNightOrder } from "./bus-night-order";
test("saving a filtered bus order preserves hidden pickup positions", () => {
  assert.deepEqual(mergeBusNightOrder(["a", "b", "c", "d"], ["d", "b"]), [
    "a",
    "d",
    "c",
    "b",
  ]);
  assert.deepEqual(mergeBusNightOrder([], ["a", "b"]), ["a", "b"]);
  assert.throws(() => mergeBusNightOrder(["a"], ["a", "a"]));
});
