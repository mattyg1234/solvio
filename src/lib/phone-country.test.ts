import assert from "node:assert/strict";
import { test } from "node:test";

import { countryForCode, flagOf, joinPhone, joinPhoneCode, splitPhone, splitPhoneCode } from "./phone-country";

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

test("typed country code: known codes pick the country, unknown ones still save", () => {
  assert.equal(countryForCode("34")?.iso, "ES");
  assert.equal(countryForCode("371")?.name, "Latvia");
  assert.equal(countryForCode("999"), null);
  assert.equal(joinPhoneCode("34", "612 345 678"), "+34612345678");
  assert.equal(joinPhoneCode("44", "07700 900123"), "+447700900123");
  assert.equal(joinPhoneCode("999", "0123 456"), "+9990123456");
  assert.equal(joinPhoneCode("999", ""), "");
  assert.deepEqual(splitPhoneCode("+447700900123"), { code: "44", rest: "7700900123" });
  assert.deepEqual(splitPhoneCode("+99912345678"), { code: "999", rest: "12345678" });
  assert.deepEqual(splitPhoneCode(""), { code: "34", rest: "" });
  // Round-trip of an unknown code is lossless.
  const split = splitPhoneCode("+99912345678");
  assert.equal(joinPhoneCode(split.code, split.rest), "+99912345678");
});
