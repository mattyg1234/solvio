# Pricing truth check — 10/11 September 2026

Read-only comparison of the imported Lanzasoft money (`show_bookings.total_cost` / `nett_total`, `legacy_id` set) against two candidate pricing rules, on every non-cancelled future booking (show date ≥ 1 Sept 2026) with money on it. Production project `aasfahcrdcoqxwnlkdnv`, tenant MHT.

## What the data says

| Bookings | n | "Master price + €10 bus" reproduces the total | Partner SALE rate card reproduces the total |
|---|---:|---:|---:|
| Deposit (guest pays) | 1,248 | **238 (19%)** | **1,232 (98.7%)** |
| Invoice (partner invoiced) | 449 | 440 (98%) | 440 (98%) |

Nett on invoice bookings: `round2(card price × partner %)` per head, then summed, matches **440 / 449**. Rounding the total instead of each head matches only 437 — Lanzasoft rounds per head, which is what `unitNett` already does.

The partner's INVOICE rate card (`show_suppliers.invoice_rate_id`) is not the truth: it matched only 382 / 449, because those prices are derived from the sale card and drift when the sale card is edited (GetYourGuide/Spanish Dave at €44 sell price but a €34.30 "invoice" row from the €49 price). The percentage on the partner record is what reproduces the invoices.

`tipo` (Lanzasoft rate-row type): every matched booking priced on tipo 1 (10 on tipo 2); no matched booking sat on a card with conflicting tipo prices. 91 of 437 (card, show, bus) groups in the whole matrix do carry different prices per tipo — those cards are not attached to any booking in the window. Rule adopted: prefer tipo 1, else the lowest tipo. Ask Ruth what tipo 0/2 mean on those 91 groups.

## The 9 invoice bookings that match neither rule

TFS First Excursions GM/OTA ×5 (€0.02–0.05 off: their nett is 67.5% rounded per head — the code already does this, the SQL rounded totals), ACE TUI ×1, ACE Travel ON ×1, TFS GYG ×3 and TFS Spanish Dave ×1: the last five carry a sell price that is neither the master price nor the current card row (€44 vs €49 for 2 MHT TFS; €54 vs €59 bus for 1 MHT ACE; €79 show-only). These look like card edits after the booking was taken. Imported rows keep their imported money regardless (reprice skips `legacy_id` rows), so nothing moves; they are the examples to put in front of Ruth.

## What changed in the code (same day)

- `src/lib/show-ops/rate-cards.ts` — reads the partner's sale card; `pickRatePrice` picks the (show, bus / no-bus) row, tipo 1 preferred.
- `computeBookingMoney` takes `rateCard` (card price replaces master price + supplement; infants stay on the master price) and `frozen` (an earlier snapshot whose unit prices, nett % and deposit % are reused).
- Wired into: desk create/edit, seller portal, partner link (and therefore GetYourGuide), the AI booking tool, reprice-after-price-change, and the invoice-pack fallback for rows without a snapshot. The booking form fetches the chosen partner's card and shows "Priced from rate card …" / "Prices kept from the original booking".
- Edit rule: same show + ticket type + partner + bus choice ⇒ prices frozen from the booking's snapshot, only pax multiply. Change any of those ⇒ repriced from the card (or master).
- Snapshot gains `price_source`, `rate_card {id,name,tipo}`, `frozen_from`.

Not changed: imported bookings' money (untouched), the invoice-rate cards (still reference only), the 34 desk bookings priced before today (their snapshots stand).

## Still to agree with Ruth

1. Deposit rounding for TFS/ACE (P3-09) — the card gives the price, the deposit % still comes from the partner record.
2. Whether a partner with no card row for a new show should be blocked or fall back to master price (today: falls back, and says so on the form).
3. Future-dated price changes (P2-05) — cards have no validity dates; a second card + switch on a date is the cheap answer.
