/*
 * Structured intake extras, venue time zone, confirm links + submit rate fingerprints,
 * and extended submit / public-context RPCs.
 */

-- ── Business time zone (IANA e.g. Europe/Dublin); used when formatting emails ──
alter table public.businesses
  add column if not exists time_zone text not null default 'UTC';

-- ── Machine-readable extras from public intake (Q&A, table preference keys, etc.) ──
alter table public.booking_requests
  add column if not exists intake_extras jsonb not null default '{}'::jsonb;

-- ── Optional links when confirming ──
alter table public.venue_calendar_bookings
  add column if not exists floor_plan_table_id uuid references public.floor_plan_tables (id) on delete set null;

alter table public.venue_calendar_bookings
  add column if not exists business_event_id uuid references public.business_events (id) on delete set null;

create index if not exists venue_calendar_bookings_table_idx
  on public.venue_calendar_bookings (floor_plan_table_id)
  where floor_plan_table_id is not null;

create index if not exists venue_calendar_bookings_event_idx
  on public.venue_calendar_bookings (business_event_id)
  where business_event_id is not null;

-- ── Server-side throttle signal (SECURITY DEFINER RPC inserts rows) ──────────
create table if not exists public.booking_submit_audit (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  slug_norm text not null,
  rate_key_hash text not null
);

create index if not exists booking_submit_audit_slug_key_created_idx
  on public.booking_submit_audit (slug_norm, rate_key_hash, created_at desc);

alter table public.booking_submit_audit enable row level security;

-- No policies: clients never query this directly; SECURITY DEFINER writes only.

-- ── Public context incl. venue TZ + expose row ids for dashboards / tooling ─────
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
  v_events jsonb;
  v_tables jsonb;
  v_questions jsonb;
begin
  select
    b.id,
    b.name,
    b.booking_flow_kind,
    coalesce(b.booking_flow_details, '{}'::jsonb),
    coalesce(nullif(trim(b.time_zone), ''), 'UTC')
  into v_id, v_name, v_kind, v_details, v_tz
  from public.businesses b
  where lower(trim(b.booking_slug)) = lower(trim(p_slug))
    and b.booking_slug is not null
    and length(trim(b.booking_slug)) > 0
  limit 1;

  if v_id is null then
    return null;
  end if;

  v_modes := coalesce(
    v_details -> 'guest_booking_modes',
    case coalesce(v_kind, '')
      when 'restaurant_tables' then '["table"]'::jsonb
      when 'salon_appointments' then '["appointment"]'::jsonb
      when 'walk_in_waitlist' then '["walk_in"]'::jsonb
      when 'mixed' then '["appointment","table"]'::jsonb
      else '["appointment","table","walk_in"]'::jsonb
    end
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'weekday', h.weekday,
        'open_time', to_char(h.open_time, 'HH24:MI'),
        'close_time', to_char(h.close_time, 'HH24:MI'),
        'slot_minutes', h.slot_minutes
      )
      order by h.weekday
    ),
    '[]'::jsonb
  )
  into v_hours
  from public.appointment_weekday_hours h
  where h.business_id = v_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'description', coalesce(e.description, ''),
        'starts_at', e.starts_at,
        'ends_at', e.ends_at,
        'cancelled', (e.cancelled_at is not null),
        'cancellation_reason', coalesce(e.cancellation_reason, '')
      )
      order by e.starts_at
    ),
    '[]'::jsonb
  )
  into v_events
  from (
    select *
    from public.business_events be
    where be.business_id = v_id
      and be.deleted_at is null
      and be.starts_at >= (now() - interval '6 hours')
    order by be.starts_at asc
    limit 24
  ) e;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'label', t.label,
        'capacity', t.capacity,
        'pricing_mode', t.pricing_mode,
        'price_cents', t.price_cents,
        'position_x', t.position_x,
        'position_y', t.position_y,
        'width', t.width,
        'height', t.height
      )
      order by t.label
    ),
    '[]'::jsonb
  )
  into v_tables
  from public.floor_plan_tables t
  where t.business_id = v_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'question_label', q.question_label,
        'required', q.required,
        'sort_order', q.sort_order
      )
      order by q.sort_order, q.question_label
    ),
    '[]'::jsonb
  )
  into v_questions
  from public.booking_table_questions q
  where q.business_id = v_id;

  return jsonb_build_object(
    'business_name', v_name,
    'guest_message', coalesce(nullif(trim(v_details ->> 'guest_message'), ''), ''),
    'booking_flow_kind', coalesce(v_kind, ''),
    'venue_time_zone', v_tz,
    'guest_modes', v_modes,
    'appointment_hours', v_hours,
    'events', v_events,
    'tables', v_tables,
    'table_questions', v_questions
  );
end;
$$;

