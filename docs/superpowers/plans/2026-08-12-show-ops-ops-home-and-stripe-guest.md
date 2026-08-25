# Show Ops Phase A — Ops home + Stripe guest links

> **For agentic workers:** Execute inline in this session (user said “let’s go”). Subagent-driven-development optional for later phases.

**Goal:** Home is an ops board (tonight, money, movers, alerts). Office can email a Stripe Checkout link for unpaid guest deposits; webhook marks the booking paid without double-counting.

**Architecture:** Pure aggregations in `src/lib/show-ops/dashboard.ts`. Checkout on the connected Stripe account (same pattern as venue deposits). Webhook keys off `metadata.solvio_kind = show_ops_deposit`. Collection and currency live on `show_ops_config`.

**Tech Stack:** Next.js App Router, Supabase, Stripe Checkout Sessions (Connect direct charges), Resend.

---

### Files

- Create: `src/lib/show-ops/dashboard.ts`
- Create: `src/lib/show-ops/deposit-checkout.ts`
- Create: `src/lib/notifications/show-ops-emails.ts`
- Create: `src/app/pay/show-ops/success/page.tsx`
- Create: `src/app/pay/show-ops/cancel/page.tsx`
- Create: `supabase/migrations/20260812120000_show_ops_stripe_payments.sql`
- Modify: `src/app/dashboard/show-ops/page.tsx` (ops board)
- Modify: `src/app/dashboard/show-ops/payments/page.tsx` + `actions.ts` (send link)
- Modify: `src/app/api/webhooks/stripe/route.ts`
- Modify: `src/lib/show-ops/types.ts`, `config.ts`, `calc.ts`, `access.ts`
- Modify: `src/app/dashboard/show-ops/settings/page.tsx`

No unit-test runner in this repo. Keep aggregations and payment-status math in pure functions. Verify with `npx tsc --noEmit` and `npm run lint`.

### Task 1: Config — currency + guest Stripe flag

- [ ] Add `currency`, `guest_stripe_enabled`, `partner_stripe_enabled` to `ShowOpsConfig`
- [ ] Parse in `parseShowOpsConfig`; MHT seed `eur` + guest on; generic seed `gbp` + guest on; partner always off
- [ ] `formatShowOpsMoney(amount, currency)` in `calc.ts`
- [ ] Settings form fields + persist in `updateShowOpsOpsConfigAction`

### Task 2: Migration — Stripe payment rows

```sql
alter table public.show_booking_payments
  drop constraint if exists show_booking_payments_method_check;

alter table public.show_booking_payments
  add constraint show_booking_payments_method_check
  check (method in ('cash', 'card', 'transfer', 'stripe', 'other'));

alter table public.show_booking_payments
  add column if not exists stripe_checkout_session_id text;

create unique index if not exists show_booking_payments_stripe_session_uidx
  on public.show_booking_payments (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
```

Apply to Solvio project `aasfahcrdcoqxwnlkdnv`.

### Task 3: Ops home

Home queries today’s bookings, unpaid deposit balances, overdue invoices, this week’s partner pax, today’s bus orders. Render four strips + alert list. Deep links stay in the nav.

### Task 4: Checkout + email + webhook

- Create Checkout Session on Connect account; metadata `solvio_kind=show_ops_deposit`, `solvio_show_booking_id`, `solvio_business_id`
- Omit `payment_method_types` (Stripe dynamic methods)
- Application fee from `platform_fee_bps` (same as venue deposits)
- Email guest the session URL via Resend
- Webhook: if session already recorded, return; else insert `method=stripe` and recompute `balance_remaining` / `payment_status`
- Guest success/cancel pages under `/pay/show-ops/`

### Task 5: Payments UI

Keep cash/card/transfer. If Connect charges enabled and `guest_stripe_enabled` and guest has email, show **Email payment link**. If Stripe not connected, one line pointing to Dashboard → Payments.
