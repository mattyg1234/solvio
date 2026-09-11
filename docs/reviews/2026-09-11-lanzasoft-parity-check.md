# Lanzasoft parity check — 11 September 2026

Read-only comparison of the live Lanzasoft app (http://mhtapp.lanzasoft.com, AngularJS, JSON endpoints /shows /touroperators /hotels /busstops /timetables /excursionrates /rates /bookings /bookings/{id} /payments?booking= /invoices /weeklyoutlook /nationalities) against Solvio production (tenant MHT). Nothing was changed in either system.

## Reference data

| Set | Lanzasoft | Solvio | Verdict |
|---|---:|---:|---|
| Shows | 21 (11 are "OLD RATE EXPIRED / NOT USED" junk) | 14 (10 real + **4 demo products with no legacy id**) | Remove the demo shows (UK Theatre Package, Desert Dinner Experience, Siam Park Evening, Volcano Night Show — 3 are active). Import show 24 "Show Only TFS 2026" (Tenerife, 500) — missing. Fix island on DUBLIN WEB 2026 and "€ 2026 Tour IN RESORT UK BELFAST" (ours says Lanzarote, Lanzasoft says UK). |
| Partners | 553 (81 archived, 472 active) | 470 (468 with legacy id + Test Matty + Matthew Gales) | Matches the active set. Archived partners were not imported — fine, but bookings that pointed at them are the 7 with no supplier. 2 duplicate names to merge. |
| Hotels | 1,212 | 1,213 (4 without legacy id) | OK; check the 4 extras are not demo rows. |
| Bus stops | 323 | 327 (5 without legacy id: Pueblo Marinero, Biosfera Plaza, Centro Comercial, Safari Centre, Alborada) | Demo rows — delete if no booking uses them. |
| Timetables | 418 | 418 | Match. |
| Rate cards / prices | 39 / 9,608 | 39 / 9,608 | Match. |
| Nationalities | 15 | column exists on bookings | OK. |

## Bookings

- **Lanzasoft is still live.** Latest Lanzasoft ref is 319663 (created 11 Sept 18:10 by "Jay"); our import stops at legacy 319324. About **340 bookings made in Lanzasoft since 5 Sept are not in Solvio**, plus every edit and cancellation on older ones (each row carries `lastupdate`/`updateuser`, so a delta sync is possible).
- **Reference clash:** Solvio's own bookings have used refs 319329–319358, which Lanzasoft has since also issued. Before cutover the ref counter must be moved above Lanzasoft's final number, and our 34 desk bookings (all test) deleted or renumbered.
- **Duplicates:** 179 groups of same surname + date + show + pax, 18 of them in the future. Every group has distinct legacy ids, so they exist in Lanzasoft too (mostly UK TOUR with different ticket numbers, e.g. Wilson 7 Oct ×3, Hoggarth 11 Sept GYG ×2). Not an import artefact — a list for Ruth to confirm or cancel.
- 7 legacy bookings have no partner, 5 no show (they pointed at archived partners / junk shows).
- Fields Lanzasoft holds that Solvio also has: nationality, room, language, legacy status (Open 8,218 / Invoiced 7,814), created-by name. Fields we do not carry: `Rep`, `OfficePerson`, `Not_on_Board`, `Guides`, `BEP`, `Tipo` (rate row type on the booking), and the per-booking **payments list** (`/payments?booking=`) beyond the opening balance.
- Lanzasoft invoices: numbered series 2026-NNNN (latest 2026-2955, 31 Aug). Solvio has 43 invoices, none imported — opening outstanding invoices (P4-33) still need a source.

## Screens Lanzasoft has

Bookings (last 50 + search), Weekly Outlook (**per resort zone — Playa Blanca / Puerto del Carmen / Costa Teguise — with Bus vs Direct columns**), Invoices, Reports (Office List, Bus List, Expanded Office List, Invoice List), Routes (empty), Shows, Partners, Rates, Hotels, Bus Stops. Booking detail: date, name, nationality, phone, email, dietary, hotel + room, bus stop + pickup time + "No Pick-up", adults/children/infants, partner, show, ticket no., total / paid / pending with a "+" to add a payment, details, notes, created/updated by.

Solvio covers all of it except: the per-zone Bus/Direct outlook split (ours is per island), and payments as a list on the booking (ours is a ledger, but the detail screen shows totals only).

## Why Lanzasoft feels instant

Measured in the same browser, same afternoon:

| | First load | Every page after |
|---|---:|---:|
| Lanzasoft | TTFB 69 ms, interactive 0.25 s, loaded 1.0 s | ~0 s — a single-page app that loads hotels, stops, partners, shows, timetables and rates once (four small JSON calls) and filters in memory; bookings list is "last 50" |
| Solvio Calendar | interactive 0.8 s, loaded 1.3 s | full server round trip each click |
| Solvio Partners | interactive 0.2 s, loaded 0.6 s | |
| Solvio Outlook | interactive 0.8 s, loaded 1.1 s | |
| **Solvio Bookings** | **HTML 1,955 KB, interactive 1.1 s, loaded 2.9–7.3 s** | |

Vercel (dub1) and Supabase (eu-west-1) are co-located; the database is not the bottleneck. The Bookings page is: it server-renders 270 rows and serialises the whole form reference set (1,213 hotels, 327 stops, 470 partners, products with ticket types and extras) into a 2 MB page on every visit. Fixes, in order: paginate/virtualise the bookings list (default "last 50" like Lanzasoft), load hotel/stop/partner options lazily (search-as-you-type), cache reference data client-side across navigations, and prefetch the sidebar routes. Target: every page under 1 s, Bookings under 1.5 s.
