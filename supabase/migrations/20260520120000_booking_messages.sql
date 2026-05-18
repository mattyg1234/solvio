/*
 * Chat-style communication trail per booking request (bulk SMS/email logs, voice summaries, inbound replies).
 * Apply after booking_requests migration exists.
 */

create table if not exists public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references public.booking_requests (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  direction text not null check (direction in ('outbound', 'inbound')),
  channel text not null check (channel in ('sms', 'email', 'voice', 'note')),
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists booking_messages_booking_created_idx
  on public.booking_messages (booking_request_id, created_at asc);

create index if not exists booking_messages_business_created_idx
  on public.booking_messages (business_id, created_at desc);

alter table public.booking_messages enable row level security;

drop policy if exists "booking_messages_select_own_business" on public.booking_messages;
drop policy if exists "booking_messages_insert_own_business" on public.booking_messages;

create policy "booking_messages_select_own_business"
on public.booking_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.businesses b
    where b.id = booking_messages.business_id
      and b.owner_id = (select auth.uid())
  )
);

create policy "booking_messages_insert_own_business"
on public.booking_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.businesses b
    where b.id = booking_messages.business_id
      and b.owner_id = (select auth.uid())
  )
);
