import assert from "node:assert/strict";
import { test } from "node:test";

import { billingPatchFromForm, checkTaxId, cleanTaxId, composeBillingAddress, holdedReadiness } from "./partner-billing";

test("Spanish tax ids: NIF, NIE and CIF control characters", () => {
  assert.deepEqual(checkTaxId("12345678Z"), { ok: true, value: "12345678Z", kind: "nif" });
  assert.deepEqual(checkTaxId("12.345.678-z"), { ok: true, value: "12345678Z", kind: "nif" });
  assert.equal(checkTaxId("12345678A").ok, false);
  assert.deepEqual(checkTaxId("X1234567L"), { ok: true, value: "X1234567L", kind: "nie" });
  assert.equal(checkTaxId("X1234567A").ok, false);
  // B + 1234567: odd digits doubled 2,6,10→1,14→5 = 14, even 2+4+6 = 12, total 26 → control 4.
  assert.deepEqual(checkTaxId("B12345674"), { ok: true, value: "B12345674", kind: "cif" });
  assert.equal(checkTaxId("B12345675").ok, false);
  // P/Q/R/S/N/W companies end in a letter: control 4 → "D".
  assert.equal(checkTaxId("Q1234567D").ok, true);
  assert.equal(checkTaxId("Q12345674").ok, false);
  assert.deepEqual(checkTaxId("ESB12345674"), { ok: true, value: "B12345674", kind: "cif" });
  assert.equal(checkTaxId("").ok, false);
});

test("foreign tax ids only need a sane shape", () => {
  assert.deepEqual(checkTaxId("GB 123 4567 89", "GB"), { ok: true, value: "GB123456789", kind: "foreign" });
  assert.equal(checkTaxId("??", "GB").ok, false);
  assert.equal(cleanTaxId("es b-12345674"), "B12345674");
});

test("billing address line", () => {
  assert.equal(
    composeBillingAddress({ name: "x", invoice_address: "Calle Real 1", invoice_postal_code: "35510", invoice_city: "Puerto del Carmen", invoice_province: "Las Palmas" }),
    "Calle Real 1, 35510 Puerto del Carmen, Las Palmas",
  );
  assert.equal(
    composeBillingAddress({ name: "x", invoice_address: "1 High St", invoice_postal_code: "M1 1AA", invoice_city: "Manchester", invoice_country_code: "GB" }),
    "1 High St, M1 1AA Manchester, United Kingdom",
  );
  assert.equal(composeBillingAddress({ name: "x" }), null);
});

test("ready for Holded: lists exactly what is missing", () => {
  assert.deepEqual(holdedReadiness({ name: "TUI" }), [
    "legal name",
    "NIF / tax ID",
    "street address",
    "postcode",
    "town / city",
  ]);
  assert.deepEqual(
    holdedReadiness({ name: "TUI", legal_name: "TUI España SA", tax_id: "B12345674", invoice_address: "Calle 1", invoice_postal_code: "35510", invoice_city: "Tías" }),
    [],
  );
  assert.match(holdedReadiness({ name: "x", legal_name: "X SL", tax_id: "B12345675", invoice_address: "C 1", invoice_postal_code: "35510", invoice_city: "Tías" })[0], /not a valid/);
  assert.deepEqual(holdedReadiness({ name: "x", legal_name: "X SL", tax_id: "B12345674", invoice_address: "C 1", invoice_postal_code: "3551", invoice_city: "Tías" }), ["a 5-digit Spanish postcode"]);
  assert.equal(holdedReadiness(null).length, 1);
});

test("partner form: valid id stored clean, bad id or postcode refused, empty allowed", () => {
  const form = (o: Record<string, string>) => (k: string) => (k in o ? o[k] : null);
  const ok = billingPatchFromForm(form({ tax_id: "b-12345674", invoice_postal_code: "35510", invoice_country_code: "es", payment_terms_days: "30", is_person: "" }));
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.patch.tax_id, "B12345674");
    assert.equal(ok.patch.invoice_country_code, "ES");
    assert.equal(ok.patch.payment_terms_days, 30);
    assert.equal(ok.patch.is_person, false);
  }
  assert.equal(billingPatchFromForm(form({ tax_id: "B12345675" })).ok, false);
  assert.equal(billingPatchFromForm(form({ invoice_postal_code: "355" })).ok, false);
  assert.equal(billingPatchFromForm(form({ payment_terms_days: "-1" })).ok, false);
  const empty = billingPatchFromForm(form({}));
  assert.equal(empty.ok, true);
  if (empty.ok) {
    assert.equal(empty.patch.tax_id, null);
    assert.equal("payment_terms_days" in empty.patch, false, "a form without the field must not clear it");
  }
  const prefixed = billingPatchFromForm(form({ "s1_tax_id": "12345678Z" }), "s1_");
  assert.equal(prefixed.ok && prefixed.patch.tax_id, "12345678Z");
});
