import assert from "node:assert/strict";
import test from "node:test";

import { accessTokenAal, needsSecondStep, safeTwoStepNext } from "@/lib/supabase/two-step";

const token = (payload: object) =>
  `x.${Buffer.from(JSON.stringify(payload)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.y`;

test("reads aal from the token", () => {
  assert.equal(accessTokenAal(token({ aal: "aal2" })), "aal2");
  assert.equal(accessTokenAal("nonsense"), null);
});

test("no authenticator: never asks", () => {
  assert.equal(needsSecondStep([], token({ aal: "aal1" })), false);
  assert.equal(needsSecondStep([{ status: "unverified" }], token({ aal: "aal1" })), false);
});

test("authenticator on: asks until the code is entered", () => {
  assert.equal(needsSecondStep([{ status: "verified" }], token({ aal: "aal1" })), true);
  assert.equal(needsSecondStep([{ status: "verified" }], token({ aal: "aal2" })), false);
  assert.equal(needsSecondStep([{ status: "verified" }], null), true);
});

test("next only goes back into the Hub", () => {
  assert.equal(safeTwoStepNext("/dashboard/show-ops/bookings"), "/dashboard/show-ops/bookings");
  assert.equal(safeTwoStepNext("//evil.com"), "/dashboard");
  assert.equal(safeTwoStepNext("https://evil.com"), "/dashboard");
  assert.equal(safeTwoStepNext("/partner"), "/partner");
});
