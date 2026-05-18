/*
 * Merchant-confirmed calendar rows (guest requests → scheduled commitments).
 * Run after booking_requests + businesses exist.
 */

create table if not exists public.venue_calendar_bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  booking_request_id uuid references public.booking_requests (id) on delete set null,
  title text not null default '',
  booking_kind text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  guest_name text not null,
  guest_email text not null,
  guest_phone text,
  guest_count int,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'tentative')),
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_calendar_bookings_range_chk check (ends_at > starts_at)
);

create index if not exists venue_calendar_bookings_business_starts_idx
  on public.venue_calendar_bookings (business_id, starts_at asc);

alter table public.venue_calendar_bookings enable row level security;

drop policy if exists "venue_calendar_bookings_select_own" on public.venue_calendar_bookings;
drop policy if exists "venue_calendar_bookings_mutate_own" on public.venue_calendar_bookings;

create policy "venue_calendar_bookings_select_own"
on public.venue_calendar_bookings for select to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = venue_calendar_bookings.business_id and b.owner_id = (select auth.uid())
  )
);

create policy "venue_calendar_bookings_mutate_own"
on public.venue_calendar_bookings for all to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = venue_calendar_bookings.business_id and b.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.businesses b
    where b.id = venue_calendar_bookings.business_id and b.owner_id = (select auth.uid())
  )
);
