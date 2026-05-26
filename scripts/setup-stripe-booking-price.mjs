#!/usr/bin/env node
/**
 * Create (or reuse) Stripe Product + £50/mo GBP Price for Solvio Booking.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_… node scripts/setup-stripe-booking-price.mjs
 *   vercel env run --environment production -- node scripts/setup-stripe-booking-price.mjs
 *
 * Then add the printed price id to Vercel:
 *   vercel env add STRIPE_PRICE_BOOKING production
 */
import Stripe from "stripe";

const PRODUCT_NAME = "Solvio Booking";
const LAUNCH_AMOUNT_GBP = 5000; // £50.00

const sk = process.env.STRIPE_SECRET_KEY?.trim();
if (!sk) {
  console.error("Missing STRIPE_SECRET_KEY. Export it or run via `vercel env run --environment production --`.");
  process.exit(1);
}

const stripe = new Stripe(sk);

function matchesBookingPrice(price) {
  return (
    price.active &&
    price.currency === "gbp" &&
    price.type === "recurring" &&
    price.recurring?.interval === "month" &&
    price.unit_amount === LAUNCH_AMOUNT_GBP
  );
}

const products = await stripe.products.list({ active: true, limit: 100 });
let product = products.data.find((p) => p.name === PRODUCT_NAME);

if (!product) {
  product = await stripe.products.create({
    name: PRODUCT_NAME,
    description: "Solvio Booking — public /book pages, operations hub, Stripe Connect deposits. Launch pricing £50/mo.",
    metadata: { solvio_plan_tier: "booking" },
  });
  console.log("Created product:", product.id);
} else {
  console.log("Using existing product:", product.id);
}

const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
let price = prices.data.find(matchesBookingPrice);

if (!price) {
  price = await stripe.prices.create({
    product: product.id,
    currency: "gbp",
    unit_amount: LAUNCH_AMOUNT_GBP,
    recurring: { interval: "month" },
    metadata: { solvio_plan_tier: "booking", launch_pricing: "50_gbp" },
  });
  console.log("Created price:", price.id);
} else {
  console.log("Using existing price:", price.id);
}

console.log("");
console.log("Add to Vercel Production:");
console.log(`  STRIPE_PRICE_BOOKING=${price.id}`);
console.log("");
console.log("CLI:");
console.log(`  printf '%s' '${price.id}' | vercel env add STRIPE_PRICE_BOOKING production`);
