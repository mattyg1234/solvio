// Holded write test: create contact + draft invoice (IGIC 7%), read back, optionally delete.
//   node scripts/holded-write-test.mjs          → creates, reads back, deletes
//   node scripts/holded-write-test.mjs --keep   → leaves them in Holded to inspect
import { call, authMode } from "./holded-client.mjs";
console.log("auth:", authMode);
if (authMode === "none") { console.error("no HOLDED_API_TOKEN / HOLDED_API_KEY in .env.local"); process.exit(1); }
const keep = process.argv.includes("--keep");

const taxes = (await call("GET", "/invoicing/v1/taxes")).json;
if (!Array.isArray(taxes)) { console.error("taxes call failed:", JSON.stringify(taxes).slice(0, 200)); process.exit(1); }
const igic = taxes.filter(t => /igic/i.test(`${t.name} ${t.key}`));
console.log("IGIC taxes:", igic.map(t => `${t.key}=${t.amount}% ${t.scope}`).join(" | ") || "(none found)");
console.log("Invoice series:", JSON.stringify((await call("GET", "/invoicing/v1/numberingseries/invoice")).json));

const c = await call("POST", "/invoicing/v1/contacts", {
  name: "SOLVIO TEST PARTNER SL", code: "B00000000", type: "client", email: "test@example.com",
  billAddress: { address: "Calle Test 1", city: "Adeje", postalCode: "38660", province: "Santa Cruz de Tenerife", country: "ES" },
  tags: ["solvio-test", "island:tenerife"],
});
console.log("create contact →", c.status, JSON.stringify(c.json).slice(0, 200));
const contactId = c.json?.id; if (!contactId) process.exit(1);

const igic7 = igic.find(t => Number(t.amount) === 7 && /^s_/.test(t.key || ""));
const item = { name: "MHT ACE Tenerife — 12 adults × 27.95 nett — Sept 2026", desc: "Booking refs 319001, 319002", units: 12, subtotal: 27.95 };
if (igic7) item.taxes = [igic7.key]; else item.tax = 7;
const now = Math.floor(Date.now() / 1000);
const inv = await call("POST", "/invoicing/v1/documents/invoice", {
  contactId, desc: "Solvio API test — partner pack Sept 2026", date: now, dueDate: now + 30 * 86400,
  items: [item], notes: "Created by Solvio API write test. Safe to delete.", tags: ["solvio-test"], approveDoc: false,
});
console.log("create invoice →", inv.status, JSON.stringify(inv.json).slice(0, 300));
const invId = inv.json?.id;

if (invId) {
  const d = (await call("GET", `/invoicing/v1/documents/invoice/${invId}`)).json;
  console.log("read back →", JSON.stringify({ docNumber: d.docNumber, status: d.status, subtotal: d.subtotal, tax: d.tax, total: d.total,
    items: (d.products || d.items || []).map(p => ({ name: String(p.name || "").slice(0, 40), units: p.units, price: p.price, tax: p.tax, taxes: p.taxes })) }));
  const pdf = await call("GET", `/invoicing/v1/documents/invoice/${invId}/pdf`);
  console.log("pdf endpoint →", pdf.status, typeof pdf.json === "object" ? Object.keys(pdf.json).join(",") : String(pdf.json).slice(0, 60));
}
if (keep) console.log(`KEPT in Holded → contact ${contactId}, invoice ${invId}. Check Ventas > Facturas.`);
else {
  if (invId) console.log("delete invoice →", (await call("DELETE", `/invoicing/v1/documents/invoice/${invId}`)).status);
  console.log("delete contact →", (await call("DELETE", `/invoicing/v1/contacts/${contactId}`)).status);
}
