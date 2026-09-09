# MHT Hub — go-live checklist (target Monday 1 December 2026)

Status legend: ✅ done · 🟡 built, needs MHT input/acceptance · 🔴 not built · 👤 MHT/Jesus action

## A. Money & invoicing
- ✅ Imported paid balances preserved on every edit/door payment (opening-balance ledger rows).
- ✅ Payments are ledger-atomic; concurrent door payments cannot exceed the outstanding amount.
- ✅ Holded connected (test company) · packs → draft invoices · refresh/sync · reconcile · credit notes · expenses → purchases · P&L.
- 👤 MHT's own Holded on the Canary regime, IGIC taxes (sales + purchases), invoice series, digital certificate for Verifactu, v1 API key for Solvio. (Thursday asks)
- 👤 Approve the IGIC taxes in Solvio Settings on MHT's Holded; decide who approves drafts in Holded (Ruth).
- 🟡 Confirm the deposit rule: is the seller's collected deposit retained commission or remitted? Rounding unit? (blocks partner statements)
- 🟡 72 imported bookings show more paid than the price — Joel/Ruth to confirm credits vs Lanzasoft quirk.
- 🔴 Refund / correction flow for guest payments (Stripe) — only needed if guest Stripe links are enabled at launch.
- 🔴 Door "Undo cash/card" now blocks; finance correction screen for wrong door payments (currently: reverse in Holded/ledger by hand).
- 🔴 Verifactu for door sales (facturas simplificadas) — depends on Jesus's answer; if yes, needs a direct Verifactu API from Solvio, not Holded.

## B. Bookings, capacity, partners
- ✅ Partner links book through a capacity-checked database transaction (no overbooking).
- ✅ Page/action permissions enforced for staff logins.
- ✅ Booking reference clashes between desks retry with the next number; allocation failures no longer invent a series.
- 🟡 Rate cards (39 cards / 9,608 prices) are reference-only; pricing uses product price + partner %. Hide/label the selectors or wire the matrix (decision).
- 🟡 Editing a booking after a price change recalculates from current prices; agree "keep booked price vs re-quote".
- ✅ Seller / partner-link "send guest ticket" tickbox now sends (same as staff path).
- ✅ Quick pickup change refuses own-way/private bookings (use Edit booking so the price updates).
- ✅ Staff date picker pages booked dates; Door shows load errors instead of "everyone is in".
- ✅ QR scan refuses other nights' tickets, completes partial parties on a second scan, and is race-safe across phones. Still open: person-level (adult/child) partial attendance.
- 👤 Finish show start times (6/14 done). Add staff logins (Ruth finance, Lee door, office). Currently only Joel's owner login exists. Owners can now change a member's role and pages from Settings; untick Dashboard/Reports/Invoicing to hide money from a login.

## C. Cutover from Lanzasoft
- 👤 Freeze date + final export from Lanzasoft; Solvio re-import must INSERT bookings (never UPDATE balances — the ledger owns them now).
- 🟡 Cutover rehearsal on a copy in November; training session for Ruth/Lee/office.
- 🟡 Switch emails out of test mode (Settings) only at go-live; confirm sender domain and partner email addresses.
- 🟡 Drop the pre-release snapshot tables (`private.snap_20260909_*`) a week after go-live if not needed.

## D. Channels
- 🟡 GetYourGuide: the five supplier endpoints + reserve holds + product mapping are LIVE (first cut). Still needed: Vercel env (GYG_INBOUND_*/GYG_OUTBOUND_*/GYG_API_BASE), map MHT-ACE-TEST in Settings, time-period + GROUP shapes for certification, availability push from desk/cancel paths, portal self-test, production config, GYG review (2–6 weeks). Email-parser fallback if review slips.
- 👤 Who owns MHT's GetYourGuide supplier account; product list for mapping.

## E. Platform / hygiene
- 🟡 Holded v1 API keys are deprecated by Holded; port the client to the v2 API before Holded removes v1 (Bearer tokens, new paths).
- 🟡 Rotate every credential pasted into chat tonight (Holded v1 key "solvio test", the three V2 tokens are already disabled). Delete the two test Holded drafts (invoice 6aa1a5b9…, contact "SOLVIO TEST PARTNER SL") when done testing.
- 🟡 Migration history in Supabase carries tool-generated version numbers for tonight's releases; keep `supabase/migrations` as the source of truth.
- 🟡 Codex agents commit into the same working tree — one release owner at a time.
- 🟡 SHOW_OPS_SECRETS_KEY exists on Vercel (confirmed by "already exists"); losing it means re-pasting tokens, nothing else.
