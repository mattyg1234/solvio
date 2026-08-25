# Show Ops — central nervous system

**Status:** Spec for the product we are selling, not a fork of MHT  
**Last updated:** 2026-08-12  
**Design partner:** MHT (Joel Broad)  
**Product:** White-label ops desk inside Solvio — same binary, per-tenant config

## What “priceless” actually means

The office currently types the same reservation into bookings, office lists, bus lists, invoices, and a commercial sheet. That re-keying is the waste. The product is valuable when **humans type a booking once** and every other artefact is a view of that row.

A formidable system is not more screens. It is:

1. **One source of truth** — the booking.
2. **Home that tells you what to do before tonight’s show** — not a directory of links.
3. **Money that chases itself** — guest deposits by Stripe link; partner invoices stay tick-paid / Verifactu unless that tenant opts in.
4. **Lists and reports that cannot drift** — they are queries, not copies.
5. **It still works when the office is slammed** — print, roles, backup, Plan B.

## Anatomy (one codebase)

| System | Job | Lives in |
|--------|-----|----------|
| Sensory | Capture a reservation (office form now; website / voice later) | `/dashboard/show-ops/bookings` |
| Processing | Master data + auto totals, pickup, deposit vs invoice | `show_*` master tables + `calc.ts` |
| Motor | Office / bus / dietary lists, invoice packs, pay-link emails | lists, invoices, payments |
| Autonomic | Alerts: no bus ordered, capacity, overdue, Stripe not ready | **Home dashboard** |
| Memory | Commercial tracker, YoY, best/worst partners | reports (Joel sheet shape still pending) |
| Immune | RLS, roles, audit stamps, JSON export, Plan B | access + backup |

White-label is config, never a fork: islands vs regions, show vs trip, currency, modules, collection method, branding.

## Two pots of money (do not collapse)

| Pot | Who pays | MHT default | Other companies |
|-----|----------|-------------|-----------------|
| Guest deposit / balance | Guest | Cash/card **and** optional Stripe Checkout email | Stripe on if Connect is ready |
| Partner invoice pack | Tour op / agency | Verifactu number + tick paid. **No Stripe invoice.** | Optional pay-link against *our* invoice row later |

Stripe Collects against our row. It does not issue a second tax-invoice number.

Reuse the business’s existing Stripe Connect account (Dashboard → Payments). Do not make them connect twice.

## Flawless rules

- Totals, deposit, nett, pickup stop/time come from master data — never retyped.
- Office list / bus list / dietary / daily sales / invoice pack / reports are filters of `show_bookings`.
- Payment webhook is idempotent (`stripe_checkout_session_id` unique).
- Home answers: tonight’s pax, money outstanding, who is selling, what is broken.
- Year-on-year is empty until last season is imported — do not pretend otherwise.
- Bus remaining seats require a bus order. The system cannot invent a 55-seater.

## Out of scope until the desk is the daily habit

- Public website guest booking → Show Ops
- Verifactu API (store number/dates only)
- Partner Stripe pay-links (flag off)
- Extra BI charts beyond Joel’s sheet + best/worst
- Merging with venue `/book`

## Phases

| Phase | Ships | Status |
|-------|--------|--------|
| 0–4 | Master, bookings, lists, payments, invoices, first reports, backup | Live |
| **A** | Ops home + Stripe guest pay-links + currency | Built |
| **A2** | Seller portals: invite email, locked price, same questions, isolated RLS | Built |
| B | Commercial tracker mirrored to Joel’s Google Sheet + history import | Needs his sheet |
| B | Commercial tracker mirrored to Joel’s Google Sheet + history import | Needs his sheet |
| C | Partner pay-links (opt-in per tenant) | Later |
| D | Website / voice → same booking row | Later |
| E | Nightly off-site export + restore drill | Ops |

## Success

An office manager opens Show Ops in the morning and knows: tonight’s numbers, who still owes, which partners are hot or dead, and whether a bus is missing — without opening a spreadsheet.
