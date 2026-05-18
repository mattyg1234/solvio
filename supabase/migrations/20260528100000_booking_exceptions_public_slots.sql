/*
 * Appointment slot exceptions: uniqueness + expose to public RPC for guest slot filtering.
 */

-- One whole-day closure per venue per calendar date (slot_start IS NULL).
create unique index if not exists appointment_slot_exceptions_wholeday_uidx
  on public.appointment_slot_exceptions (business_id, exception_date)
  where slot_start is null;

-- One exception row per discrete slot_start per venue per calendar date.
create unique index if not exists appointment_slot_exceptions_slot_uidx
  on public.appointment_slot_exceptions (business_id, exception_date, slot_start)
  where slot_start is not null;

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

  v_tz_anchor := (now() AT TIME ZONE v_tz)::date;

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
        'exception_date', x.exception_date::text,
        'slot_start', case when x.slot_start is null then null else to_char(x.slot_start, 'HH24:MI') end,
        'kind', x.kind
      )
      order by x.exception_date asc, x.slot_start nulls first
    ),
    '[]'::jsonb
  )
  into v_slots
  from public.appointment_slot_exceptions x
  where x.business_id = v_id
    and x.exception_date >= (v_tz_anchor - 1)
    and x.exception_date <= (v_tz_anchor + 730);

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
    'appointment_slot_exceptions', coalesce(v_slots, '[]'::jsonb),
    'events', v_events,
    'tables', v_tables,
    'table_questions', v_questions
  );
end;
$$;

grant execute on function public.get_booking_public_context(text) to anon, authenticated;
