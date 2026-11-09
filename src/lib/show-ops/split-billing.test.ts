import assert from "node:assert/strict";
import test from "node:test";

import { splitBillingForms } from "./split-billing";

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

test("not a split leaves the form alone", () => {
  assert.equal(splitBillingForms(form({ billing_mode: "deposit", adults: "2" })), null);
});

test("splits pax into an invoice part and a deposit part", () => {
  const r = splitBillingForms(form({
    billing_mode: "split", adults: "4", children: "2", infants: "1",
    split_invoice_adults: "2", split_invoice_children: "0",
    send_ticket: "1", extras: '[{"id":"x","quantity":1}]', attendee_name_0: "Ann", office_comments: "VIP",
  }));
  assert.ok(r && r.ok);
  assert.equal(r.invoice.get("billing_mode"), "invoice");
  assert.equal(r.invoice.get("adults"), "2");
  assert.equal(r.invoice.get("children"), "0");
  assert.equal(r.invoice.get("send_ticket"), null);
  assert.equal(r.invoice.get("extras"), "[]");
  assert.equal(r.invoice.get("attendee_name_0"), null);
  assert.equal(r.deposit.get("billing_mode"), "deposit");
  assert.equal(r.deposit.get("adults"), "2");
  assert.equal(r.deposit.get("children"), "2");
  assert.equal(r.deposit.get("infants"), "1");
  assert.equal(r.deposit.get("send_ticket"), "1");
  assert.equal(r.deposit.get("attendee_name_0"), "Ann");
  assert.match(String(r.deposit.get("office_comments")), /^VIP\nSplit booking: 2 adults on invoice, 2 adults \+ 2 children \+ 1 infant on deposit\.$/);
  assert.equal(r.deposit.get("split_invoice_adults"), null);
});

test("refuses a split with nobody on one side or too many on invoice", () => {
  const all = splitBillingForms(form({ billing_mode: "split", adults: "2", split_invoice_adults: "2" }));
  assert.ok(all && !all.ok);
  const none = splitBillingForms(form({ billing_mode: "split", adults: "2", split_invoice_adults: "0" }));
  assert.ok(none && !none.ok);
  const over = splitBillingForms(form({ billing_mode: "split", adults: "2", split_invoice_adults: "3" }));
  assert.ok(over && !over.ok && /More guests/.test(over.error));
});
