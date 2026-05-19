---
name: solvio-booking
description: >-
  Solvio booking domain — public /book pages, guest modes (Events, Tables,
  Appointments, Walk-in), hosted show recurrence, per-night cancellation with
  guest-facing reasons, table-vs-event blocking, floor plan tables, merchant
  inventory hub, and Supabase RPC get_booking_public_context. Use when changing
  anything under src/app/book/, dashboard bookings, business_events recurrence,
  booking-table-rules, booking-hosted-submit, or booking public context.
---

# Solvio booking domain

Read this skill before changing guest booking UX, merchant inventory, or event recurrence.

Canonical product spec: `docs/superpowers/specs/2026-05-19-solvio-booking-domain-design.md`

File map and RPC details: `.cursor/skills/solvio-booking/reference.md`

## Product in one paragraph

Solvio gives venues a public booking link (`/book/[slug]`) with one or more **guest modes**. **Events** are hosted listings with recurrence; guests pick the show then a **purple calendar date** (bookable nights only). **Tables** are regular seating enquiries with optional floor-plan table pick. **Appointments** use weekly hours + slot grid. Merchants manage inventory under **Dashboard → Bookings**. Cancellations and reasons must reach **guests on the booking page** and **voice reception scripts** (data lives on `business_events.recurrence`).

## Non-negotiable rules

1. **No table bookings on upcoming hosted show nights** — always block (UI + `validateTableBookingSubmission` in `booking-table-rules.ts`). Message must direct guests to **Events** tab and purple calendar. Do not gate this on merchant policy alone.

2. **Event nights are calendar-only when a hosted listing is selected** — no loose browser date picker for that flow; use `EventOccurrenceMonthCalendar` or strict `YYYY-MM-DD` fallback when expansion is empty.

3. **Cancel a show night, don’t “skip” it** — merchant copy is **“Cancel this day’s event”** with optional reason. Store in `recurrence.cancelled_occurrences: [{ date, reason? }]`. Legacy `skipped_dates` still parses.

4. **Cancelled nights on public calendar** — rose + strikethrough, not tappable; list reasons below calendar. Bookable = purple only.

5. **Server validates what UI shows** — public `actions.ts` must call `validateHostedEventSubmission` and `validateTableBookingSubmission`; never rely on client-only guards.

6. **Minimal diffs** — match existing violet/rose UI tokens, numbered `FormSection` steps on public form, merchant hub patterns in `booking-operations-hub.tsx`.

## Guest modes

| Mode | Public UX | Key files |
|------|-----------|-----------|
| `event` | Select show → purple calendar → guests + contact | `booking-public-form.tsx`, `event-occurrence-calendar.tsx`, `booking-hosted-submit.ts` |
| `table` | Date → optional table pick + floor preview | `booking-table-rules.ts`, `floor-plan-visuals.ts` |
| `appointment` | Date → slot select from weekly hours | `booking-appointment-slots.ts`, `appointment-exception-grid.tsx` |
| `walk_in` | Party size + contact | `booking-public-form.tsx` |

Modes come from `guest_booking_modes` in `booking_flow_details` (RPC `get_booking_public_context`).

## Event recurrence JSON

```json
{
  "type": "once | daily | weekly",
  "weekdays": [0, 2, 4],
  "cancelled_occurrences": [
    { "date": "2026-05-20", "reason": "Artist unavailable" }
  ],
  "instance_overrides": [
    { "date": "2026-05-22", "starts_at": "...", "ends_at": "..." }
  ]
}
```

- Expand occurrences: `expandBusinessEventOccurrences` / `parseRecurrenceExtras` in `business-event-occurrences.ts`
- Guest calendar (includes cancelled): `expandHostedEventOccurrences`
- Submit (bookable only): `expandHostedEventForSubmit` filters `!skipped`
- Merchant cancel: `cancelEventOccurrence` / `restoreEventOccurrence` via `inventory-actions.ts` → `toggleBusinessEventOccurrenceSkipped`

## Verification checklist

Before claiming booking work is done:

1. `npm run lint` (repo root)
2. If UI-facing: open prod/staging `/book/[slug]` in browser MCP — test Events purple dates, cancelled rose dates, Tables blocked on show nights
3. Confirm server action rejects bypass attempts (table on show night, event on non-purple date)

Deploy: see `.cursor/rules/git-commit-deploy-proactive.mdc` — commit + push + Vercel prod for guest-facing changes unless user opts out.

## When to use Superpowers alongside this skill

- **New feature or behavior change** → `brainstorming` first; update spec in `docs/superpowers/specs/`
- **Multi-file implementation** → `writing-plans` then `executing-plans`
- **Before “done”** → `verification-before-completion`
