import assert from "node:assert/strict";
import { test } from "node:test";

import { coreName, holdedContactRecord, planPartnerImport, type HubPartner } from "./holded-partner-import";

const partner = (over: Partial<HubPartner>): HubPartner => ({
  id: "p1",
  name: "TFS Tenerife Channel - INVOICE",
  island: "Tenerife",
  legal_name: null,
  tax_id: null,
  email: null,
  invoice_address: null,
  invoice_postal_code: null,
  invoice_city: null,
  invoice_province: null,
  invoice_country_code: null,
  is_person: null,
  holded_contact_id: null,
  ...over,
});

const contact = (over: Record<string, unknown>) =>
  holdedContactRecord({
    id: "h1",
    name: "THE TENERIFE CHANNEL SL",
    trade_name: "Tenerife Channel",
    vat_number: "B93874733",
    email: "Office@TenerifeChannel.com",
    bill_address: { address: "CR General del Sur 39", postal_code: "38620", city: "San Miguel de Abona", province: "Santa Cruz de Tenerife", country_code: "es" },
    is_person: false,
    tags: ["clientes"],
    ...over,
  })!;

test("coreName drops island codes, billing notes, percentages and company forms", () => {
  assert.equal(coreName("TFS Excursions 4 U - 30% Deposit"), "excursions 4 u");
  assert.equal(coreName("TFS Excursions 4 U - INVOICE"), "excursions 4 u");
  assert.equal(coreName("EXCURSIONS 4 U, S.L."), "excursions 4 u");
  assert.equal(coreName("TFS Go Excursions Tenerife -30% DEP"), "go excursions tenerife");
  assert.equal(coreName("Viajes Tenerife S.L.U."), "viajes tenerife");
  assert.equal(coreName("TFS"), "tfs");
  assert.equal(coreName("THE TENERIFE CHANNEL SL"), "tenerife channel");
});

test("holdedContactRecord reads both API shapes", () => {
  const v1 = holdedContactRecord({ id: "a", name: "X", vatnumber: "B1", billAddress: { postalCode: "38001", countryCode: "es" }, isperson: 1 });
  assert.equal(v1?.taxId, "B1");
  assert.equal(v1?.postalCode, "38001");
  assert.equal(v1?.countryCode, "ES");
  assert.equal(v1?.isPerson, true);
  assert.equal(holdedContactRecord({ id: "a" }), null);
});

test("name match fills only empty fields and never overwrites", () => {
  const [row] = planPartnerImport([partner({ email: "keep@hub.com" })], [contact({ trade_name: null })]);
  assert.equal(row.kind, "fill");
  if (row.kind !== "fill") return;
  assert.equal(row.matchedBy, "name");
  assert.equal(row.fill.email, undefined);
  assert.equal(row.fill.tax_id, "B93874733");
  assert.equal(row.fill.legal_name, "THE TENERIFE CHANNEL SL");
  assert.equal(row.fill.invoice_country_code, "ES");
  assert.equal(row.fill.holded_contact_id, "h1");
});

test("deposit and invoice versions of one business both match the same contact", () => {
  const rows = planPartnerImport(
    [partner({ id: "a", name: "TFS Excursions 4 U - 30% Deposit" }), partner({ id: "b", name: "TFS Excursions 4 U - INVOICE" })],
    [contact({ name: "Excursions 4 U SL", trade_name: null, vat_number: "B38000000" })],
  );
  assert.deepEqual(rows.map((r) => r.kind), ["fill", "fill"]);
});

test("an invalid NIF in Holded is not copied", () => {
  const [row] = planPartnerImport([partner({})], [contact({ vat_number: "B12345678" })]);
  assert.equal(row.kind, "fill");
  if (row.kind === "fill") assert.equal(row.fill.tax_id, undefined);
});

test("NIF match wins over name; a different NIF is a conflict", () => {
  const [byTax] = planPartnerImport([partner({ name: "Something else", tax_id: "B-93874733" })], [contact({})]);
  assert.equal(byTax.kind, "fill");
  if (byTax.kind === "fill") assert.equal(byTax.matchedBy, "NIF");
  const [clash] = planPartnerImport([partner({ tax_id: "45866693R" })], [contact({})]);
  assert.equal(clash.kind, "conflict");
});

test("two Holded contacts with the same name are ambiguous; island tags separate them", () => {
  const twins = [contact({ id: "h1", vat_number: null }), contact({ id: "h2", vat_number: null })];
  assert.equal(planPartnerImport([partner({})], twins)[0].kind, "ambiguous");
  const tagged = [contact({ id: "h1", vat_number: null, tags: ["lanzarote"] }), contact({ id: "h2", vat_number: null, tags: ["tenerife"] })];
  const [row] = planPartnerImport([partner({})], tagged);
  assert.equal(row.kind, "fill");
  if (row.kind === "fill") assert.equal(row.contact.id, "h2");
});

test("no match and nothing to fill are reported as such", () => {
  assert.equal(planPartnerImport([partner({ name: "ACE Saga" })], [contact({})])[0].kind, "unmatched");
  const done = partner({
    legal_name: "x", tax_id: "B93874733", email: "a@b.c", invoice_address: "x", invoice_postal_code: "1", invoice_city: "x",
    invoice_province: "x", invoice_country_code: "ES", is_person: false, holded_contact_id: "h1",
  });
  assert.equal(planPartnerImport([done], [contact({})])[0].kind, "complete");
});
