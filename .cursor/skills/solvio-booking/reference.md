# Solvio booking — reference

## Repo layout

```
src/app/book/[slug]/
  page.tsx                 # Loads RPC context, wraps public form
  booking-public-form.tsx  # Guest UX (modes, steps, validation state)
  event-occurrence-calendar.tsx
  actions.ts               # submit_booking_request + server validation

src/app/dashboard/bookings/
  page.tsx                 # Command center + hub
  inventory-actions.ts     # CRUD: events, tables, hours, cancel night
  actions.ts               # Inbox / messaging

src/components/dashboard/
  booking-operations-hub.tsx      # Events, tables, appointments inventory
  event-series-calendar-sheet.tsx # Per-night cancel + timing overrides
  bookings-command-center.tsx
  appointment-exception-grid.tsx

src/lib/
  booking-public-context.ts   # Parse get_booking_public_context JSON
  booking-guest-modes.ts
  booking-table-rules.ts      # Table vs hosted-night blocking
  booking-hosted-submit.ts    # Event submit validation + expansion
  business-event-occurrences.ts
  floor-plan-visuals.ts
  booking-appointment-slots.ts
```

## Supabase

- **RPC (public):** `get_booking_public_context(p_slug)` — events include full `recurrence` blob
- **RPC (submit):** `submit_booking_request` — called from `actions.ts`
- **Table:** `business_events` — `recurrence jsonb`, `cancelled_at`, `cancellation_reason` (whole listing)
- **Migrations:** `supabase/migrations/*booking*` — keep RPC in sync when adding public fields

## Environment / deploy

- Marketing/prod example: `https://solvio-roan.vercel.app`
- Test booking slug used in dev: `solviobusiness-8e193173`
- Local env: `.env.local` (never commit) — `NEXT_PUBLIC_SUPABASE_*` for RPC smoke tests

## UI tokens (public booking)

- Page: soft gradient background, white card `max-w-lg`, rounded `[28px]`
- Primary: `#7c3aed`, surfaces `#f5f3ff`, borders `#ebe7f7`
- Bookable event dates: purple gradient cells
- Cancelled event dates: rose `#rose-50`, strikethrough, disabled
- Table blocked by show: purple banner + “Book via Events instead”

## Merchant copy patterns

- Event series calendar: **“Cancel this day’s event”** + optional reason + voice/booking page helper text
- Whole listing: **“Cancel entire listing”** (sets `cancelled_at` on row)
- Hub: distinguish **night cancel** (recurrence) vs **listing cancel** vs **delete**

## Common pitfalls

| Mistake | Fix |
|---------|-----|
| Table bookable on show night | Use `datesWithUpcomingHostedOccurrences` + always-on block |
| `browser_fill` on date input doesn’t update React state | `onChange` + `onBlur` on `requested_date` |
| Cancelled nights still purple/bookable | Pass `expandHostedEventOccurrences` to calendar; filter `!skipped` only on submit |
| Policy flag `block_public_table_when_hosted_event_date` treated as sole gate | Blocking is always-on; policy UI may be redundant |
| Skipped_dates-only writes | Write `cancelled_occurrences` via `cancelEventOccurrence` |
