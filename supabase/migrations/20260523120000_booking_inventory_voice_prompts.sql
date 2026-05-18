/*
 * Operational booking inventory + richer voice/agent fields (stored in voice_receptionist_details JSON via app).
 * appointment_weekday_hours — recurring weekly windows + slot length.
 * appointment_slot_exceptions — remove vs cancel (+ optional reason).
 * business_events — hosted events with recurrence metadata (JSON) + cancel vs soft-delete.
 * floor_plan_tables — draggable layout coords + pricing modes.
 * booking_table_questions — extra intake fields on table bookings.
 */

-- ── Appointment weekly availability ───────────────────────────────────────────

create table if not exists public.appointment_weekday_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  weekday smallint not null check (weekday >= 0 and weekday <= 6),
  open_time time not null,
  close_time time not null,
  slot_minutes int not null default 30 check (slot_minutes > 0 and slot_minutes <= 720),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, weekday)
);

create index if not exists appointment_weekday_hours_business_idx
  on public.appointment_weekday_hours (business_id);

-- ── Exceptions: removed vs cancelled slots ────────────────────────────────────

create table if not exists public.appointment_slot_exceptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  exception_date date not null,
  slot_start time,
  kind text not null check (kind in ('removed', 'cancelled')),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists appointment_slot_exceptions_business_date_idx
  on public.appointment_slot_exceptions (business_id, exception_date desc);

-- ── Events (show listings / cancellations for voice scripts) ─────────────────

create table if not exists public.business_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  recurrence jsonb not null default '{"type":"once"}'::jsonb,
  cancelled_at timestamptz,
  cancellation_reason text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_events_business_starts_idx
  on public.business_events (business_id, starts_at);

-- ── Floor plan / tables ──────────────────────────────────────────────────────

create table if not exists public.floor_plan_tables (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  label text not null,
  capacity int not null default 4 check (capacity > 0 and capacity <= 999),
  position_x double precision not null default 0,
  position_y double precision not null default 0,
  width double precision not null default 120,
  height double precision not null default 80,
  pricing_mode text not null default 'table' check (pricing_mode in ('table', 'person', 'group_tier')),
  price_cents int not null default 0 check (price_cents >= 0),
  group_pricing jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists floor_plan_tables_business_idx
  on public.floor_plan_tables (business_id);

-- ── Custom prompts on table bookings ───────────────────────────────────────────

create table if not exists public.booking_table_questions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  question_label text not null,
  required boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists booking_table_questions_business_idx
  on public.booking_table_questions (business_id, sort_order);

-- ── RLS ────────────────────────────────────────────────────────────────────────

alter table public.appointment_weekday_hours enable row level security;
alter table public.appointment_slot_exceptions enable row level security;
alter table public.business_events enable row level security;
alter table public.floor_plan_tables enable row level security;
alter table public.booking_table_questions enable row level security;

-- appointment_weekday_hours
drop policy if exists "appointment_weekday_hours_select_own" on public.appointment_weekday_hours;
drop policy if exists "appointment_weekday_hours_mutate_own" on public.appointment_weekday_hours;

create policy "appointment_weekday_hours_select_own"
on public.appointment_weekday_hours for select to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = appointment_weekday_hours.business_id and b.owner_id = (select auth.uid())
  )
);

create policy "appointment_weekday_hours_mutate_own"
on public.appointment_weekday_hours for all to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = appointment_weekday_hours.business_id and b.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.businesses b
    where b.id = appointment_weekday_hours.business_id and b.owner_id = (select auth.uid())
  )
);

-- appointment_slot_exceptions
drop policy if exists "appointment_slot_exceptions_select_own" on public.appointment_slot_exceptions;
drop policy if exists "appointment_slot_exceptions_mutate_own" on public.appointment_slot_exceptions;

create policy "appointment_slot_exceptions_select_own"
on public.appointment_slot_exceptions for select to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = appointment_slot_exceptions.business_id and b.owner_id = (select auth.uid())
  )
);

create policy "appointment_slot_exceptions_mutate_own"
on public.appointment_slot_exceptions for all to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = appointment_slot_exceptions.business_id and b.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.businesses b
    where b.id = appointment_slot_exceptions.business_id and b.owner_id = (select auth.uid())
  )
);

-- business_events
drop policy if exists "business_events_select_own" on public.business_events;
drop policy if exists "business_events_mutate_own" on public.business_events;

create policy "business_events_select_own"
on public.business_events for select to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = business_events.business_id and b.owner_id = (select auth.uid())
  )
);

create policy "business_events_mutate_own"
on public.business_events for all to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = business_events.business_id and b.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.businesses b
    where b.id = business_events.business_id and b.owner_id = (select auth.uid())
  )
);

-- floor_plan_tables
drop policy if exists "floor_plan_tables_select_own" on public.floor_plan_tables;
drop policy if exists "floor_plan_tables_mutate_own" on public.floor_plan_tables;

create policy "floor_plan_tables_select_own"
on public.floor_plan_tables for select to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = floor_plan_tables.business_id and b.owner_id = (select auth.uid())
  )
);

create policy "floor_plan_tables_mutate_own"
on public.floor_plan_tables for all to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = floor_plan_tables.business_id and b.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.businesses b
    where b.id = floor_plan_tables.business_id and b.owner_id = (select auth.uid())
  )
);

-- booking_table_questions
drop policy if exists "booking_table_questions_select_own" on public.booking_table_questions;
drop policy if exists "booking_table_questions_mutate_own" on public.booking_table_questions;

create policy "booking_table_questions_select_own"
on public.booking_table_questions for select to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = booking_table_questions.business_id and b.owner_id = (select auth.uid())
  )
);

create policy "booking_table_questions_mutate_own"
on public.booking_table_questions for all to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = booking_table_questions.business_id and b.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.businesses b
    where b.id = booking_table_questions.business_id and b.owner_id = (select auth.uid())
  )
);
