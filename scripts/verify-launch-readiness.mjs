#!/usr/bin/env node
/**
 * Read-only launch checks — run locally with production env loaded:
 *   npx vercel env pull .env.vercel.check --environment production --yes
 *   set -a && source .env.vercel.check && set +a && node scripts/verify-launch-readiness.mjs
 *   rm -f .env.vercel.check
 */
import Stripe from "stripe";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_BOOKING",
  "STRIPE_WEBHOOK_SECRET",
  "SOLVIO_RESEND_API_KEY",
  "SOLVIO_MAIL_FROM",
];

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://www.solviosystems.com";

function ok(label) {
  console.log(`✓ ${label}`);
}
function warn(label) {
  console.log(`⚠ ${label}`);
}
function fail(label) {
  console.log(`✗ ${label}`);
}

console.log("Solvio launch readiness\n");

for (const key of required) {
  if (process.env[key]?.trim()) ok(`${key} set`);
  else fail(`${key} missing`);
}

if (process.env.NEXT_PUBLIC_SITE_URL?.trim()) {
  ok(`NEXT_PUBLIC_SITE_URL=${process.env.NEXT_PUBLIC_SITE_URL}`);
} else {
  warn("NEXT_PUBLIC_SITE_URL empty — production falls back to https://www.solviosystems.com in code");
}

const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (anon) {
  try {
    const ref = JSON.parse(Buffer.from(anon.split(".")[1], "base64url").toString()).ref;
    const urlRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1];
    if (urlRef && ref === urlRef) ok(`Supabase anon key matches project ${ref}`);
    else fail(`Supabase mismatch: url ref ${urlRef} vs anon ${ref}`);
  } catch {
    fail("Could not parse anon JWT ref");
  }
}

const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
if (stripeKey) {
  const stripe = new Stripe(stripeKey);
  try {
    const account = await stripe.accounts.retrieve();
    ok(`Stripe platform account ${account.id} (${account.email ?? "no email"})`);
    const priceId = process.env.STRIPE_PRICE_BOOKING?.trim();
    if (priceId) {
      const price = await stripe.prices.retrieve(priceId);
      ok(`STRIPE_PRICE_BOOKING ${priceId} → ${price.unit_amount / 100} ${price.currency}/${price.recurring?.interval ?? "?"}`);
    }
  } catch (e) {
    fail(`Stripe API: ${e instanceof Error ? e.message : e}`);
  }
}

try {
  const res = await fetch(`${siteUrl}/`, { method: "HEAD", redirect: "manual" });
  if (res.status === 200 || res.status === 307) ok(`Homepage reachable (${res.status})`);
  else warn(`Homepage returned ${res.status}`);
} catch (e) {
  fail(`Homepage fetch: ${e instanceof Error ? e.message : e}`);
}

console.log("\nManual checks still required:");
console.log("  • Stripe Connect enabled + merchant onboarding complete");
console.log("  • Guest /book/[slug] submit + confirmation email");
console.log("  • Plans → Booking £50 checkout → subscription_tier=booking");
console.log("  • Supabase Auth URLs → Site URL + /auth/callback");
