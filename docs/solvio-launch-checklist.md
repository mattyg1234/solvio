# Solvio launch checklist

**Goal:** Take money from the first 5–50 venues on **Booking** at **£50/mo launch pricing**, with deposits and email confirmations working on production.

**Live app:** https://www.solviosystems.com

**Pricing (current):**

| Tier | Price |
|------|-------|
| **Booking** | **£50/mo** (7-day trial) |
| Pro | £150/mo |
| Scale | £499/mo |

Stripe must use a **£50/month Price ID** in `STRIPE_PRICE_BOOKING` — the dashboard display alone does not change what Stripe charges.

---

## How to use this doc

Work **top to bottom**. Do not skip to sales until **Phase C** (end-to-end test) passes on production.

**Gates:**

| Gate | Requires |
|------|----------|
| Demo to friends | A + B1 |
| First paid pilot (£50) | A + B + C |
| Self-serve signup | D + 3 happy pilots |
| Pro / voice sales | Phase G |

---

## Phase 0 — Positioning (30 min)

- [ ] **Sell Booking only** for the next 30 days — not Pro, not Scale
- [ ] **Promise:** `/book/[slug]`, operations hub, Stripe deposits, guest email
- [ ] **Do not promise:** paid event ticket checkout (enquiries only), password reset, SMS (unless Twilio wired)
- [ ] **Launch price:** £50/mo for first 50 venues — then £89/mo
- [ ] **First targets:** 1 bar, 1 restaurant, 1 salon you can onboard on a call

---

## Phase A — Infrastructure (BLOCKING — start here)

### A1. Confirm the correct Supabase project

Solvio project ref: **`aasfahcrdcoqxwnlkdnv`** (separate from Tipsi `muzonmhumkzxwivzmzgx`).

- [x] `NEXT_PUBLIC_SUPABASE_URL` → `https://aasfahcrdcoqxwnlkdnv.supabase.co` (local + prod booking page works)
- [x] Solvio tables present: `booking_requests`, `business_events`, `floor_plan_tables`, RPCs `get_booking_public_context` + `submit_booking_request`
- [ ] **MCP note:** Cursor Supabase MCP may still connect to Tipsi — use Dashboard or pooler CLI against `aasfahcrdcoqxwnlkdnv` for Solvio DB work

### A2. Apply all migrations (37 files)

Local list: `supabase/migrations/` (run in filename order).

**Option A — CLI (recommended):**

```bash
cd Village/sites/solvio
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

**Option B — Dashboard SQL Editor:** paste and run each file in order (see `scripts/list-migrations.sh`).

- [x] All **37** migrations applied on `aasfahcrdcoqxwnlkdnv` (verified via pooler)
- [x] `businesses.subscription_tier` allows `'booking'`
- [x] RPC `get_booking_public_context` exists

**Migration files (in order):**

1. `20260203180000_accounts_profiles_businesses.sql`
2. `20260518120000_booking_slug_and_requests.sql`
3. `20260519100000_dashboard_setup_fields.sql`
4. `20260520120000_booking_messages.sql`
5. `20260521100000_booking_intake_columns_and_rpc.sql`
6. `20260523120000_booking_inventory_voice_prompts.sql`
7. `20260524100000_booking_public_context_rpc.sql`
8. `20260525100000_venue_calendar_bookings.sql`
9. `20260526120000_booking_completeness.sql`
10. `20260527140000_platform_onboarding_wizard.sql`
11. `20260528100000_booking_exceptions_public_slots.sql`
12. `20260530200000_booking_public_event_recurrence.sql`
13. `20260531203000_booking_public_recurring_events_visible.sql`
14. `20260532200000_floor_plan_table_week_hours.sql`
15. `20260540210000_floor_plan_table_shape_fill.sql`
16. `20260550210000_stripe_connect_and_booking_payments.sql`
17. `20260550310000_booking_flow_hosted_events_kind.sql`
18. `20260550400000_backfill_booking_slugs_and_staff_public.sql`
19. `20260601100000_per_tenant_pricing_and_voice_logs.sql`
20. `20260601200000_event_capacity.sql`
21. `20260601300000_event_custom_questions.sql`
22. `20260601400000_event_ticket_price_and_visibility.sql`
23. `20260602100000_voice_campaigns.sql`
24. `20260603100000_business_phone_numbers.sql`
25. `20260603200000_solvio_llm_usage.sql`
26. `20260603300000_appointment_deposit.sql`
27. `20260621180000_repair_event_custom_questions.sql`
28. `20260622100000_venue_calendar_booking_comms.sql`
29. `20260622200000_campaign_lead_intake.sql`
30. `20260622210000_campaign_lead_owner_qualification.sql`
31. `20260623100000_stripe_customer_id.sql`
32. `20260623200000_booking_tier.sql`
33. `20260623400000_appointment_breaks.sql`
34. `20260623500000_booking_staff_member.sql`
35. `20260623600000_appointment_services.sql`
36. `20260623610000_booking_context_services.sql`
37. `20260625100000_restore_public_grants.sql`

### A3. Supabase Auth URLs

In Supabase → Authentication → URL Configuration (`aasfahcrdcoqxwnlkdnv`):

- [ ] Site URL = `https://www.solviosystems.com`
- [ ] Redirect URLs include `https://www.solviosystems.com/auth/callback`
- [ ] Localhost callback kept for dev

