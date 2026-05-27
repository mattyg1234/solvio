#!/usr/bin/env node
/**
 * Send Resend's "Hello World" test email using SOLVIO_RESEND_API_KEY from the environment.
 *
 * Setup:
 *   1. Copy .env.example → .env.local
 *   2. Set SOLVIO_RESEND_API_KEY=re_xxxxxxxxx  (replace with your real key from resend.com/api-keys)
 *   3. Optional: TEST_RESEND_TO=you@example.com
 *
 * Run:
 *   node --env-file=.env.local scripts/test-resend-email.mjs
 *   # or: SOLVIO_RESEND_API_KEY=re_xxx node scripts/test-resend-email.mjs
 */
import { Resend } from "resend";

const apiKey = process.env.SOLVIO_RESEND_API_KEY?.trim() || process.env.RESEND_API_KEY?.trim();
if (!apiKey) {
  console.error(
    "Missing SOLVIO_RESEND_API_KEY. Add it to .env.local (replace re_xxxxxxxxx with your key from https://resend.com/api-keys).",
  );
  process.exit(1);
}

const to = process.env.TEST_RESEND_TO?.trim() || "mattygale2023@gmail.com";

const resend = new Resend(apiKey);

const from =
  process.env.SOLVIO_MAIL_FROM?.trim() ||
  process.env.RESEND_MAIL_FROM?.trim() ||
  "Solvio Bookings <hello@solviosystems.com>";

const { data, error } = await resend.emails.send({
  from,
  to,
  subject: "Hello World",
  html: "<p>Congrats on sending your <strong>first email</strong>!</p>",
});

if (error) {
  console.error("Resend error:", error.message);
  process.exit(1);
}

console.log("Sent OK — id:", data?.id, "→", to);
