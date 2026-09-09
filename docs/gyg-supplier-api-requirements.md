# GetYourGuide Supplier API — what Solvio has to build

Source: Integrator Portal docs read 9 Sept 2026 (Supplier-side Endpoints, GetYourGuide Endpoints, Overview).
Account: "Solvio Systems LTD" (Reservation System). Test config registered: host www.solviosystems.com,
port 443, path /api/gyg/v1 → GYG will call `https://www.solviosystems.com/api/gyg/v1/1/<endpoint>` (the `/1/`
version segment is mandatory). Inbound Basic Auth user `solvio-gyg-test` (password in password manager).

## Non-negotiables from the spec
- HTTPS + JSON, `Content-Type: application/json`; **always HTTP 200**, errors go in the body as
  `{ "errorCode", "errorMessage" }`. Never both `data` and `errorCode`.
- HTTP Basic Auth both ways (Bearer/OAuth not accepted). One credential pair for the whole API, not per supplier.
- ISO 8601 datetimes in the **activity's local time with offset** (Canaries: `2026-12-05T19:00:00+00:00` in
  winter, `+01:00` in summer; UK legs: Europe/London). Non-ASCII names must round-trip.
- SLA: 99.8% uptime, reserve <3 s P95, book <4 s, get-availability (30+ days) <10 s, hard drop at 27 s.
  Error-rate caps: get-availability <0.01%, reserve <1%, book <0.5%.
- Because Solvio is a **multi-supplier reservation system**, certification requires support for BOTH
  individual and group pricing AND both time-point and time-period products (even though MHT only needs
  time-point individual). Minimum reserve hold 15 min, desired 60 min.

## Endpoints Solvio must host (all under /api/gyg/v1/1/…)
| Endpoint | Method | What Solvio does |
|---|---|---|
| `get-availabilities?productId&fromDateTime&toDateTime` | GET | For each show night of the mapped product in range: `dateTime` (19:00 local), `vacancies` = capacity − booked pax (or 0), `cutoffSeconds`, optional prices per category. Empty array when nothing. Up to 365 days ahead. Called constantly; must be fast (index by product+date). |
| `reserve` | POST | Hold `bookingItems` (ADULT/CHILD/INFANT counts) for a `dateTime`; return `reservationReference` + `reservationExpiration` (60 min). Errors: `NO_AVAILABILITY`, `INVALID_TICKET_CATEGORY`, `INVALID_PARTICIPANTS_CONFIGURATION`. Needs a **seat-hold table** counted in capacity. |
| `cancel-reservation` | POST | Release the hold. `{ "data": {} }`. |
| `book` | POST | Confirm a reservation → create the Solvio booking (guest from `travelers[0]`, channel = GetYourGuide, supplier = the GYG partner, pickup from `comment`/pick-up block if present, `retailPrice` per category stored). Return `bookingReference` (our MHT ref) + one **ticket per person** (`ticketCode`, `QR_CODE`) — reuse the guest ticket token. **Idempotent on `gygBookingReference`**: a retry must return the same booking, not a duplicate (GYG retries up to 10× every 10 min). Booking-change flow: same GYG ref with new details ⇒ new booking, then they cancel the old one. |
| `cancel-booking` | POST | Cancel the Solvio booking (reason "GetYourGuide"), free seats. May refuse with `BOOKING_REDEEMED` / `BOOKING_IN_PAST` / `BOOKING_ALREADY_CANCELLED`. |
Optional (skip for certification): pricing-categories, products list/details, addons, tiered pricing, notify webhook.

## Endpoint Solvio must call (GYG side, Basic Auth with the `SolvioSystemsLTD` credentials)
- `POST https://supplier-api.getyourguide.com/1/notify-availability-update` (their spec defines ONE host — there is no sandbox; unknown/unconnected product ids answer 400 INVALID_PRODUCT, which Solvio records as `not-connected`) —
  push `{ productId, availabilities: [{ dateTime, vacancies }] }` **only** when a night sells out, reopens,
  or a high-demand night drops below 7 seats within 60 days. Not for GYG's own bookings. 202 = accepted;
  1000 req / 10 min limit. Fire from every place capacity changes in Solvio (desk/partner/link create,
  cancel, pax edit, night close, bus order change) — a missed hook = overselling.
- Optional: `redeem-ticket` / `redeem-booking` when the door scans a GYG guest.

## Data model additions
- `show_channel_products` — maps GYG `productId` (we choose the string, ≤255 chars, no `%`) → workspace,
  show product, ticket type, pricing category → adult/child/infant, partner (the GYG supplier row), default pickup.
- `show_seat_holds` — reservationReference, product, show_date, counts, expires_at, gyg ref; counted as
  booked pax in capacity checks and the partner-safety trigger; purged after expiry.
