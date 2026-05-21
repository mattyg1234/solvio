/*
 * Comms trail + voice_call_logs linkage for confirmed calendar bookings.
 */

create table if not exists public.venue_calendar_booking_messages (
  id uuid primary key default gen_random_uuid(),
  venue_calendar_booking_id uuid not null references public.venue_calendar_bookings (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  direction text not null check (direction in ('outbound', 'inbound')),
  channel text not null check (channel in ('voice', 'sms', 'email', 'note')),
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  vapi_call_id text,
  created_at timestamptz not null default now()
);

create index if not exists venue_calendar_booking_messages_booking_created_idx
  on public.venue_calendar_booking_messages (venue_calendar_booking_id, created_at asc);

alter table public.venue_calendar_booking_messages enable row level security;

drop policy if exists "venue_calendar_booking_messages_owner_read" on public.venue_calendar_booking_messages;
create policy "venue_calendar_booking_messages_owner_read"
  on public.venue_calendar_booking_messages for select to authenticated
  using (
    exists (
      select 1 from public.businesses b
      where b.id = venue_calendar_booking_messages.business_id
        and b.owner_id = (select auth.uid())
    )
  );

drop policy if exists "venue_calendar_booking_messages_owner_insert" on public.venue_calendar_booking_messages;
create policy "venue_calendar_booking_messages_owner_insert"
  on public.venue_calendar_booking_messages for insert to authenticated
  with check (
    exists (
      select 1 from public.businesses b
      where b.id = venue_calendar_booking_messages.business_id
        and b.owner_id = (select auth.uid())
    )
  );

alter table public.voice_call_logs
  add column if not exists venue_calendar_booking_id uuid references public.venue_calendar_bookings (id) on delete set null,
  add column if not exists booking_request_id uuid references public.booking_requests (id) on delete set null,
  add column if not exists call_purpose text;

create index if not exists idx_voice_call_logs_venue_booking
  on public.voice_call_logs (venue_calendar_booking_id)
  where venue_calendar_booking_id is not null;
