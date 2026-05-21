-- ============================================================================
-- SOLVIO CATCH-UP MIGRATION
-- Paste this entire file into Supabase Dashboard → SQL Editor → Run.
--
-- This consolidates all migrations 20260527 through 20260601 in dependency order.
-- Every command is idempotent (IF NOT EXISTS / OR REPLACE) so re-running is safe.
--
-- After running, the dashboard Settings form, public booking page, payments,
-- per-tenant pricing, and voice call logging will all work end-to-end.
-- ============================================================================

-- ---------- 1) Platform onboarding wizard columns -----------
alter table public.businesses
  add column if not exists platform_capabilities jsonb not null default '{}'::jsonb;
alter table public.businesses
  add column if not exists onboarding_completed_at timestamptz;
alter table public.businesses
  add column if not exists business_category text;
alter table public.businesses
  add column if not exists website_url text;
alter table public.businesses
  add column if not exists logo_url text;

update public.businesses
set onboarding_completed_at = coalesce(onboarding_completed_at, now())
where onboarding_completed_at is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  biz_name text;
  website text;
  logo text;
  category text;
begin
  biz_name := coalesce(new.raw_user_meta_data ->> 'business_name', '');
  website := nullif(trim(coalesce(new.raw_user_meta_data ->> 'website_url', '')), '');
  logo := nullif(trim(coalesce(new.raw_user_meta_data ->> 'logo_url', '')), '');
  category := nullif(trim(coalesce(new.raw_user_meta_data ->> 'business_category', '')), '');

  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );

  if length(trim(biz_name)) > 0 then
    insert into public.businesses (
      owner_id, name, onboarding_completed_at, website_url, logo_url, business_category
    )
    values (new.id, trim(biz_name), null, website, logo, category);
  end if;
  return new;
end;
$$;

-- ---------- 2) Per-table booking windows -----------
do $$
begin
  if to_regclass('public.floor_plan_tables') is null then
    raise notice 'Skipping floor_plan_table_weekday_hours: floor_plan_tables not yet created.';
    return;
  end if;
end $$;

create table if not exists public.floor_plan_table_weekday_hours (
  id uuid primary key default gen_random_uuid(),
  floor_plan_table_id uuid not null references public.floor_plan_tables (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  weekday smallint not null check (weekday >= 0 and weekday <= 6),
  open_time time not null,
  close_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (floor_plan_table_id, weekday)
);

create index if not exists floor_plan_table_weekday_hours_table_idx
  on public.floor_plan_table_weekday_hours (floor_plan_table_id);
create index if not exists floor_plan_table_weekday_hours_business_idx
  on public.floor_plan_table_weekday_hours (business_id);

alter table public.floor_plan_table_weekday_hours enable row level security;

drop policy if exists "floor_plan_table_hours_select_own" on public.floor_plan_table_weekday_hours;
drop policy if exists "floor_plan_table_hours_mutate_own" on public.floor_plan_table_weekday_hours;

create policy "floor_plan_table_hours_select_own"
on public.floor_plan_table_weekday_hours for select to authenticated
using (exists (select 1 from public.businesses b where b.id = floor_plan_table_weekday_hours.business_id and b.owner_id = (select auth.uid())));

create policy "floor_plan_table_hours_mutate_own"
on public.floor_plan_table_weekday_hours for all to authenticated
using (exists (select 1 from public.businesses b where b.id = floor_plan_table_weekday_hours.business_id and b.owner_id = (select auth.uid())))
with check (exists (select 1 from public.businesses b where b.id = floor_plan_table_weekday_hours.business_id and b.owner_id = (select auth.uid())));

create or replace function public.floor_plan_table_weekday_hours_bi_set()
returns trigger language plpgsql as $$
declare
  v_biz uuid;
begin
  select t.business_id into v_biz from public.floor_plan_tables t where t.id = new.floor_plan_table_id;
  if v_biz is null then raise exception 'Invalid floor_plan_table_id'; end if;
  new.business_id := v_biz;
  return new;
end;
$$;

drop trigger if exists floor_plan_table_weekday_hours_bi on public.floor_plan_table_weekday_hours;
create trigger floor_plan_table_weekday_hours_bi
before insert or update of floor_plan_table_id on public.floor_plan_table_weekday_hours
for each row execute function public.floor_plan_table_weekday_hours_bi_set();

-- ---------- 3) Stripe Connect + booking payment tracking -----------
alter table public.businesses
  add column if not exists stripe_connect_charges_enabled boolean not null default false,
  add column if not exists stripe_connect_details_submitted boolean not null default false;

