/*
 * Structured booking intake: event title, booking kind, preferred date, guest count.
 * Extends public RPCs — run AFTER prior migrations on this branch.
 */

alter table public.booking_requests
  add column if not exists event_title text;

alter table public.booking_requests
  add column if not exists booking_kind text;

alter table public.booking_requests
  add column if not exists requested_date date;

alter table public.booking_requests
  add column if not exists guest_count int;

-- ── Replace public booking page RPC (new OUT columns) ─────────────────────────

drop function if exists public.get_booking_page_by_slug(text);

create function public.get_booking_page_by_slug(p_slug text)
returns table (
  business_name text,
  guest_message text,
  booking_flow_kind text,
  guest_modes_json text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.name::text,
    coalesce(nullif(trim(b.booking_flow_details ->> 'guest_message'), ''), ''),
    coalesce(b.booking_flow_kind, ''),
    (
      coalesce(
        b.booking_flow_details -> 'guest_booking_modes',
        case coalesce(b.booking_flow_kind, '')
          when 'restaurant_tables' then '["table"]'::jsonb
          when 'salon_appointments' then '["appointment"]'::jsonb
          when 'walk_in_waitlist' then '["walk_in"]'::jsonb
          when 'mixed' then '["appointment","table"]'::jsonb
          else '["appointment","table","walk_in"]'::jsonb
        end
      )
    )::text
  from public.businesses b
  where lower(trim(b.booking_slug)) = lower(trim(p_slug))
    and b.booking_slug is not null
    and length(trim(b.booking_slug)) > 0
  limit 1;
$$;

grant execute on function public.get_booking_page_by_slug(text) to anon, authenticated;

-- ── Replace submit RPC (additional intake fields) ───────────────────────────

drop function if exists public.submit_booking_request(text, text, text, text, text, text);

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
  p_guest_count text
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
begin
  select b.id, b.booking_flow_kind, coalesce(b.booking_flow_details, '{}'::jsonb)
  into v_business_id, v_flow_kind, v_details
  from public.businesses b
  where lower(trim(b.booking_slug)) = lower(trim(p_slug))
    and b.booking_slug is not null
    and length(trim(b.booking_slug)) > 0
  limit 1;

  if v_business_id is null then
    raise exception 'Business not found';
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
    'web'
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.submit_booking_request(text, text, text, text, text, text, text, text, text, text)
  to anon, authenticated;
