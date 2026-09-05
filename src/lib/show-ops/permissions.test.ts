import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canSeeShowOpsPage,
  showOpsAllowedPages,
  visibleShowOpsNav,
  SHOW_OPS_PAGE_KEYS,
} from "./nav";

test("check-in staff see only the check-in list", () => {
  const pages = showOpsAllowedPages("booker", ["lists"]);
  assert.deepEqual(pages, ["lists"]);
  assert.equal(canSeeShowOpsPage("booker", ["lists"], "lists"), true);
  assert.equal(canSeeShowOpsPage("booker", ["lists"], "invoices"), false);
  assert.equal(canSeeShowOpsPage("booker", ["lists"], "reports"), false);
  assert.equal(canSeeShowOpsPage("booker", ["lists"], "settings"), false);
});

test("an explicit allow-list beats the role default", () => {
  // office normally gets reports; this one is restricted to the door.
  assert.equal(canSeeShowOpsPage("office", null, "reports"), true);
  assert.equal(canSeeShowOpsPage("office", ["lists", "door"], "reports"), false);
  assert.equal(canSeeShowOpsPage("office", ["lists", "door"], "door"), true);
});

test("no allow-list falls back to the role default", () => {
  assert.equal(canSeeShowOpsPage("booker", null, "lists"), true);
  assert.equal(canSeeShowOpsPage("booker", null, "invoices"), false, "booker must not reach invoicing");
  assert.equal(canSeeShowOpsPage("finance", null, "invoices"), true);
  assert.equal(canSeeShowOpsPage("finance", undefined, "stats"), true);
});

test("an empty allow-list is treated as unset, not as lockout", () => {
  assert.deepEqual(showOpsAllowedPages("booker", []), showOpsAllowedPages("booker", null));
});

test("settings cannot be granted to a non-admin, even if asked for", () => {
  assert.equal(canSeeShowOpsPage("booker", ["lists", "settings"], "settings"), false);
  assert.equal(canSeeShowOpsPage("office", ["settings"], "settings"), false);
  assert.equal(canSeeShowOpsPage("finance", ["settings"], "settings"), false);
  assert.equal(canSeeShowOpsPage("admin", ["settings"], "settings"), true);
});

test("owner and admin reach everything by default", () => {
  for (const key of SHOW_OPS_PAGE_KEYS) {
    assert.equal(canSeeShowOpsPage("owner", null, key), true, `owner should see ${key}`);
    assert.equal(canSeeShowOpsPage("admin", null, key), true, `admin should see ${key}`);
  }
});

test("catalogue pages remain senior-only even with an explicit saved grant", () => {
  for (const role of ["booker", "office", "finance", "seller", "unknown"]) {
    for (const key of ["shows", "partners", "hotels"] as const) {
      assert.equal(canSeeShowOpsPage(role, null, key), false, `${role} default ${key}`);
      assert.equal(canSeeShowOpsPage(role, [key, "bookings"], key), false, `${role} saved ${key}`);
    }
  }
});

test("catalogue restriction preserves booking and night bus access", () => {
  for (const role of ["booker", "office", "finance"]) {
    assert.equal(canSeeShowOpsPage(role, null, "bookings"), true);
    assert.equal(canSeeShowOpsPage(role, ["buses", "lists"], "buses"), true);
    assert.equal(canSeeShowOpsPage(role, ["buses", "lists"], "lists"), true);
  }
});

test("senior catalogue grants remain tab-specific", () => {
  for (const role of ["owner", "admin"]) {
    assert.equal(canSeeShowOpsPage(role, ["partners"], "partners"), true);
    assert.equal(canSeeShowOpsPage(role, ["partners"], "shows"), false);
    assert.equal(canSeeShowOpsPage(role, ["hotels"], "hotels"), true);
  }
});

test("sellers get no staff pages at all", () => {
  assert.deepEqual(showOpsAllowedPages("seller", null), []);
  assert.equal(canSeeShowOpsPage("seller", null, "lists"), false);
});

test("junk page keys are ignored rather than trusted", () => {
  const pages = showOpsAllowedPages("booker", ["lists", "not-a-page", "../admin"]);
  assert.deepEqual(pages, ["lists"]);
});

test("an unknown role falls back to the least-privileged default", () => {
  assert.deepEqual(showOpsAllowedPages("wat", null), showOpsAllowedPages("booker", null));
});

test("nav is stripped to what the member can reach, and empty groups vanish", () => {
  const sections = visibleShowOpsNav("booker", ["lists"]);
  const keys = sections.flatMap((s) => s.items.map((i) => i.key));
  assert.deepEqual(keys, ["lists"]);
  assert.equal(sections.length, 1, "only the group holding the check-in list should survive");
  assert.ok(!sections.some((s) => s.id === "settings"), "settings group must not render");
});

test("owner nav still shows every page", () => {
  const keys = visibleShowOpsNav("owner", null).flatMap((s) => s.items.map((i) => i.key));
  for (const key of SHOW_OPS_PAGE_KEYS) {
    assert.ok(keys.includes(key), `owner nav missing ${key}`);
  }
});
