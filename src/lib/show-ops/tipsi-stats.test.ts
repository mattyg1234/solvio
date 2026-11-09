import assert from "node:assert/strict";
import { test } from "node:test";

import { checkTipsiPassword, makeTipsiUnlockToken, verifyTipsiUnlockToken } from "./tipsi-gate";
import { visibleShowOpsNav } from "./nav";
import {
  matchTipsiMerch,
  summariseTipsiOrders,
  tipsiNightOf,
  tipsiOrderFromRow,
  tipsiPeriodRange,
  type TipsiOrder,
} from "./tipsi-stats";

function order(over: Partial<TipsiOrder>): TipsiOrder {
  return {
    id: "o",
    venueId: "v",
    createdAt: "2026-10-30T22:00:00Z",
    status: "completed",
    total: 10,
    fee: 1,
    refunded: false,
    refundAmount: 0,
    tableNumber: "5",
    items: [{ name: "Lager", price: 5, quantity: 2 }],
    acceptanceSeconds: 60,
    isGift: false,
    ...over,
  };
}

test("row parsing copes with numeric strings and bad items", () => {
  const o = tipsiOrderFromRow({
    id: "a",
    business_id: "b",
    created_at: "2026-10-30T22:00:00Z",
    status: "completed",
    total_amount: "21.95",
    platform_fee: "2.20",
    items: [{ name: "Jug", price: 21.95, quantity: 1 }, null, { price: 3 }],
    table_number: "",
  });
  assert.equal(o.total, 21.95);
  assert.equal(o.fee, 2.2);
  assert.equal(o.items.length, 1);
  assert.equal(o.tableNumber, null);
});

test("after-midnight orders count to the night before (Canary time)", () => {
  // 01:30 local in winter (UTC+0)
  assert.equal(tipsiNightOf("2026-11-05T01:30:00Z"), "2026-11-04");
  // 23:30 local in summer (UTC+1) is 22:30Z
  assert.equal(tipsiNightOf("2026-08-30T22:30:00Z"), "2026-08-30");
  // 00:30 local in summer is 23:30Z the day before
  assert.equal(tipsiNightOf("2026-08-30T23:30:00Z"), "2026-08-30");
});

test("summary totals, commission, refunds and top drinks", () => {
  const s = summariseTipsiOrders([
    order({ id: "1" }),
    order({ id: "2", total: 20, fee: 2, items: [{ name: "Jug", price: 20, quantity: 1 }], tableNumber: "7", isGift: true }),
    order({ id: "3", refunded: true, refundAmount: 10 }),
    order({ id: "4", status: "cancelled", total: 99, fee: 9 }),
  ], {
    stripeRate: { percent: 1.5, fixed: 0.25 },
    extraSalesPercent: 5,
    tips: [{ createdAt: "2026-10-30T22:30:00Z", amount: 3 }, { createdAt: "2026-10-30T22:40:00Z", amount: 0 }],
  });
  assert.equal(s.orders, 3);
  assert.equal(s.gross, 40);
  assert.equal(s.fee, 4);
  assert.equal(s.refunds, 10);
  // Stripe: 3 orders, (10*1.5%+0.25)=0.40 twice, (20*1.5%+0.25)=0.55 → 1.35
  assert.equal(s.stripeFees, 1.35);
  assert.equal(s.totalFees, 5.35);
  assert.equal(s.venueNet, 24.65);
  assert.equal(s.byMonth[0].net, 24.65);
  // Tipsi made you: gift 20 + tips 3 + 5% of 40 sales = 25
  assert.deepEqual(s.madeYou, { total: 25, gifts: 20, giftOrders: 1, tips: 3, tipCount: 1, extraSales: 2, extraPercent: 5 });
  assert.equal(s.byMonth[0].madeYou, 25);
  assert.equal(s.itemsSold, 5);
  assert.equal(s.topItems[0].name, "Lager");
  assert.equal(s.topItems[0].quantity, 4);
  assert.equal(s.topItems[1].name, "Jug");
  assert.equal(s.activeNights, 1);
  assert.equal(s.byMonth[0].month, "2026-10");
  assert.deepEqual(s.topTables.map((t) => t.table).sort(), ["5", "7"]);
});