alter table public.booking_requests
  add column if not exists payment_status text not null default 'none',
  add column if not exists stripe_checkout_session_id text,
  add column if not exists deposit_amount_cents integer;

create index if not exists booking_requests_stripe_checkout_idx
  on public.booking_requests (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- ---------- 4) Backfill booking slugs for any existing businesses -----------
update public.businesses b
set booking_slug = (
  case
    when length(trim(both '-' from regexp_replace(trim(b.name), '[^a-zA-Z0-9]+', '-', 'g'))) >= 2 then
      lower(trim(both '-' from regexp_replace(trim(b.name), '[^a-zA-Z0-9]+', '-', 'g')))
    else 'book'
  end || '-' || substring(replace(b.id::text, '-', ''), 1, 8)
)
where b.booking_slug is null or length(trim(b.booking_slug)) = 0;

-- ---------- 5) Per-tenant pricing + voice call logs (NEW) -----------
alter table public.businesses
  add column if not exists subscription_tier text not null default 'trial',
  add column if not exists platform_fee_bps integer not null default 500,
  add column if not exists monthly_ai_minutes_included integer not null default 50,
  add column if not exists included_locations integer not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'businesses_subscription_tier_check') then
    alter table public.businesses
      add constraint businesses_subscription_tier_check
      check (subscription_tier in ('trial', 'pro', 'business', 'scale', 'enterprise'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'businesses_platform_fee_bps_check') then
    alter table public.businesses
      add constraint businesses_platform_fee_bps_check
      check (platform_fee_bps >= 0 and platform_fee_bps <= 10000);
  end if;
end $$;

create table if not exists public.voice_call_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  vapi_call_id text,
  caller_phone text,
  caller_name text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer not null default 0,
  duration_minutes_billable numeric(10,2) not null default 0,
  outcome text check (outcome in ('answered', 'booked', 'voicemail', 'transferred', 'dropped', 'spam')),
  transcript_summary text,
  raw_transcript jsonb,
  cost_cents integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_voice_call_logs_business_started
  on public.voice_call_logs (business_id, started_at desc);

alter table public.voice_call_logs enable row level security;

drop policy if exists "voice_call_logs_owner_read" on public.voice_call_logs;
create policy "voice_call_logs_owner_read"
  on public.voice_call_logs for select
  using (business_id in (select id from public.businesses where owner_id = auth.uid()));

drop policy if exists "voice_call_logs_service_insert" on public.voice_call_logs;
create policy "voice_call_logs_service_insert"
  on public.voice_call_logs for insert with check (false);

create or replace view public.voice_call_usage_current_month as
select
  b.id as business_id,
  b.name as business_name,
  b.subscription_tier,
  b.monthly_ai_minutes_included,
  coalesce(sum(v.duration_minutes_billable), 0)::numeric(10,2) as minutes_used,
  greatest(coalesce(sum(v.duration_minutes_billable), 0) - b.monthly_ai_minutes_included, 0)::numeric(10,2) as minutes_over,
  count(v.id) as call_count
from public.businesses b
left join public.voice_call_logs v
  on v.business_id = b.id and v.started_at >= date_trunc('month', now())
group by b.id, b.name, b.subscription_tier, b.monthly_ai_minutes_included;

grant select on public.voice_call_usage_current_month to authenticated;

-- ---------- 6) Latest get_booking_public_context (includes everything above) -----------
create or replace function public.get_booking_public_context(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
  v_kind text;
  v_details jsonb;
  v_tz text;
  v_modes jsonb;
  v_hours jsonb;
  v_slots jsonb;
  v_events jsonb;
  v_tables jsonb;
  v_questions jsonb;
  v_tz_anchor date;
  v_policies jsonb;
begin
  select b.id, b.name, b.booking_flow_kind, coalesce(b.booking_flow_details, '{}'::jsonb),
         coalesce(nullif(trim(b.time_zone), ''), 'UTC')
  into v_id, v_name, v_kind, v_details, v_tz
  from public.businesses b
  where lower(trim(b.booking_slug)) = lower(trim(p_slug))
    and b.booking_slug is not null and length(trim(b.booking_slug)) > 0
  limit 1;

  if v_id is null then return null; end if;

  v_tz_anchor := (now() AT TIME ZONE v_tz)::date;

  v_policies := jsonb_build_object(
    'block_public_table_when_hosted_event_date',
    case jsonb_typeof(coalesce(v_details -> 'block_public_table_when_hosted_event_date', 'false'::jsonb))
      when 'boolean' then (v_details -> 'block_public_table_when_hosted_event_date')::text::boolean
      when 'string' then lower(trim(v_details ->> 'block_public_table_when_hosted_event_date')) = any (array['true','1','yes']::text[])
      else false
    end
  );

  v_modes := coalesce(
    v_details -> 'guest_booking_modes',
    case coalesce(v_kind, '')
      when 'restaurant_tables' then '["table"]'::jsonb
      when 'hosted_events' then '["event"]'::jsonb
      when 'salon_appointments' then '["appointment"]'::jsonb
      when 'walk_in_waitlist' then '["walk_in"]'::jsonb
      when 'mixed' then '["appointment","table"]'::jsonb
      else '["appointment","table","walk_in"]'::jsonb
    end
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'weekday', h.weekday,
    'open_time', to_char(h.open_time, 'HH24:MI'),
    'close_time', to_char(h.close_time, 'HH24:MI'),
    'slot_minutes', h.slot_minutes
  ) order by h.weekday), '[]'::jsonb)
  into v_hours from public.appointment_weekday_hours h where h.business_id = v_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'exception_date', x.exception_date::text,
    'slot_start', case when x.slot_start is null then null else to_char(x.slot_start, 'HH24:MI') end,
    'kind', x.kind
  ) order by x.exception_date asc, x.slot_start nulls first), '[]'::jsonb)
  into v_slots from public.appointment_slot_exceptions x
  where x.business_id = v_id and x.exception_date >= (v_tz_anchor - 1) and x.exception_date <= (v_tz_anchor + 730);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'title', e.title, 'description', coalesce(e.description, ''),
    'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'recurrence', coalesce(e.recurrence, '{}'::jsonb),
    'cancelled', (e.cancelled_at is not null),
    'cancellation_reason', coalesce(e.cancellation_reason, '')
  ) order by e.starts_at), '[]'::jsonb)
  into v_events
  from (
    select * from public.business_events be
    where be.business_id = v_id and be.deleted_at is null
      and (be.starts_at >= (now() - interval '48 hours')
           or lower(trim(coalesce(be.recurrence ->> 'type', ''))) = any (array['daily','weekly']::text[]))
    order by be.starts_at asc limit 48
  ) e;

  select coalesce(jsonb_agg(obj order by lbl), '[]'::jsonb)
  into v_tables
  from (
    select t.label as lbl,
      jsonb_build_object(
        'id', t.id, 'label', t.label, 'capacity', t.capacity,
        'pricing_mode', t.pricing_mode, 'price_cents', t.price_cents,
        'position_x', t.position_x, 'position_y', t.position_y,
        'width', t.width, 'height', t.height,
        'shape', coalesce(nullif(trim(t.shape), ''), 'rectangle'),
        'fill_color', t.fill_color,
        'weekday_hours', coalesce(hw.h_arr, '[]'::jsonb)
      ) as obj
    from public.floor_plan_tables t
    left join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        'weekday', h.weekday,
        'open_time', to_char(h.open_time, 'HH24:MI'),
        'close_time', to_char(h.close_time, 'HH24:MI')
      ) order by h.weekday), '[]'::jsonb) as h_arr
      from public.floor_plan_table_weekday_hours h
      where h.floor_plan_table_id = t.id
    ) hw on true
    where t.business_id = v_id
  ) z;

  select coalesce(jsonb_agg(jsonb_build_object(
    'question_label', q.question_label, 'required', q.required, 'sort_order', q.sort_order
  ) order by q.sort_order, q.question_label), '[]'::jsonb)
  into v_questions from public.booking_table_questions q where q.business_id = v_id;

  return jsonb_build_object(
    'business_name', v_name,
    'guest_message', coalesce(nullif(trim(v_details ->> 'guest_message'), ''), ''),
    'booking_flow_kind', coalesce(v_kind, ''),
    'venue_time_zone', v_tz,
    'guest_modes', v_modes,
    'appointment_hours', v_hours,
    'appointment_slot_exceptions', coalesce(v_slots, '[]'::jsonb),
    'events', v_events,
    'tables', v_tables,
    'table_questions', v_questions,
    'booking_policies', coalesce(v_policies, '{}'::jsonb),
    'staff_members', coalesce(v_details -> 'staff_members', '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_booking_public_context(text) to anon, authenticated;

-- ---------- 7) Repair missing business_events.custom_questions (fixes /book/[slug] 404) -----------
alter table public.business_events
  add column if not exists custom_questions jsonb not null default '[]'::jsonb;

-- ============================================================================
-- DONE. Verify with:
--   select * from public.businesses;
--   select * from public.voice_call_logs limit 1;
-- ============================================================================
