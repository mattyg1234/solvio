import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeBookingMoney,
  formatShowOpsDoorTime,
  formatShowOpsMoney,
  hasPricingSnapshot,
  paymentStatusAfter,
  showOpsAmountDue,
  showOpsBookingPayView,
  showOpsArrivalMark,
  arrivalFlagPatch,
  applyNoShowBilling,
  resolveNoShowCharge,
} from "./calc";

const product = {
  adult_price: 65,
  child_price: 40,
  infant_price: 0,
  adult_nett: 45,
  child_nett: 28,
  adult_price_no_transport: 50,
  child_price_no_transport: 30,
  infant_price_no_transport: 0,
};

const islandAgency = {
  billing_mode: "invoice" as const,
  deposit_percent: 0,
  invoice_nett_percent: 85,
};

const hundredPct = {
  billing_mode: "invoice" as const,
  deposit_percent: 0,
  invoice_nett_percent: 100,
};

const depositSupplier = {
  billing_mode: "deposit" as const,
  deposit_percent: 30,
  invoice_nett_percent: 100,
};

test("Island Agency 85% applies to ticket gross, not product nett", () => {
  const money = computeBookingMoney({
    adults: 4,
    children: 0,
    infants: 0,
    product,
    supplier: islandAgency,
    transportRequired: true,
  });
  assert.equal(money.total_cost, 260);
  assert.equal(money.nett_total, 221);
  assert.equal(money.adult_nett_total, 221);
});

test("100% partner invoices the full ticket price even when legacy show netts exist", () => {
  const money = computeBookingMoney({
    adults: 4,
    children: 0,
    infants: 0,
    product,
    supplier: hundredPct,
    transportRequired: true,
  });
  assert.equal(money.total_cost, 260);
  assert.equal(money.nett_total, 260);
});

test("the ticket price stays the same and transport adds ten per adult", () => {
  const withBus = computeBookingMoney({
    adults: 2,
    children: 0,
    infants: 0,
    product,
    supplier: depositSupplier,
    transportRequired: true,
    transportSupplement: 10,
  });
  const noBus = computeBookingMoney({
    adults: 2,
    children: 0,
    infants: 0,
    product,
    supplier: depositSupplier,
    transportRequired: false,
  });
  assert.equal(withBus.total_cost, 150);
  assert.equal(noBus.total_cost, 130);
});

test("new deposit booking outstanding is the full total, not total minus deposit", () => {
  const money = computeBookingMoney({
    adults: 2,
    children: 0,
    infants: 0,
    product: { ...product, adult_price: 50, adult_price_no_transport: 50 },
    supplier: depositSupplier,
    transportRequired: false,
  });
  assert.equal(money.total_cost, 100);
  assert.equal(money.deposit_amount, 30);
  assert.equal(money.balance_remaining, 100);
  assert.equal(money.payment_status, "unpaid");
});

test("amount due is the deposit until something is paid, then the remainder", () => {
  const unpaid = showOpsAmountDue({
    billingMode: "deposit",
    totalCost: 100,
    depositAmount: 30,
    paidSum: 0,
  });
  assert.equal(unpaid.kind, "deposit");
  assert.equal(unpaid.amount, 30);

  const afterDeposit = showOpsAmountDue({
    billingMode: "deposit",
    totalCost: 100,
    depositAmount: 30,
    paidSum: 30,
  });
  assert.equal(afterDeposit.kind, "balance");
  assert.equal(afterDeposit.amount, 70);

  const fiveEuro = paymentStatusAfter(100, 5);
  assert.equal(fiveEuro.balance, 95);
  assert.equal(fiveEuro.payment_status, "partial");

  const doorPaid = paymentStatusAfter(100, 100);
  assert.equal(doorPaid.balance, 0);
  assert.equal(doorPaid.payment_status, "paid");
});

test("booking pay view: deposit paid vs outstanding, invoice uses nett", () => {
  const unpaid = showOpsBookingPayView({
    billingMode: "deposit",
    totalCost: 100,
    balanceRemaining: 100,
    nettTotal: 0,
    paymentStatus: "unpaid",
    cancelledAt: null,
  });
  assert.equal(unpaid.label, "Unpaid");
  assert.equal(unpaid.paidAmount, 0);
  assert.equal(unpaid.outstandingAmount, 100);

  const part = showOpsBookingPayView({
    billingMode: "deposit",
    totalCost: 100,
    balanceRemaining: 70,
    nettTotal: 0,
    paymentStatus: "partial",
    cancelledAt: null,
  });
  assert.equal(part.label, "Part paid");
  assert.equal(part.paidAmount, 30);
  assert.equal(part.outstandingAmount, 70);

  const invoice = showOpsBookingPayView({
    billingMode: "invoice",
    totalCost: 260,
    balanceRemaining: 0,
    nettTotal: 221,
    paymentStatus: "n_a",
    cancelledAt: null,
  });
  assert.equal(invoice.label, "Invoice");
  assert.equal(invoice.paidAmount, null);
  assert.equal(invoice.outstandingAmount, 221);
});

