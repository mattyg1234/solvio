import assert from "node:assert/strict";
import { test } from "node:test";
import { destinationAfterAuth } from "./auth-email-destination";
const origin = "https://solvio.example";
test("new and existing partner email links reach password setup", () => {
  for (const type of ["signup", "email", "magiclink"] as const) assert.equal(destinationAfterAuth(type, origin, "/partner/password"), `${origin}/partner/password`);
});
test("recovery and general signup retain established destinations", () => {
  assert.equal(destinationAfterAuth("recovery", origin, "/partner/password"), `${origin}/dashboard/settings?password=reset`);
  assert.equal(destinationAfterAuth("signup", origin, "/partner"), `${origin}/dashboard/onboarding`);
  assert.equal(destinationAfterAuth("email", origin, null), `${origin}/dashboard/onboarding`);
});
test("external, protocol-relative and backslash return targets are rejected", () => {
  for (const next of ["https://evil.example", "//evil.example", "/\\evil.example", "/path\nnext"]) assert.equal(destinationAfterAuth("magiclink", origin, next), `${origin}/dashboard`);
});
