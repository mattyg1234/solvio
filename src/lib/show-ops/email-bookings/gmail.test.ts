import assert from "node:assert/strict";
import { test } from "node:test";

import { googleErrorReason, isRateLimited } from "./gmail";

test("Gmail refusals: the reason is read from either error shape, and only rate limits are retried", () => {
  const disabled = { error: { code: 403, status: "PERMISSION_DENIED", details: [{ reason: "SERVICE_DISABLED" }] } };
  const legacy = { error: { code: 403, errors: [{ reason: "userRateLimitExceeded" }] } };
  assert.equal(googleErrorReason(disabled), "SERVICE_DISABLED");
  assert.equal(googleErrorReason(legacy), "userRateLimitExceeded");
  assert.equal(googleErrorReason({}), "");

  assert.equal(isRateLimited(403, "userRateLimitExceeded"), true);
  assert.equal(isRateLimited(403, "rateLimitExceeded"), true);
  assert.equal(isRateLimited(429, ""), true);
  assert.equal(isRateLimited(403, "SERVICE_DISABLED"), false);
  assert.equal(isRateLimited(403, "ACCESS_TOKEN_SCOPE_INSUFFICIENT"), false);
});