test("6 of 8 showed is partial, not a no-show of the booking", () => {
  const mark = showOpsArrivalMark({
    adults: 6,
    children: 2,
    infants: 0,
    arrivedPax: 6,
  });
  assert.equal(mark.status, "partial");
  assert.equal(mark.arrived, 6);
  assert.equal(mark.booked, 8);
  assert.equal(mark.missing, 2);
  assert.equal(mark.shortLabel, "6 / 8 showed");
  assert.equal(mark.doorLabel, "6 of 8 showed");
});

test("all in, none, and not marked yet", () => {
  assert.equal(showOpsArrivalMark({ adults: 8, children: 0, infants: 0, arrivedPax: 8 }).status, "all_in");
  assert.equal(showOpsArrivalMark({ adults: 8, children: 0, infants: 0, arrivedPax: 0 }).status, "absent");
  assert.equal(showOpsArrivalMark({ adults: 8, children: 0, infants: 0 }).status, "pending");
});

test("legacy arrived_at without a count means the whole party showed", () => {
  const mark = showOpsArrivalMark({
    adults: 8,
    children: 0,
    infants: 0,
    arrivedAt: "2026-08-14T20:00:00Z",
  });
  assert.equal(mark.status, "all_in");
  assert.equal(mark.arrived, 8);
});

test("arrivalFlagPatch keeps money fields out and syncs door flags", () => {
  const partial = arrivalFlagPatch(6, 8, "now", null);
  assert.equal(partial.arrived_pax, 6);
  assert.equal(partial.no_show, false);
  assert.equal(partial.arrived_at, "now");
  const none = arrivalFlagPatch(0, 8, "now", "was-in");
  assert.equal(none.arrived_pax, 0);
  assert.equal(none.no_show, true);
  assert.equal(none.arrived_at, null);
  const clear = arrivalFlagPatch(null, 8, "now", "was-in");
  assert.equal(clear.arrived_pax, null);
  assert.equal(clear.no_show, false);
});

test("4 pax no-show charged keeps full invoice nett and a charge note", () => {
  const billed = applyNoShowBilling({
    booked: 4,
    arrived: 0,
    totalCost: 260,
    nettTotal: 221,
    adultNettTotal: 221,
    childNettTotal: 0,
    charge: "charge",
  });
  assert.equal(billed.needsDecision, false);
  assert.equal(billed.billedNett, 221);
  assert.equal(billed.billedTotalCost, 260);
  assert.equal(billed.billedAdultNett, 221);
  assert.match(billed.invoiceNote ?? "", /no-show/i);
  assert.match(billed.invoiceNote ?? "", /charged/i);
});

test("4 pax no-show written off invoices zero and keeps booked history", () => {
  const billed = applyNoShowBilling({
    booked: 4,
    arrived: 0,
    totalCost: 260,
    nettTotal: 221,
    adultNettTotal: 221,
    childNettTotal: 0,
    charge: "write_off",
  });
  assert.equal(billed.billedNett, 0);
  assert.equal(billed.billedTotalCost, 0);
  assert.equal(billed.billedAdultNett, 0);
  assert.equal(billed.missing, 4);
  assert.match(billed.invoiceNote ?? "", /written off/i);
});

test("partial no-show write-off bills only who showed, not the missing pax", () => {
  const billed = applyNoShowBilling({
    booked: 8,
    arrived: 6,
    totalCost: 520,
    nettTotal: 442,
    adultNettTotal: 442,
    childNettTotal: 0,
    charge: "write_off",
  });
  assert.equal(billed.missing, 2);
  assert.equal(billed.billedNett, 331.5);
  assert.equal(billed.billedTotalCost, 390);
  assert.match(billed.invoiceNote ?? "", /2 of 8/);
});

test("undecided no-show still needs a choice and does not write off yet", () => {
  const billed = applyNoShowBilling({
    booked: 4,
    arrived: 0,
    totalCost: 260,
    nettTotal: 221,
    adultNettTotal: 221,
    childNettTotal: 0,
    charge: null,
  });
  assert.equal(billed.needsDecision, true);
  assert.equal(billed.billedNett, 221);
  assert.equal(billed.invoiceNote, null);
});

