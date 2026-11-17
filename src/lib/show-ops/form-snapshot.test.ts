import assert from "node:assert/strict";
import test from "node:test";

import { formSnapshot } from "@/lib/show-ops/form-snapshot";

test("an edited email shows as a change", () => {
  const before = formSnapshot([["guest_email", "vinceforgharty@x.com"], ["guest_name", "Vince"]]);
  const after = formSnapshot([["guest_email", "vincefogharty@x.com"], ["guest_name", "Vince"]]);
  assert.notEqual(before, after);
});

test("ticking the send boxes is not an edit", () => {
  const before = formSnapshot([["guest_email", "a@b.com"]]);
  const after = formSnapshot([["guest_email", "a@b.com"], ["send_update", "1"], ["send_now", "1"], ["send_now_updated", "1"]]);
  assert.equal(before, after);
});
