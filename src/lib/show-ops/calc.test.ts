import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeBookingMoney,
  formatShowOpsDoorTime,
  formatShowOpsMoney,
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

test("100% supplier still uses product nett when set", () => {
  const money = computeBookingMoney({
    adults: 4,
    children: 0,
    infants: 0,
    product,
    supplier: hundredPct,
    transportRequired: true,
  });
  assert.equal(money.total_cost, 260);
  assert.equal(money.nett_total, 180);
});

test("no-transport uses the cheaper price set", () => {
  const withBus = computeBookingMoney({
    adults: 2,
    children: 0,
    infants: 0,
    product,
    supplier: depositSupplier,
    transportRequired: true,
  });
  const noBus = computeBookingMoney({
    adults: 2,
    children: 0,
    infants: 0,
    product,
    supplier: depositSupplier,
    transportRequired: false,
  });
  assert.equal(withBus.total_cost, 130);
  assert.equal(noBus.total_cost, 100);
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