test("all showed never asks for a no-show decision", () => {
  const billed = applyNoShowBilling({
    booked: 4,
    arrived: 4,
    totalCost: 260,
    nettTotal: 221,
    adultNettTotal: 221,
    childNettTotal: 0,
    charge: "write_off",
  });
  assert.equal(billed.needsDecision, false);
  assert.equal(billed.billedNett, 221);
  assert.equal(billed.invoiceNote, null);
});

test("partner default fills the decision when the office has not chosen yet", () => {
  assert.equal(resolveNoShowCharge(null, "write_off"), "write_off");
  assert.equal(resolveNoShowCharge("charge", "write_off"), "charge");
  assert.equal(resolveNoShowCharge(null, null), "charge");
});

test("door clock is Canaries local time", () => {
  assert.equal(formatShowOpsDoorTime("2026-08-19T20:05:00.000Z"), "21:05");
  assert.equal(formatShowOpsDoorTime(null), "");
});

test("money uses thousands separators", () => {
  assert.equal(formatShowOpsMoney(138336, "eur"), "€138,336.00");
  assert.equal(formatShowOpsMoney(118.5, "eur"), "€118.50");
  assert.equal(formatShowOpsMoney(130000, "gbp"), "£130,000.00");
});

/* ── Transport supplement ────────────────────────────────────────────────────
 * Taking the bus adds a flat per-head supplement to adults and children.
 * Infants ride free. The partner's cut is still worked out on the full total.
 */

const CANARIES_SHOW = {
  adult_price: 49,
  child_price: 29,
  infant_price: 0,
  adult_nett: null,
  child_nett: null,
  adult_price_no_transport: null,
  child_price_no_transport: null,
  infant_price_no_transport: null,
};

test("bus supplement adds €10 a head to adults and children, never infants", () => {
  const without = computeBookingMoney({
    adults: 2,
    children: 1,
    infants: 1,
    product: CANARIES_SHOW,
    supplier: null,
    transportRequired: false,
    transportSupplement: 10,
  });
  assert.equal(without.total_cost, 127); // 2×49 + 1×29 + 1×0

  const withBus = computeBookingMoney({
    adults: 2,
    children: 1,
    infants: 1,
    product: CANARIES_SHOW,
    supplier: null,
    transportRequired: true,
    transportSupplement: 10,
  });
  // 2×59 + 1×39 + infant still free
  assert.equal(withBus.total_cost, 157);
  assert.equal(withBus.total_cost - without.total_cost, 30);
});

test("a seller still takes 30% of the transport-inclusive total", () => {
  const money = computeBookingMoney({
    adults: 2,
    children: 0,
    infants: 0,
    product: CANARIES_SHOW,
    supplier: { billing_mode: "deposit", deposit_percent: 30, invoice_nett_percent: 100 },
    transportRequired: true,
    transportSupplement: 10,
  });
  assert.equal(money.total_cost, 118); // 2 × (49 + 10)
  assert.equal(money.deposit_amount, 35.4); // 30% of 118, not of 98
});

test("legacy secondary price fields cannot change the single ticket price", () => {
  const paired = { ...CANARIES_SHOW, adult_price: 130, adult_price_no_transport: 110 };
  const withBus = computeBookingMoney({
    adults: 1,
    children: 0,
    infants: 0,
    product: paired,
    supplier: null,
    transportRequired: true,
    transportSupplement: 10,
  });
  const without = computeBookingMoney({
    adults: 1,
    children: 0,
    infants: 0,
    product: paired,
    supplier: null,
    transportRequired: false,
    transportSupplement: 10,
  });
  assert.equal(withBus.total_cost, 140);
  assert.equal(without.total_cost, 130);
});

test("supplement of zero leaves every price exactly where it was", () => {
  const money = computeBookingMoney({
    adults: 2,
    children: 2,
    infants: 0,
    product: CANARIES_SHOW,
    supplier: null,
    transportRequired: true,
    transportSupplement: 0,
  });
  assert.equal(money.total_cost, 156); // 2×49 + 2×29
});

test("invoice nett follows the bus supplement through the partner percentage", () => {
  const money = computeBookingMoney({
    adults: 2,
    children: 0,
    infants: 0,
    product: CANARIES_SHOW,
    supplier: { billing_mode: "invoice", deposit_percent: 0, invoice_nett_percent: 85 },
    transportRequired: true,
    transportSupplement: 10,
  });
  assert.equal(money.total_cost, 118);
  assert.equal(money.nett_total, 100.3); // 85% of 118
});

