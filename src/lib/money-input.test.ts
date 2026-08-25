import assert from "node:assert/strict";
import { test } from "node:test";

import { parseNumberInput, sanitizeNumberInput } from "./money-input";

test("deleting the 0 leaves the field empty, not 0", () => {
  assert.equal(sanitizeNumberInput(""), "");
  assert.equal(parseNumberInput(""), "");
  assert.equal(parseNumberInput("0"), 0);
});

test("comma decimals from European keyboards parse", () => {
  assert.equal(sanitizeNumberInput("0,02"), "0.02");
  assert.equal(parseNumberInput("7,5"), 7.5);
});

test("in-progress typing is not snapped back to a number", () => {
  assert.equal(parseNumberInput("."), "");
  assert.equal(parseNumberInput("7."), 7);
});
