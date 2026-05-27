-- Expose venue branding (logo, contact, address) on public /book pages.

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
  v_logo text;
  v_phone text;
  v_website text;
  v_profile jsonb;
  v_address text;
  v_modes jsonb;
  v_hours jsonb;
  v_slots jsonb;
  v_events jsonb;
  v_tables jsonb;
  v_questions jsonb;
  v_services jsonb;
  v_booked jsonb;
  v_tz_anchor date;
  v_policies jsonb;
begin
  select b.id, b.name, b.booking_flow_kind, coalesce(b.booking_flow_details, '{}'::jsonb),
         coalesce(nullif(trim(b.time_zone), ''), 'UTC'),
         nullif(trim(b.logo_url), ''),
         coalesce(
           nullif(trim(b.phone_number_e164), ''),
           nullif(trim(coalesce(b.booking_flow_details -> 'merchant_onboarding_profile' ->> 'phone', '')), '')
         ),
         nullif(trim(b.website_url), '')
  into v_id, v_name, v_kind, v_details, v_tz, v_logo, v_phone, v_website
  from public.businesses b
  where lower(trim(b.booking_slug)) = lower(trim(p_slug))
    and b.booking_slug is not null and length(trim(b.booking_slug)) > 0
  limit 1;

  if v_id is null then return null; end if;

  v_profile := coalesce(v_details -> 'merchant_onboarding_profile', '{}'::jsonb);
  v_address := nullif(trim(coalesce(v_profile ->> 'address', '')), '');
  if v_address is null then
    v_address := nullif(trim(concat_ws(', ',
      nullif(trim(coalesce(v_profile ->> 'address_line1', '')), ''),
      nullif(trim(coalesce(v_profile ->> 'city', '')), ''),
      nullif(trim(coalesce(v_profile ->> 'postcode', '')), '')
    )), '');
  end if;

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
    'id', s.id,
    'name', s.name,
    'duration_minutes', s.duration_minutes,
    'price_cents', s.price_cents,
    'sort_order', s.sort_order
  ) order by s.sort_order, s.created_at), '[]'::jsonb)
  into v_services from public.appointment_services s where s.business_id = v_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', to_char((v.starts_at at time zone v_tz)::date, 'YYYY-MM-DD'),
    'slot_start', to_char(v.starts_at at time zone v_tz, 'HH24:MI'),
    'slot_end', to_char(v.ends_at at time zone v_tz, 'HH24:MI'),
    'staff_member', nullif(trim(coalesce(v.staff_member, '')), '')
  ) order by v.starts_at), '[]'::jsonb)
  into v_booked
  from public.venue_calendar_bookings v
  where v.business_id = v_id
    and v.status is distinct from 'cancelled'
    and lower(trim(coalesce(v.booking_kind, ''))) = 'appointment'
    and (v.starts_at at time zone v_tz)::date >= (v_tz_anchor - 1)
    and (v.starts_at at time zone v_tz)::date <= (v_tz_anchor + 730);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'title', e.title, 'description', coalesce(e.description, ''),
    'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'recurrence', coalesce(e.recurrence, '{}'::jsonb),
    'cancelled', (e.cancelled_at is not null),
    'cancellation_reason', coalesce(e.cancellation_reason, ''),
    'capacity', e.capacity,
    'booked_count', coalesce(bc.booked, 0),
    'custom_questions', coalesce(e.custom_questions, '[]'::jsonb),
    'ticket_price_cents', e.ticket_price_cents,
    'show_remaining_seats', coalesce(e.show_remaining_seats, true)
  ) order by e.starts_at), '[]'::jsonb)
  into v_events
  from (
    select * from public.business_events be
    where be.business_id = v_id and be.deleted_at is null
      and (be.starts_at >= (now() - interval '48 hours')
           or lower(trim(coalesce(be.recurrence ->> 'type', ''))) = any (array['daily','weekly']::text[]))
    order by be.starts_at asc limit 48
  ) e
  left join lateral (
    select coalesce(sum(v.guest_count), 0)::integer as booked
    from public.venue_calendar_bookings v
    where v.business_event_id = e.id and v.status != 'cancelled'
  ) bc on true;

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
    'logo_url', coalesce(v_logo, ''),
    'venue_phone', coalesce(v_phone, ''),
    'venue_address', coalesce(v_address, ''),
    'website_url', coalesce(v_website, ''),
    'guest_message', coalesce(nullif(trim(v_details ->> 'guest_message'), ''), ''),
    'booking_flow_kind', coalesce(v_kind, ''),
    'venue_time_zone', v_tz,
    'guest_modes', v_modes,
    'appointment_hours', v_hours,
    'appointment_slot_exceptions', coalesce(v_slots, '[]'::jsonb),
    'appointment_booked_slots', coalesce(v_booked, '[]'::jsonb),
    'appointment_services', coalesce(v_services, '[]'::jsonb),
    'events', v_events,
    'tables', v_tables,
    'table_questions', v_questions,
    'booking_policies', coalesce(v_policies, '{}'::jsonb),
    'staff_members', coalesce(v_details -> 'staff_members', '[]'::jsonb),
    'appointment_questions', coalesce(v_details -> 'appointment_questions', '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_booking_public_context(text) to anon, authenticated;