test("every booking priced through the desk carries a snapshot of its rates", () => {
  const money = computeBookingMoney({
    adults: 1,
    children: 0,
    infants: 0,
    product: CANARIES_SHOW,
    supplier: { billing_mode: "invoice", deposit_percent: 30, invoice_nett_percent: 85 },
    transportRequired: true,
    transportSupplement: 10,
  });
  assert.equal(hasPricingSnapshot(money.pricing_snapshot), true);
  assert.equal(money.pricing_snapshot.adult_price, 59);
  assert.equal(money.pricing_snapshot.invoice_nett_percent, 85);
  assert.equal(money.pricing_snapshot.transport_supplement, 10);
  assert.equal(hasPricingSnapshot(null), false);
});

test("partner rate controls every age band including zero commission and free partner tickets", () => {
  for (const percent of [100, 80, 0]) {
    const money = computeBookingMoney({
      adults: 1, children: 1, infants: 1,
      product: { ...product, infant_price: 10, infant_price_no_transport: 10, adult_nett: 1, child_nett: 0 },
      supplier: { ...hundredPct, invoice_nett_percent: percent },
      transportRequired: true,
    });
    assert.equal(money.nett_total, 115 * percent / 100);
    assert.equal(money.pricing_snapshot.adult_nett_unit, 65 * percent / 100);
    assert.equal(money.pricing_snapshot.child_nett_unit, 40 * percent / 100);
    assert.equal(money.pricing_snapshot.infant_nett_unit, 10 * percent / 100);
  }
});

test("a partner rate card sets the adult/child price and replaces the bus supplement", () => {
  const withCard = computeBookingMoney({
    adults: 2,
    children: 1,
    infants: 1,
    product,
    supplier: { billing_mode: "invoice", deposit_percent: 30, invoice_nett_percent: 65 },
    transportRequired: true,
    transportSupplement: 10,
    rateCard: { rate_id: "r1", rate_name: "TFS Reception", tipo: 1, adult_price: 59, child_price: 49 },
  });
  // Card price already includes the bus: no +10 on top. Infants stay on the master price.
  assert.equal(withCard.total_cost, 2 * 59 + 49 + 0);
  assert.equal(withCard.pricing_snapshot.adult_price, 59);
  assert.equal(withCard.pricing_snapshot.transport_supplement, 0);
  assert.equal(withCard.pricing_snapshot.price_source, "rate_card");
  assert.deepEqual(withCard.pricing_snapshot.rate_card, { id: "r1", name: "TFS Reception", tipo: 1 });
  // Nett is the partner's percentage of the card price, rounded per head (Lanzasoft parity).
  assert.equal(withCard.pricing_snapshot.adult_nett_unit, 38.35);
  assert.equal(withCard.nett_total, 108.55);

  const noCard = computeBookingMoney({
    adults: 2,
    children: 1,
    infants: 1,
    product,
    supplier: { billing_mode: "invoice", deposit_percent: 30, invoice_nett_percent: 65 },
    transportRequired: true,
    transportSupplement: 10,
    rateCard: null,
  });
  assert.equal(noCard.total_cost, 2 * 75 + 50);
  assert.equal(noCard.pricing_snapshot.price_source, "master");
  assert.equal(noCard.pricing_snapshot.rate_card, null);
});

test("a frozen snapshot keeps the sold prices and rates when only pax move", () => {
  const original = computeBookingMoney({
    adults: 2,
    children: 0,
    infants: 0,
    product,
    supplier: { billing_mode: "deposit", deposit_percent: 30, invoice_nett_percent: 65 },
    transportRequired: true,
    transportSupplement: 10,
    rateCard: { rate_id: "r1", rate_name: "Old card", tipo: 1, adult_price: 59, child_price: 49 },
  });
  const snapshot = { ...original.pricing_snapshot, priced_at: "2026-09-01T10:00:00.000Z" };
  // Master price went up and the supplier's terms changed since — none of it may move this booking.
  const edited = computeBookingMoney({
    adults: 3,
    children: 1,
    infants: 0,
    product: { ...product, adult_price: 99, child_price: 80 },
    supplier: { billing_mode: "deposit", deposit_percent: 50, invoice_nett_percent: 10 },
    transportRequired: true,
    transportSupplement: 25,
    rateCard: { rate_id: "r2", rate_name: "New card", tipo: 1, adult_price: 200, child_price: 100 },
    frozen: snapshot,
  });
  assert.equal(edited.total_cost, 3 * 59 + 49);
  assert.equal(edited.deposit_amount, Math.round((3 * 59 + 49) * 0.3 * 100) / 100);
  assert.equal(edited.nett_total, 146.9);
  assert.equal(edited.pricing_snapshot.frozen_from, "2026-09-01T10:00:00.000Z");
  assert.deepEqual(edited.pricing_snapshot.rate_card, { id: "r1", name: "Old card", tipo: 1 });
  assert.equal(edited.pricing_snapshot.price_source, "rate_card");
});