### A4. Vercel production

- [x] `npm run build` passes
- [x] Production deploy green (`www.solviosystems.com`)
- [x] `NEXT_PUBLIC_SITE_URL` = `https://www.solviosystems.com`

---

## Phase B — Production environment variables

Set in **Vercel → Production**. See `.env.example` for full list.

### B1. Core (required)

- [x] `NEXT_PUBLIC_SUPABASE_URL`
- [x] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [x] `SUPABASE_SERVICE_ROLE_KEY`
- [x] `NEXT_PUBLIC_SITE_URL`

### B2. Stripe — merchant subscriptions (required for £50/mo)

- [x] `STRIPE_SECRET_KEY` (live, TbSEy account)
- [x] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- [x] `STRIPE_PRICE_BOOKING` → `price_1TbSzTEMUQyVybDTV7fNLFlj` (£50/mo GBP)
- [x] Webhook `https://www.solviosystems.com/api/webhooks/stripe`
- [x] `STRIPE_WEBHOOK_SECRET` + `STRIPE_WEBHOOK_SECRET_CONNECT`
- [ ] Test: Plans → **Start with Booking** → pay £50 → `subscription_tier = booking`

### B3. Stripe Connect — guest deposits

- [x] Connect enabled on platform account (mattygale2023 / TbSEy)
- [ ] Merchant completes Connect in Dashboard → Payments (you — confirm charges enabled)
- [ ] Test guest deposit on `/book/[slug]`

### B4. Guest email

- [x] `SOLVIO_RESEND_API_KEY` on Vercel Production
- [x] `SOLVIO_MAIL_FROM` = `Solvio <bookings@solviosystems.com>`
- [ ] Test confirmation email on booking submit (you)

### B5. Recommended

- [x] `BOOKING_RATE_SALT` (set on Vercel Production)

### B6. Defer until Pro sales

- Vapi, ElevenLabs, Twilio SMS, campaign bundle prices

---

## Phase C — End-to-end production test

Run on **production** before any sale.

### Merchant

- [ ] Signup → onboarding wizard
- [ ] Launch checklist: booking flow + Stripe Connect + publish slug
- [ ] Add inventory (table / event / appointment)
- [ ] Pay **£50 Booking** subscription

### Guest

- [ ] `/book/[slug]` on mobile — table + event flows
- [ ] Show night blocks free table booking
- [ ] Deposit checkout (if enabled)
- [ ] Confirmation email received

### Merchant after

- [ ] Booking in dashboard
- [ ] Cancel one event night + reason on public page

---

## Phase D — Legal & trust

- [ ] Privacy policy + terms (footer links)
- [ ] Honest scope: event tickets = enquiry only today
- [ ] Password reset: implement or “email support@…”
- [ ] One live demo slug on homepage

---

## Phase E — Merchant onboarding call (30–45 min)

1. Signup / handover account  
2. Onboarding wizard  
3. Setup bookings + inventory  
4. Stripe Connect on their phone  
5. Set slug + test guest booking together  
6. **£50/mo subscription** (or invoice week 1)  
7. Share link + QR  
8. 7-day check-in  

**Handout:**

```text
Your link: https://YOUR_DOMAIN/book/THEIR-SLUG
Share on Google + Instagram. Deposits need Stripe Connect (done).
Support: YOUR_EMAIL
```

---

## Phase F — First 5 sales

### Outreach (WhatsApp)

```text
Hey [Name] — I've built Solvio: a booking link for bars/restaurants/salons
(table requests, hosted events, Stripe deposits). One dashboard.

Launch offer: £50/mo for the first 50 venues (then £89). ~30 mins to go live.
Want a 15-min demo on your phone?
```

### Close criteria per pilot

- [ ] Live `/book/slug`
- [ ] ≥1 real or test booking
- [ ] £50 subscription active
- [ ] Screenshot for social proof

---

## Phase G — Pro tier (after 3 Booking customers)

- [ ] Wire Vapi + ElevenLabs env
- [ ] Voice setup + phone number
- [ ] Sell Pro £200 with white-glove install

---

## Known limitations (do not oversell)

| Feature | Status |
|---------|--------|
| Paid event ticket checkout on public page | Not built — enquiries only |
| Password reset | Coming soon |
| SMS confirmations | Needs Twilio |
| Self-serve Pro voice | Needs hand-holding |

---

## This week (if you only do 5 things)

1. [x] **A1–A2:** Solvio Supabase + migrations  
2. [x] **B2:** Stripe £50/mo + webhooks on Vercel  
3. [x] **B4:** Resend API key on Vercel  
4. [ ] **Phase C:** Full prod test yourself (guest book + email + £50 sub + deposit)  
5. [ ] Book **3 demo calls**  

## Optional DB migration

If selling **appointment** slot picker on prod, apply:

```bash
supabase login && supabase link --project-ref aasfahcrdcoqxwnlkdnv && supabase db push
```

File: `20260623700000_appointment_public_booked_slots.sql`

---

## Related

- Product spec: `docs/superpowers/specs/2026-05-19-solvio-booking-domain-design.md`
- Agent guide: `AGENTS.md`
- Migration list script: `scripts/list-migrations.sh`
