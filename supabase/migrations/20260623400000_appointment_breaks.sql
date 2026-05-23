-- Recurring break windows for appointment scheduling.
-- Defines time ranges per weekday(s) that are blocked every week (lunch, dinner prep, staff meetings, etc.)
-- Slot generation skips any slot whose start falls within a break window.

create table if not exists public.appointment_breaks (
  id          uuid        primary key default gen_random_uuid(),
  business_id uuid        not null references public.businesses(id) on delete cascade,
  weekdays    smallint[]  not null default '{1,2,3,4,5}',
  start_time  time        not null,
  end_time    time        not null,
  label       text        not null default 'Break',
  created_at  timestamptz not null default now(),
  constraint appointment_breaks_times_check check (end_time > start_time)
);

create index if not exists idx_appointment_breaks_business
  on public.appointment_breaks (business_id);

alter table public.appointment_breaks enable row level security;

-- Merchant full CRUD on their own breaks
drop policy if exists "appointment_breaks_owner" on public.appointment_breaks;
create policy "appointment_breaks_owner"
  on public.appointment_breaks for all to authenticated
  using   (business_id in (select id from public.businesses where owner_id = auth.uid()))
  with check (business_id in (select id from public.businesses where owner_id = auth.uid()));

-- Public booking pages can read breaks for any business with a booking slug
drop policy if exists "appointment_breaks_public_read" on public.appointment_breaks;
create policy "appointment_breaks_public_read"
  on public.appointment_breaks for select to anon, authenticated
  using (
    business_id in (
      select id from public.businesses where booking_slug is not null
    )
  );

comment on table public.appointment_breaks is
  'Recurring weekly break windows. Slots whose start_time falls within [start_time, end_time) on any matching weekday are hidden from the public booking form.';
comment on column public.appointment_breaks.weekdays is
  'Array of weekday numbers (0=Sun, 1=Mon … 6=Sat). Matches Postgres extract(dow) convention.';
