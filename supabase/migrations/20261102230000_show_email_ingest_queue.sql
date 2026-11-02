-- Email bookings, save first (2 Nov 2026): every email the bookings inbox gets from a tracked
-- sender is saved here by its message id the moment it's listed, then read into Email bookings
-- from this queue a few at a time, retrying with back-off when Gmail says slow down. One Gmail
-- search per run lists everything, so nothing is skipped because a list request was refused.
-- Server only (service role): RLS on, no policies.

create table if not exists public.show_email_ingest (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  connection_id uuid references public.show_email_booking_connections (id) on delete cascade,
  provider text not null,
  provider_message_id text not null check (length(provider_message_id) between 1 and 255),
  -- true: already in Email bookings but set aside wrongly; read it again and replace that row.
  reread boolean not null default false,
  state text not null default 'pending' check (state in ('pending', 'done', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text check (last_error is null or length(last_error) <= 500),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (business_id, provider, provider_message_id)
);

create index if not exists show_email_ingest_due_idx
  on public.show_email_ingest (business_id, next_attempt_at) where state = 'pending';

alter table public.show_email_ingest enable row level security;
revoke all on public.show_email_ingest from anon, authenticated;

-- Partner emails set aside before 2 Nov as "not a booking" (MTS, TUI, Tiqets, Sunbonoo, Travel
-- On…) had their text dropped. Queue them to be read again with the new rules. Replies and the
-- office's own forwards stay set aside.
insert into public.show_email_ingest (business_id, connection_id, provider, provider_message_id, reread)
select b.business_id, b.connection_id, b.provider, b.provider_message_id, true
from public.show_email_bookings b
where b.status = 'ignored'
  and b.kind = 'not-booking'
  and b.handled_by is null
  and coalesce(b.system_note, '') not like 'A reply%'
  and coalesce(b.system_note, '') not like 'Forwarded%'
on conflict (business_id, provider, provider_message_id) do nothing;