grant execute on function public.get_booking_public_context(text) to anon, authenticated;

-- ── Submit with intake extras + soft rate limit ─────────────────────────────────
drop function if exists public.submit_booking_request(text, text, text, text, text, text, text, text, text, text);

create or replace function public.submit_booking_request(
  p_slug text,
  p_customer_name text,
  p_email text,
  p_phone text,
  p_notes text,
  p_preferred_time text,
  p_event_title text,
  p_booking_kind text,
  p_requested_date text,
  p_guest_count text,
  p_intake_extras_json text,
  p_rate_key_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_flow_kind text;
  v_details jsonb;
  v_modes jsonb;
  v_id uuid;
  v_date date;
  v_guest_count int;
  v_extras jsonb;
  v_recent int;
  v_slug_norm text;
  v_rate_key text;
begin
  v_slug_norm := lower(trim(coalesce(p_slug, '')));

  select b.id, b.booking_flow_kind, coalesce(b.booking_flow_details, '{}'::jsonb)
  into v_business_id, v_flow_kind, v_details
  from public.businesses b
  where lower(trim(b.booking_slug)) = v_slug_norm
    and b.booking_slug is not null
    and length(trim(b.booking_slug)) > 0
  limit 1;

  if v_business_id is null then
    raise exception 'Business not found';
  end if;

  v_rate_key := nullif(trim(coalesce(p_rate_key_hash, '')), '');
  if v_rate_key is not null then
    select count(*)::int into v_recent
    from public.booking_submit_audit a
    where a.slug_norm = v_slug_norm
      and a.rate_key_hash = v_rate_key
      and a.created_at > (now() - interval '35 minutes');

    if v_recent >= 10 then
      raise exception 'Too many submissions. Try again shortly.';
    end if;
  end if;

  v_modes := coalesce(
    v_details -> 'guest_booking_modes',
    case coalesce(v_flow_kind, '')
      when 'restaurant_tables' then '["table"]'::jsonb
      when 'salon_appointments' then '["appointment"]'::jsonb
      when 'walk_in_waitlist' then '["walk_in"]'::jsonb
      when 'mixed' then '["appointment","table"]'::jsonb
      else '["appointment","table","walk_in"]'::jsonb
    end
  );

  if length(trim(coalesce(p_customer_name, ''))) < 1 then
    raise exception 'Name is required';
  end if;

  if length(trim(coalesce(p_email, ''))) < 3
     or position('@' in trim(p_email)) < 2 then
    raise exception 'Valid email is required';
  end if;

  if length(trim(coalesce(p_booking_kind, ''))) < 1 then
    raise exception 'Booking type is required';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements_text(v_modes) as mo(val)
    where lower(trim(mo.val)) = lower(trim(p_booking_kind))
  ) then
    raise exception 'Invalid booking type for this venue';
  end if;

  if length(trim(coalesce(p_requested_date, ''))) > 0 then
    begin
      v_date := trim(p_requested_date)::date;
    exception
      when others then
        raise exception 'Preferred date must be YYYY-MM-DD';
    end;
  else
    v_date := null;
  end if;

  if length(trim(coalesce(p_guest_count, ''))) > 0 then
    begin
      v_guest_count := trim(p_guest_count)::int;
    exception
      when others then
        raise exception 'Guest count must be a number';
    end;
    if v_guest_count < 1 or v_guest_count > 999 then
      raise exception 'Guest count must be between 1 and 999';
    end if;
  else
    v_guest_count := null;
  end if;

  v_extras := '{}'::jsonb;
  if length(trim(coalesce(p_intake_extras_json, ''))) > 0 then
    begin
      v_extras := trim(p_intake_extras_json)::jsonb;
    exception
      when others then
        v_extras := '{}'::jsonb;
    end;
  end if;

  insert into public.booking_requests (
    business_id,
    customer_name,
    email,
    phone,
    notes,
    preferred_time,
    event_title,
    booking_kind,
    requested_date,
    guest_count,
    intake_extras,
    source
  )
  values (
    v_business_id,
    trim(p_customer_name),
    trim(lower(p_email)),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_preferred_time, '')), ''),
    nullif(trim(coalesce(p_event_title, '')), ''),
    lower(trim(p_booking_kind)),
    v_date,
    v_guest_count,
    coalesce(jsonb_strip_nulls(v_extras), '{}'::jsonb),
    'web'
  )
  returning id into v_id;

  if v_rate_key is not null then
    insert into public.booking_submit_audit (slug_norm, rate_key_hash)
    values (v_slug_norm, v_rate_key);
  end if;

  return v_id;
end;
$$;

grant execute on function public.submit_booking_request(text, text, text, text, text, text, text, text, text, text, text, text)
  to anon, authenticated;
