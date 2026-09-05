import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isGlobalShowOpsAdmin,
  parseMemberIslands,
  islandAllowed,
} from "./island-access";
test("only owner and an unscoped administrator have global permission", () => {
  assert.equal(isGlobalShowOpsAdmin("owner", []), true);
  assert.equal(isGlobalShowOpsAdmin("admin", null), true);
  for (const role of ["seller", "booker", "office", "finance"])
    assert.equal(isGlobalShowOpsAdmin(role, null), false);
  assert.equal(isGlobalShowOpsAdmin("admin", ["Tenerife"]), false);
  assert.equal(isGlobalShowOpsAdmin("admin", []), false);
});
test("empty island scope grants nothing and chosen islands are validated", () => {
  assert.equal(islandAllowed(null, "Tenerife"), true);
  assert.equal(islandAllowed([], "Tenerife"), false);
  const fd = new FormData();
  fd.set("islands_mode", "selected");
  assert.deepEqual(parseMemberIslands(fd, ["Tenerife"]), []);
  fd.append("allowed_island", "Tenerife");
  assert.deepEqual(parseMemberIslands(fd, ["Tenerife"]), ["Tenerife"]);
  fd.append("allowed_island", "Other");
  assert.throws(() => parseMemberIslands(fd, ["Tenerife"]));
});

test("staff password resets cannot affect seller, owner or another workspace accounts", async () => {
  const { assertWorkspaceOnlyStaffAccount } = await import("./island-access");
  assert.doesNotThrow(() =>
    assertWorkspaceOnlyStaffAccount(
      "b",
      [{ business_id: "b", role: "booker" }],
      false,
    ),
  );
  for (const [memberships, owns] of [
    [[{ business_id: "other", role: "booker" }], false],
    [[{ business_id: "b", role: "seller" }], false],
    [[{ business_id: "b", role: "admin" }], true],
    [[], false],
  ] as const) {
    assert.throws(() =>
      assertWorkspaceOnlyStaffAccount("b", [...memberships], owns),
    );
  }
});
