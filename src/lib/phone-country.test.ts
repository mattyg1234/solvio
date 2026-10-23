import assert from "node:assert/strict";
import { test } from "node:test";

import { flagOf, joinPhone, splitPhone } from "./phone-country";

test("splits stored numbers into country + rest", () => {
  assert.deepEqual(splitPhone("+34604189230"), { iso: "ES", rest: "604189230" });
  assert.deepEqual(splitPhone("+44 7700 900123"), { iso: "GB", rest: "7700900123" });
  assert.deepEqual(splitPhone("00353 85 123 4567"), { iso: "IE", rest: "851234567" });
  assert.deepEqual(splitPhone("+1 415 555 0100"), { iso: "US", rest: "4155550100" });
  // Bare numbers the Hub already recognises.
  assert.deepEqual(splitPhone("604 189 230"), { iso: "ES", rest: "604189230" });
  assert.deepEqual(splitPhone("07700900123"), { iso: "GB", rest: "7700900123" });
  // Anything else stays as typed.
  assert.deepEqual(splitPhone(""), { iso: "ES", rest: "" });
  assert.deepEqual(splitPhone("ask the partner"), { iso: "ES", rest: "ask the partner" });
});

test("joins country + number into E.164", () => {
  assert.equal(joinPhone("ES", "604 189 230"), "+34604189230");
  assert.equal(joinPhone("GB", "07700 900123"), "+447700900123");
  assert.equal(joinPhone("IT", "06 1234 5678"), "+390612345678");
  // A full number typed over the dropdown wins.
  assert.equal(joinPhone("ES", "+44 7700 900123"), "+447700900123");
  assert.equal(joinPhone("ES", ""), "");
  assert.equal(joinPhone("ES", "ask the partner"), "ask the partner");
});

test("round-trips", () => {
  for (const n of ["+34604189230", "+447700900123", "+353851234567", "+4915112345678"]) {
    const { iso, rest } = splitPhone(n);
    assert.equal(joinPhone(iso, rest), n);
  }
});

test("flags", () => {
  assert.equal(flagOf("ES"), "🇪🇸");
  assert.equal(flagOf("gb"), "🇬🇧");
});
