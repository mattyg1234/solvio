import assert from "node:assert/strict";
import { test } from "node:test";

import {
  countryForCode,
  dropTrunkZero,
  flagOf,
  joinPhone,
  joinPhoneCode,
  splitPhone,
  splitPhoneCode,
  typedWithCountryCode,
} from "./phone-country";

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
  assert.equal(joinPhoneCode("999", "0123 456"), "+999123456");
  assert.equal(joinPhoneCode("999", ""), "");
  assert.deepEqual(splitPhoneCode("+447700900123"), { code: "44", rest: "7700900123" });
  assert.deepEqual(splitPhoneCode("+99912345678"), { code: "999", rest: "12345678" });
  assert.deepEqual(splitPhoneCode(""), { code: "34", rest: "" });
  // Round-trip of an unknown code is lossless.
  const split = splitPhoneCode("+99912345678");
  assert.equal(joinPhoneCode(split.code, split.rest), "+99912345678");
});

test("leading 0, 00 or (0) after the country code drops off (Joel, 2 Nov)", () => {
  // 07… and 7… save the same.
  assert.equal(joinPhoneCode("44", "07778 877123"), joinPhoneCode("44", "7778 877123"));
  assert.equal(joinPhoneCode("44", "007778 877123"), "+447778877123");
  assert.equal(joinPhoneCode("44", "(0) 7778 877123"), "+447778877123");
  // Full numbers typed with the trunk 0 still in.
  assert.equal(joinPhoneCode("34", "+44 (0) 7778 877123"), "+447778877123");
  assert.equal(joinPhoneCode("34", "+44 07778 877123"), "+447778877123");
  assert.equal(joinPhoneCode("34", "0044 7778 877123"), "+447778877123");
  assert.deepEqual(splitPhoneCode("+44 (0) 7778 877123"), { code: "44", rest: "7778877123" });
  assert.deepEqual(splitPhone("+4407778877123"), { iso: "GB", rest: "7778877123" });
  // Italy keeps its 0.
  assert.equal(joinPhoneCode("39", "06 1234 5678"), "+390612345678");
  assert.equal(dropTrunkZero("39", "0612"), "0612");
  assert.equal(dropTrunkZero("44", "(0) 7778"), "7778");
  // Which typed numbers carry their own country code.
  assert.equal(typedWithCountryCode("+44 7778"), true);
  assert.equal(typedWithCountryCode("0044 7778 877123"), true);
  assert.equal(typedWithCountryCode("007778 877"), false);
  assert.equal(typedWithCountryCode("07778 877123"), false);
});
