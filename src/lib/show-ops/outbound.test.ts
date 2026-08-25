import assert from "node:assert/strict";
import { test } from "node:test";

import { filterShowOpsOutboundTo, showOpsOutboundLive } from "./outbound";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v == null) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v == null) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("holds every address until SHOW_OPS_EMAILS_LIVE=1 except Matty's test inbox", () => {
  withEnv({ SHOW_OPS_EMAILS_LIVE: undefined, SHOW_OPS_EMAIL_ALLOWLIST: undefined }, () => {
    assert.equal(showOpsOutboundLive(), false);
    assert.deepEqual(filterShowOpsOutboundTo(["agent@hotel.com", "mattygale4@gmail.com"]), [
      "mattygale4@gmail.com",
    ]);
  });
});

test("allowlist can receive test mail without going live", () => {
  withEnv(
    { SHOW_OPS_EMAILS_LIVE: "0", SHOW_OPS_EMAIL_ALLOWLIST: "mattygale4@gmail.com, office@test.com" },
    () => {
      assert.deepEqual(filterShowOpsOutboundTo(["agent@hotel.com", "mattygale4@gmail.com"]), [
        "mattygale4@gmail.com",
      ]);
    },
  );
});

test("live mode sends to every valid address", () => {
  withEnv({ SHOW_OPS_EMAILS_LIVE: "1", SHOW_OPS_EMAIL_ALLOWLIST: "" }, () => {
    assert.equal(showOpsOutboundLive(), true);
    assert.deepEqual(filterShowOpsOutboundTo(["agent@hotel.com", "bad"]), ["agent@hotel.com"]);
  });
});
