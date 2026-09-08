// Read-only Holded API smoke test. Usage:
//   node scripts/holded-smoke.mjs            (reads HOLDED_API_KEY from .env.local)
// Never prints the key.
import { call, authMode } from "./holded-client.mjs";
console.log("auth:", authMode);

async function get(path) { const r = await call("GET", path); return { status: r.status, body: r.json }; }

const checks = [
  ["contacts", "/invoicing/v1/contacts"],
  ["sales invoices", "/invoicing/v1/documents/invoice"],
  ["purchase invoices", "/invoicing/v1/documents/purchase"],
  ["products", "/invoicing/v1/products"],
  ["treasury accounts", "/invoicing/v1/treasury"],
  ["numbering series", "/invoicing/v1/numberingseries/invoice"],
  ["taxes", "/invoicing/v1/taxes"],
  ["chart of accounts", "/accounting/v1/chartofaccounts"],
];

for (const [label, path] of checks) {
  const { status, body } = await get(path);
  const count = Array.isArray(body) ? body.length : body && typeof body === "object" ? Object.keys(body).length : 0;
  const note = status === 200 ? `${count} item(s)` : typeof body === "string" ? body.slice(0, 120) : JSON.stringify(body).slice(0, 160);
  console.log(`${status === 200 ? "OK " : "ERR"} ${status}  ${label.padEnd(18)} ${path}  → ${note}`);
  if (status === 200 && Array.isArray(body) && body[0]) {
    const sample = body[0];
    const keys = Object.keys(sample).slice(0, 12).join(", ");
    console.log(`         sample fields: ${keys}`);
  }
}