- `show_bookings.channel_ref` (gygBookingReference, unique per business) + `channel = 'getyourguide'`.
- Basic-auth credentials for inbound calls in env (`GYG_INBOUND_BASIC_USER/PASSWORD`), outbound in env.

## Test plan (portal "Self-testing tool")
Product ID registered: **MHT-ACE-TEST**, time point, price per individual, availability only,
Atlantic/Canary, dates 2026-11-01 → 2027-03-31 with ≥2 time slots — **passed 23/23 (run 96279, 9 Sept 2026)**.
The tool lists all four shapes; as a reservation system we must pass time-period and GROUP too. Each mapped
product now carries `availability_type` (time_point | time_period → `dateTime` at 00:00 + `openingTimes`
from the show time for `period_minutes`) and `pricing_type` (individual | group → vacancies in whole groups
of `group_size`; GROUP items book `groupSize` seats each as adults). Self-test mappings on MHT's workspace,
all pointing at 1 MHT ACE under the ACE GetYourGuide partner: `MHT-ACE-TEST-PERIOD` (time period, per person)
and `MHT-ACE-TEST-GROUP` (time point, groups of 10). Register each in the portal test configuration with the
matching type and run the suite per product.

## Estimate (build, with Claude)
| Piece | Hours |
|---|---|
| Basic-auth middleware + 200-with-error envelope + request logging | 2 |
| Product mapping table + settings UI to map GYG product ↔ show/ticket/partner | 4–6 |
| get-availabilities (capacity − booked − holds, per night, time-point + time-period + group shapes) | 4–6 |
| reserve / cancel-reservation with seat-hold table and capacity integration | 4–6 |
| book (idempotent, tickets per person, pickup parsing) / cancel-booking | 5–7 |
| notify-availability-update client + hooks at every capacity change | 4–6 |
| Self-test tool green for all four types, then production config + review | 4–6 |
| **Total hands-on** | **27–39 h** |
Calendar: GetYourGuide's manual review typically 2–6 weeks after the self-test passes. Start early October
to have a chance of being live for 1 December; the email-parser fallback stays in the drawer if review slips.

## Implemented 9 Sept 2026 (first cut)
- Routes: `/api/gyg/v1/1/get-availabilities` (GET), `/reserve`, `/cancel-reservation`, `/book`, `/cancel-booking` (POST).
  Always HTTP 200; `{ data }` or `{ errorCode, errorMessage }`. Basic Auth against `GYG_INBOUND_BASIC_USER/PASSWORD`.
  `skipTrailingSlashRedirect` so GYG's trailing-slash URLs are not answered with a 308.
- Mapping: Settings → "GetYourGuide products" (`show_channel_products`): GYG product id → show + partner (the
  GetYourGuide partner for that island: pricing, nett, invoicing) + pickup kind + cut-off.
- Availability = product weekday pattern ∪ nights with bookings, minus full closes; vacancies = capacity − booked − live holds.
- Reserve → `show_seat_holds` (60 min). Book → the capacity-checked partner-link transaction under the GYG partner,
  stamped `channel=getyourguide`, `channel_ref=gygBookingReference` (unique ⇒ retries return the same booking; changed
  details ⇒ new booking per the booking-change flow). One COLLECTIVE QR ticket (the guest ticket URL).
- Cancel-booking honours BOOKING_IN_PAST / BOOKING_REDEEMED / BOOKING_ALREADY_CANCELLED.
- Availability push (`notify-availability-update`) fires after channel bookings/cancellations when
  `GYG_OUTBOUND_BASIC_USER/PASSWORD` are set. Push policy (per their spec) lives in `shouldPushAvailability`: sold out, back on sale, or < 7 seats changing inside 60 days; the last figure per product/night is kept in `show_channel_availability_pushes`. Office paths that push: desk create/edit/cancel, partner-link and seller bookings, night close (full) and reopen, plus the GYG reserve/book/cancel handlers.
  **Not yet wired** into desk/partner-link/cancel/close paths — that is the next step.

### Vercel env to add before the self-test
`GYG_INBOUND_BASIC_USER=solvio-gyg-test`, `GYG_INBOUND_BASIC_PASSWORD=<the password entered in the Integrator Portal test config>`,
`GYG_OUTBOUND_BASIC_USER=SolvioSystemsLTD`, `GYG_OUTBOUND_BASIC_PASSWORD=<from the portal "GetYourGuide Credentials">`,
`GYG_API_BASE` is no longer read (the host is fixed); the variable can be deleted from Vercel.

### Still to do for certification
Time-period and GROUP product shapes (required of multi-supplier systems), price-over-API (optional),
availability push from every capacity-changing path, product mapping for the self-test product `MHT-ACE-TEST`,
then the portal self-test until all rows are green.
