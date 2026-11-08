import assert from "node:assert/strict";
import test from "node:test";

import { accessTokenAal, needsSecondStep, needsTwoStepSetup, safeTwoStepNext, twoStepRequiredFor } from "@/lib/supabase/two-step";

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

test("staff pages require two-step setup; partners and the off switch do not", () => {
  const none: Array<{ status: string }> = [];
  const verified = [{ status: "verified" }];
  assert.equal(needsTwoStepSetup(none, "/dashboard/show-ops", ""), true);
  assert.equal(needsTwoStepSetup(none, "/admin", ""), true);
  assert.equal(needsTwoStepSetup([{ status: "unverified" }], "/dashboard", ""), true);
  assert.equal(needsTwoStepSetup(verified, "/dashboard", ""), false);
  assert.equal(needsTwoStepSetup(none, "/partner/new", ""), false);
  assert.equal(needsTwoStepSetup(none, "/dashboard", "0"), false);
  assert.equal(twoStepRequiredFor("/login/two-step/setup", ""), false);
});
