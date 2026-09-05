import assert from "node:assert/strict";
import { test } from "node:test";
import { invitePartnerSeller, assertPartnerAdmin, assertRemovableSeller, type PartnerInviteDependencies } from "./partner-invitations";

function fixture() {
  const calls: string[] = [];
  let member = false;
  const deps: PartnerInviteDependencies = {
    deliveryAllowed: () => true,
    assertAuthorized: async () => {},
    findUser: async () => member ? "u" : null,
    memberships: async () => member ? [{ business_id: "b", supplier_id: "s", role: "seller" }] : [],
    generateLink: async () => { calls.push("link"); return { userId: "u", tokenHash: "single-use", verificationType: "magiclink" }; },
    addMember: async () => { calls.push("member"); member = true; },
    send: async () => { calls.push("send"); return { ok: true }; },
  };
  return { deps, calls };
}
const input = { businessId: "b", supplierId: "s", email: "a@example.com", siteUrl: "https://example.com" };
test("blocked delivery makes no auth or membership writes", async () => {
  const { deps, calls } = fixture(); deps.deliveryAllowed = () => false;
  await assert.rejects(invitePartnerSeller(input, deps), /not sent.*test mode/i);
  assert.deepEqual(calls, []);
});
test("failed send can be retried with a fresh one-time link and same membership", async () => {
  const { deps, calls } = fixture(); deps.send = async () => ({ ok: false, message: "transport failed" });
  await assert.rejects(invitePartnerSeller(input, deps), /transport failed/);
  deps.send = async (url) => { const link = new URL(url); assert.equal(link.pathname, "/auth/confirm"); assert.equal(link.searchParams.get("type"), "magiclink"); assert.equal(link.searchParams.get("next"), "/partner/password"); return { ok: true }; };
  await invitePartnerSeller(input, deps);
  assert.deepEqual(calls, ["link", "member", "link"]);
});
test("existing account keeps its identity and membership without credential writes", async () => {
  const { deps, calls } = fixture(); deps.findUser = async () => "u";
  deps.memberships = async () => [{ business_id: "b", supplier_id: "s", role: "seller" }];
  await invitePartnerSeller(input, deps); assert.deepEqual(calls, ["link", "send"]);
});
test("cross-organisation and staff memberships are rejected before issuing links", async () => {
  for (const membership of [{ business_id: "other", supplier_id: "s", role: "seller" }, { business_id: "b", supplier_id: "other", role: "seller" }, { business_id: "b", supplier_id: null, role: "admin" }]) {
    const { deps, calls } = fixture(); deps.findUser = async () => "u"; deps.memberships = async () => [membership];
    await assert.rejects(invitePartnerSeller(input, deps), /another organisation or staff/); assert.deepEqual(calls, []);
  }
});
test("ordinary sellers cannot manage team and admins cannot remove admins or themselves", () => {
  assert.throws(() => assertPartnerAdmin(false), /administrator/);
  assert.doesNotThrow(() => assertPartnerAdmin(true));
  const ctx = { businessId: "b", supplierId: "s", userId: "me" };
  const row = { business_id: "b", supplier_id: "s", user_id: "other", role: "seller", partner_admin: false };
  assert.doesNotThrow(() => assertRemovableSeller(ctx, row));
  for (const bad of [{ ...row, partner_admin: true }, { ...row, user_id: "me" }, { ...row, supplier_id: "other" }]) assert.throws(() => assertRemovableSeller(ctx, bad));
});

test("thrown transport failure is never reported as a sent invitation", async () => {
  const { deps } = fixture(); deps.send = async () => { throw new Error("network unavailable"); };
  await assert.rejects(invitePartnerSeller(input, deps), /network unavailable/);
});

test("membership conflict discovered after auth issuance still prevents invitation delivery", async () => {
  const { deps, calls } = fixture();
  deps.memberships = async () => [{ business_id: "other", supplier_id: "s", role: "seller" }];
  await assert.rejects(invitePartnerSeller(input, deps), /another organisation/);
  assert.deepEqual(calls, ["link"]);
});

test("revoked invitation authority stops even existing-member resends before link issuance", async () => {
  const { deps, calls } = fixture();
  deps.findUser = async () => "u";
  const guarded = { ...deps, assertAuthorized: async () => { throw new Error("Administrator access revoked"); } };
  await assert.rejects(invitePartnerSeller(input, guarded), /access revoked/);
  assert.deepEqual(calls, []);
});

test("demotion during provisioning blocks email delivery", async () => {
  const { deps, calls } = fixture();
  let checks = 0;
  const guarded = { ...deps, assertAuthorized: async () => { if (++checks > 1) throw new Error("Administrator access revoked"); } };
  await assert.rejects(invitePartnerSeller(input, guarded), /access revoked/);
  assert.deepEqual(calls, ["link", "member"]);
});

test("new account invitation uses the provider signup verification type", async () => {
  const { deps } = fixture();
  deps.generateLink = async () => ({ userId: "u", tokenHash: "new-user-token", verificationType: "signup" });
  deps.send = async (url) => { assert.equal(new URL(url).searchParams.get("type"), "signup"); return {ok:true}; };
  await invitePartnerSeller(input, deps);
});
