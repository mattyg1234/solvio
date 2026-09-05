import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { sendShowOpsInvoiceEmail } from "./show-ops-emails";

const opts = {
  to: "mattygale4@gmail.com", cc: "real-person@example.com", merchantName: "Test issuer", supplierName: "Test partner",
  verifactuNumber: "TEST-42", invoiceDate: "2026-09-05", periodStart: "2026-09-01", periodEnd: "2026-09-04",
  dueDate: "2026-10-05", totalAmount: 120, currency: "gbp" as const, paid: false, lines: [],
  ticketAttachments: [{ filename: "ticket-BK-42-booking-42.png", content: Buffer.from("test-photo-bytes").toString("base64") }],
  invoiceAttachment: { filename: "invoice-TEST-42.pdf", content: Buffer.from("%PDF-test").toString("base64") },
};

test("invoice transport attaches PDF bytes and gates CC in test mode", async () => {
  const previous = { key: process.env.SOLVIO_RESEND_API_KEY, live: process.env.SHOW_OPS_EMAILS_LIVE, allow: process.env.SHOW_OPS_EMAIL_ALLOWLIST };
  process.env.SOLVIO_RESEND_API_KEY = "re_test_no_network";
  process.env.SHOW_OPS_EMAILS_LIVE = "0";
  process.env.SHOW_OPS_EMAIL_ALLOWLIST = "";
  let body: Record<string, unknown> | undefined;
  const transport = mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: "test-only" }), { status: 200, headers: { "content-type": "application/json" } });
  });
  try {
    const result = await sendShowOpsInvoiceEmail(opts);
    assert.equal(result.ok, true);
    assert.equal(transport.mock.callCount(), 1);
    assert.ok(body);
    assert.ok(!body.cc || (body.cc as string[]).length === 0, "blocked CC must never reach provider");
    assert.deepEqual(body.attachments, [opts.invoiceAttachment, ...opts.ticketAttachments]);
  } finally {
    transport.mock.restore();
    for (const [key, value] of [["SOLVIO_RESEND_API_KEY", previous.key], ["SHOW_OPS_EMAILS_LIVE", previous.live], ["SHOW_OPS_EMAIL_ALLOWLIST", previous.allow]]) {
      if (value == null) delete process.env[key!]; else process.env[key!] = value;
    }
  }
});
