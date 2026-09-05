import assert from "node:assert/strict";
import { test } from "node:test";
import { partnerBookingErrorMessage } from "./partner-booking";

test("partner capacity failures explain what the seller can do", () => {
  assert.match(partnerBookingErrorMessage({ message: "SHOW_OPS_SHOW_FULL" }), /enough tickets.*another night/i);
  assert.match(partnerBookingErrorMessage({ message: "SHOW_OPS_BUS_FULL" }), /enough bus seats.*office/i);
  assert.match(partnerBookingErrorMessage({ message: "SHOW_OPS_NIGHT_CLOSED" }), /closed/i);
  assert.match(partnerBookingErrorMessage({ message: "SHOW_OPS_PRODUCT_UNAVAILABLE" }), /show.*available/i);
});

test("unrecognised database details are not exposed to the partner", () => {
  const message = partnerBookingErrorMessage({ message: "constraint secret_internal_table violates RLS" });
  assert.doesNotMatch(message, /secret_internal_table/);
  assert.match(message, /could not save/i);
});