test("periods use 06:00 Canary as the night boundary", () => {
  const now = new Date("2026-11-02T20:00:00Z");
  const thisMonth = tipsiPeriodRange("this-month", now);
  assert.equal(thisMonth.fromIso, "2026-11-01T06:00:00.000Z");
  const last = tipsiPeriodRange("last-month", now);
  // 1 Oct is summer time (UTC+1): 06:00 local = 05:00Z
  assert.equal(last.fromIso, "2026-10-01T05:00:00.000Z");
  assert.equal(last.toIso, "2026-11-01T06:00:00.000Z");
  assert.equal(tipsiPeriodRange("nonsense", now).key, "all");
});

test("password gate: default 0000, signed per user, expires", () => {
  delete process.env.TIPSI_TAB_PASSWORD;
  assert.equal(checkTipsiPassword("0000"), true);
  assert.equal(checkTipsiPassword(" 0000 "), true);
  assert.equal(checkTipsiPassword("1234"), false);
  const t = makeTipsiUnlockToken("joel", 1_000_000);
  assert.equal(verifyTipsiUnlockToken(t, "joel", 1_000_000), true);
  assert.equal(verifyTipsiUnlockToken(t, "ruth", 1_000_000), false);
  assert.equal(verifyTipsiUnlockToken(t, "joel", 1_000_000 + 13 * 3600_000), false);
  assert.equal(verifyTipsiUnlockToken("garbage", "joel"), false);
  process.env.TIPSI_TAB_PASSWORD = "9999";
  assert.equal(verifyTipsiUnlockToken(t, "joel", 1_000_000), false, "changing the password locks old sessions");
  delete process.env.TIPSI_TAB_PASSWORD;
});

test("Tipsi tab shows in the nav only for the owner", () => {
  const has = (role: string, pages: string[] | null) =>
    visibleShowOpsNav(role, pages).some((s) => s.items.some((i) => i.key === "tipsi"));
  assert.equal(has("owner", null), true);
  assert.equal(has("admin", null), false);
  assert.equal(has("admin", ["reports", "settings"]), false);
  assert.equal(has("booker", null), false);
});

test("merch lines group by product with their sizes, and leave top drinks", () => {
  const names = ["Bitch T-Shirt", "MHT Cup – Pink"];
  assert.deepEqual(matchTipsiMerch("Bitch T-Shirt (XL)", names), { product: "Bitch T-Shirt", option: "XL" });
  assert.deepEqual(matchTipsiMerch("MHT Cup – Pink", names), { product: "MHT Cup – Pink", option: null });
  assert.equal(matchTipsiMerch("Lager", names), null);
  const s = summariseTipsiOrders(
    [
      order({ id: "1", items: [{ name: "Bitch T-Shirt (XL)", price: 15, quantity: 2 }, { name: "Lager", price: 5, quantity: 1 }] }),
      order({ id: "2", items: [{ name: "Bitch T-Shirt (XXL)", price: 15, quantity: 1 }, { name: "MHT Cup – Pink", price: 10, quantity: 1 }] }),
    ],
    { merchNames: names, tips: [] },
  );
  assert.equal(s.merch.quantity, 4);
  assert.equal(s.merch.revenue, 55);
  assert.equal(s.merch.top[0].name, "Bitch T-Shirt");
  assert.deepEqual(s.merch.top[0].options, [{ option: "XL", quantity: 2 }, { option: "XXL", quantity: 1 }]);
  assert.deepEqual(s.topItems.map((t) => t.name), ["Lager"]);
  assert.equal(s.itemsSold, 1);
});

test("extra-sales estimate is off by default, so Tipsi made you = gifts + tips", () => {
  delete process.env.TIPSI_EXTRA_SALES_PERCENT;
  const s = summariseTipsiOrders([order({ id: "1", total: 20, isGift: true }), order({ id: "2" })], {
    tips: [{ createdAt: "2026-10-30T22:30:00Z", amount: 3 }],
  });
  assert.equal(s.madeYou.extraPercent, 0);
  assert.equal(s.madeYou.extraSales, 0);
  assert.equal(s.madeYou.total, 23);
  assert.equal(s.byMonth[0].madeYou, 23);
});
