import assert from "node:assert/strict";
import { test } from "node:test";

import { masterBulkTargets, masterBulkTickError, masterRowSaveTargets } from "./master-bulk";

test("Apply to ticked only updates ticked ids that are on the form", () => {
  const formIds = ["a", "b", "c"];
  assert.deepEqual(masterBulkTargets(["b"], formIds), ["b"]);
  assert.deepEqual(masterBulkTargets(["b", "a", "b"], formIds), ["b", "a"]);
});

test("Apply never falls back to every row when nothing is ticked", () => {
  const formIds = ["a", "b", "c"];
  assert.deepEqual(masterBulkTargets([], formIds), []);
  assert.equal(masterBulkTickError([]), "Tick the rows to change, or Tick all, then Apply.");
});

test("Save this row does not fall through to save every row", () => {
  const formIds = ["a", "b", "c"];
  assert.deepEqual(masterRowSaveTargets("save:b", formIds), ["b"]);
  assert.deepEqual(masterRowSaveTargets("save_all", formIds), ["a", "b", "c"]);
  assert.deepEqual(masterRowSaveTargets("", formIds), []);
  assert.deepEqual(masterRowSaveTargets("bulk", formIds), []);
  assert.deepEqual(masterRowSaveTargets("save:ghost", formIds), []);
});
