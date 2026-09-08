import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./master-suppliers-form.tsx", import.meta.url), "utf8");

test("collapsed partner rows do not mount their detailed editor", () => {
  assert.match(source, /\{open \? \(\s*<div className="grid gap-2 border-t/);
  assert.match(source, /\) : null\}/);
  assert.doesNotMatch(source, /className=\{open \? [^}]+ : "hidden"\}/);
});

test("bulk submission builds a narrow payload instead of mutating row editors", () => {
  assert.match(source, /buildMasterSuppliersBulkPayload\(formData, ticked, tab\)/);
  assert.match(source, /payload\.append\("supplier_id", id\)/);
  assert.match(source, /payload\.append\("ticked", id\)/);
  assert.match(source, /formAction=\{submitBulk\}/);
  assert.doesNotMatch(source, /setField|setCheckbox|tickLocation/);
});

test("individual saving remains available and incomplete save-all is removed", () => {
  assert.match(source, /saveMasterSupplierOneAction\.bind\(null, s\.id\)/);
  assert.match(source, />\s*Save this partner\s*</);
  assert.doesNotMatch(source, /saveMasterSuppliersAllAction|Save all partners/);
});
