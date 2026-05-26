#!/usr/bin/env node
/**
 * Create Solvio subscription products/prices on the Stripe account for sk_live_*.
 * Usage (from repo root):
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-provision-solvio-prices.mjs
 *
 * Account must be mattygale2023 → acct_1TbSEyEMUQyVybDT
 */
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key) {
  console.error("Set STRIPE_SECRET_KEY=sk_live_...");
  process.exit(1);
}

const stripe = new Stripe(key);

const PLANS = [
  {
    name: "Solvio Booking",
    description: "Public /book pages, operations hub, Stripe Connect deposits. £50/mo GBP.",
    unitAmount: 5000,
    env: "STRIPE_PRICE_BOOKING",
  },
  {
    name: "Solvio Pro",
    description: "Full AI receptionist + operations hub. £150/mo GBP.",
    unitAmount: 15000,
    env: "STRIPE_PRICE_PRO",
  },
  {
    name: "Solvio Scale",
    description: "Multi-location operators. £499/mo GBP.",
    unitAmount: 49900,
    env: "STRIPE_PRICE_SCALE",
  },
];

const acct = await stripe.accounts.retrieve();
console.log("stripe_account_id=" + acct.id);
console.log("expected_account_id=acct_1TbSEyEMUQyVybDT");
if (acct.id !== "acct_1TbSEyEMUQyVybDT") {
  console.warn("WARNING: key is not the mattygale2023 Solvio account — stop if this is wrong.");
}

const existing = await stripe.prices.list({ active: true, limit: 100, expand: ["data.product"] });
const byProductName = new Map();
for (const p of existing.data) {
  const prod = p.product;
  const name = typeof prod === "object" && prod && "name" in prod ? prod.name : null;
  if (name && p.currency === "gbp" && p.recurring?.interval === "month") {
    byProductName.set(name, p);
  }
}

console.log("\n--- Vercel Production env vars (project: solvio) ---\n");

for (const plan of PLANS) {
  let price = byProductName.get(plan.name);
  if (price && price.unit_amount === plan.unitAmount) {
    console.log(`${plan.env}=${price.id}  # existing ${plan.name}`);
    continue;
  }
  const product = await stripe.products.create({
    name: plan.name,
    description: plan.description,
  });
  price = await stripe.prices.create({
    product: product.id,
    currency: "gbp",
    unit_amount: plan.unitAmount,
    recurring: { interval: "month" },
  });
  console.log(`${plan.env}=${price.id}  # created ${plan.name}`);
}

console.log("\nUpdate Vercel with:");
console.log("  printf '%s' 'price_...' | npx vercel env update STRIPE_PRICE_BOOKING production -y --sensitive");
console.log("  (repeat for PRO and SCALE, then npx vercel deploy --prod --yes)");
