# Solvio booking domain design

**Status:** Accepted (living document)  
**Last updated:** 2026-05-19  
**Scope:** Public booking page, merchant bookings inventory, hosted events, tables, voice-facing cancellation data

## Problem

Venues run **hosted shows** (Events) and **regular table seating** (Tables) on the same public link. Guests must not bypass show ticketing by submitting a free table request on a show night. Merchants must cancel individual show dates with optional reasons that reach guests and voice reception.

## Users

| Actor | Goal |
|-------|------|
| Guest | Clear path: Events vs Tables; book shows on correct nights only |
| Merchant | Manage series calendar, cancel one night with reason, floor plan tables |
| Voice AI | Read cancellation reasons from same data as booking page |

## Guest modes (public link)

Configured per business in `booking_flow_details.guest_booking_modes`:

- **Events** — hosted listings with recurrence
- **Tables** — seating enquiries, optional table + floor preview
- **Appointments** — weekly hours → discrete slots
- **Walk-in** — waitlist-style enquiry

Public URL: `/book/[slug]` (e.g. `solviobusiness-8e193173` on `solvio-roan.vercel.app`).

## Events flow (guest)

1. Choose **Events** (large mode card if multiple modes enabled).
2. Select hosted listing from dropdown.
3. **Purple calendar** — only bookable occurrences (`!skipped`, future).
4. **Rose strikethrough** — cancelled nights; reason listed below calendar.
5. Party size + contact → submit.

Validation: `validateHostedEventSubmission` requires `hosted_event_id`, calendar `hosted_occurrence_starts_at`, matching `requested_date`.

## Tables flow (guest)

1. Choose **Tables**.
2. Pick evening (date input).
3. If date has an **upcoming hosted show** → block with message + **Book via Events instead** (when Events mode enabled). Hide table picker; disable submit.
4. Optional table selection + floor layout preview.
5. Submit → `validateTableBookingSubmission` enforces same rules server-side.

**Rule:** Table blocking on show nights is **always on** (not optional merchant policy).

## Merchant: cancel one night

In **Event series calendar** (sheet on `booking-operations-hub`):

- Label: **Cancel this day's event**
- Optional **Reason** field
- Helper: *This will inform customers why it's been cancelled through your AI voice assistant and on the booking page.*
- Reinstate: **Reinstate this night**

### Data model

Stored on `business_events.recurrence`:

```json
{
  "cancelled_occurrences": [
    { "date": "2026-05-20", "reason": "Artist unavailable" }
  ]
}
```

Legacy `skipped_dates: ["2026-05-20"]` still read; new writes use `cancelled_occurrences`.

Occurrence expansion attaches `skipped: true` and `cancellation_reason` on `ExpandedOccurrence`.

Whole-listing cancel remains `business_events.cancelled_at` + `cancellation_reason` column.

## Public booking UI principles

- Numbered steps (`FormSection`), minimal copy
- White card on soft gradient; violet brand accents
- Remove duplicate info panels; one clear path per mode
- Success state: “Request received”

## Dashboard bookings

- **Command center** tiles for find vs create inventory (not marketing fluff)
- **Operations hub** for events, tables, appointment hours, exceptions
- Event recurrence: once / daily / weekly + weekday chips

## Voice integration

No separate cancel table — voice reads `business_events` + `recurrence.cancelled_occurrences` (same source as public RPC). Optional reasons must be plain language suitable for phone scripts.

## Verification

- Lint passes
- Browser: Tables + show date → block; Events → purple only; cancelled → rose + reason
- Server rejects forged POST for blocked combinations

## Out of scope (future)

- Per-table rotation on floor plan (migration started for shape/fill)
- Auto-sync Vapi assistant prompt on cancel (manual/scripted read from DB today)
- Paid event checkout on public page (requests only today)

## Related agent artifacts

- Skill: `.cursor/skills/solvio-booking/SKILL.md`
- Reference: `.cursor/skills/solvio-booking/reference.md`
- Deploy rule: `.cursor/rules/git-commit-deploy-proactive.mdc`
