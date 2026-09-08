-- B02: partner links have no auth.uid(), so the seller trigger deliberately
-- exempts their service-role inserts. Route ONLY partner-link creation through
-- this RPC; keep the existing staff override and seller trigger unchanged.
-- The server must supply buildBookingFields output, never raw guest JSON.
-- Pricing/reference allocation remain the server's responsibility (B10 is separate).
-- https://supabase.com/docs/guides/database/functions
-- https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS
begin;

create schema if not exists private;
grant usage on schema private to service_role;

create or replace function private.show_ops_create_partner_link_booking(p_token text, p_booking jsonb)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_booking public.show_bookings%rowtype;
  v_supplier public.show_suppliers%rowtype;
  v_product public.show_products%rowtype;
  v_ticket public.show_ticket_types%rowtype;
  v_hotel public.show_hotels%rowtype;
  v_stop public.show_bus_stops%rowtype;
  v_extra public.show_extras%rowtype;
  v_extra_line jsonb;
  v_extra_ids uuid[] := '{}';
  v_locations text[];
  v_lock bigint;
  v_pax bigint;
  v_show_pax bigint;
  v_bus_pax bigint;
  v_bus_seats integer;
  v_transport_available boolean;
  v_today date := (pg_catalog.timezone('UTC', pg_catalog.now()))::date;
begin
  -- Counts after a contended advisory lock need fresh statement snapshots.
  -- PostgREST's normal READ COMMITTED transaction provides those; reject callers
  -- with a repeatable snapshot rather than silently allowing stale capacity.
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_PARTNER_BOOKING_INVALID';
  end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_PARTNER_LINK_INVALID';
  end if;
  if p_booking is null or pg_catalog.jsonb_typeof(p_booking) <> 'object' then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_PARTNER_BOOKING_INVALID';
  end if;
  -- Explicit creation-only contract. Do not admit cancellation, invoice, import,
  -- attendance or other privileged fields added to show_bookings in the future.
  if p_booking - array[
    'id','business_id','booking_ref','show_date','guest_name','guest_mobile','guest_email',
    'hotel_id','hotel_name','transport_required','pickup_kind','private_accommodation','private_zone',
    'pickup_stop_id','pickup_stop_name','pickup_time','dietary_required','dietary_notes',
    'supplier_id','supplier_name','billing_mode','product_id','ticket_type_id','ticket_type_name',
    'show_name','island','adults','children','infants','total_cost','deposit_amount','balance_remaining',
    'nett_total','adult_nett_total','child_nett_total','infant_nett_total','supplier_ticket_number',
    'office_comments','office_only_comments','sales_channel','payment_method','custom_answers',
    'attendees','payment_status','extras_snapshot','pricing_snapshot','created_by','updated_by','updated_at'
  ]::text[] <> '{}'::jsonb then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_PARTNER_BOOKING_INVALID';
  end if;
  -- The builder's placeholder author is not a UUID. Attribution is always set
  -- here, even if a server caller accidentally forwards that placeholder.
  v_booking := pg_catalog.jsonb_populate_record(null::public.show_bookings,
    p_booking - array['created_by','updated_by','updated_at']::text[]);
  if v_booking.business_id is null or v_booking.product_id is null
    or nullif(pg_catalog.btrim(v_booking.island),'') is null
    or v_booking.show_date is null or (p_booking->>'show_date') !~ '^\d{4}-\d{2}-\d{2}$'
    or nullif(pg_catalog.btrim(v_booking.guest_name),'') is null
    or nullif(pg_catalog.btrim(v_booking.booking_ref),'') is null
    or v_booking.adults is null or v_booking.children is null or v_booking.infants is null
    or v_booking.adults < 0 or v_booking.children < 0 or v_booking.infants < 0
    or v_booking.transport_required is null then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_PARTNER_BOOKING_INVALID';
  end if;
  v_pax := v_booking.adults::bigint + v_booking.children::bigint + v_booking.infants::bigint;
  if v_pax < 1 then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_PARTNER_BOOKING_INVALID';
  end if;

  -- EXACT keys and ascending order used by show_ops_guard_partner_capacity.
  -- Both locks are necessary: the bus is shared by products on an island, and
  -- the show's capacity includes bookings whose historic island labels differ.
  for v_lock in
    select distinct k from pg_catalog.unnest(array[
      pg_catalog.hashtextextended(v_booking.business_id::text || '/' || v_booking.island || '/' || v_booking.show_date::text, 0),
      pg_catalog.hashtextextended('product/' || v_booking.business_id::text || '/' || v_booking.product_id::text || '/' || v_booking.show_date::text, 0)
    ]) as keys(k) order by k
  loop
    perform pg_catalog.pg_advisory_xact_lock(v_lock);
  end loop;

  -- Revalidate AFTER waiting, and retain share locks until the insert commits:
  -- concurrent token rotation, archiving or catalogue edits cannot slip between
  -- checking these rows and booking. Never infer service access from a JWT claim.
  select * into v_supplier from public.show_suppliers s
    where s.booking_token = p_token and s.active for share;
  if not found or v_supplier.id is distinct from v_booking.supplier_id
    or v_supplier.business_id is distinct from v_booking.business_id then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_PARTNER_LINK_INVALID';
  end if;
  perform 1 from public.businesses b
    where b.id = v_supplier.business_id and b.show_ops_enabled for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_PARTNER_LINK_INVALID';
  end if;
  select * into v_product from public.show_products p
    where p.id = v_booking.product_id and p.business_id = v_supplier.business_id and p.active for share;
  if not found or v_product.island is distinct from v_booking.island then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_PRODUCT_UNAVAILABLE';
  end if;
  -- Same location semantics as partnerSellsOnIsland: comma list; empty/ALL is all.
  select coalesce(pg_catalog.array_agg(pg_catalog.btrim(loc)), '{}'::text[]) into v_locations
    from pg_catalog.unnest(pg_catalog.string_to_array(coalesce(v_supplier.island,''),',')) loc
    where pg_catalog.btrim(loc) <> '';
  if pg_catalog.cardinality(v_locations) > 0
    and not v_booking.island = any(v_locations)
    and not exists (select 1 from pg_catalog.unnest(v_locations) loc where pg_catalog.upper(loc) = 'ALL') then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_PARTNER_LOCATION_INVALID';
  end if;

  -- Match showOpsRunNights/loadBookedDatesByProduct: UTC, next 12 months,
  -- scheduled weekdays OR an existing, non-cancelled night of this same show.
  -- JSON access fails closed if the legacy run_weekdays column is absent.
  if v_booking.show_date < v_today or v_booking.show_date > (v_today + interval '12 months')::date
    or (not coalesce((pg_catalog.to_jsonb(v_product)->'run_weekdays') @>
        pg_catalog.jsonb_build_array(extract(dow from v_booking.show_date)::integer), false)
      and not exists (select 1 from public.show_bookings b
        where b.business_id = v_booking.business_id and b.product_id = v_booking.product_id
          and b.island = v_booking.island and b.show_date = v_booking.show_date and b.cancelled_at is null)) then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_DATE_UNAVAILABLE';
  end if;
  perform 1 from public.show_night_closes c
    where c.business_id = v_booking.business_id and c.show_date = v_booking.show_date
      and c.island = v_booking.island and c.close_kind = 'full'
      and (c.product_id is null or c.product_id = v_booking.product_id) for share;
  if found then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_NIGHT_CLOSED';
  end if;

  v_transport_available := v_product.transport_available;
  if v_booking.ticket_type_id is not null then
    select * into v_ticket from public.show_ticket_types tt
      where tt.id = v_booking.ticket_type_id and tt.business_id = v_booking.business_id
        and tt.product_id = v_booking.product_id and tt.active for share;
    if not found then
      raise exception using errcode = 'P0001', message = 'SHOW_OPS_REFERENCE_INVALID';
    end if;
    v_transport_available := v_ticket.transport_available;
  end if;
  if v_booking.transport_required and not v_transport_available then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_PRODUCT_UNAVAILABLE';
  end if;
  if v_booking.hotel_id is not null then
    select * into v_hotel from public.show_hotels h
      where h.id = v_booking.hotel_id and h.business_id = v_booking.business_id
        and h.island = v_booking.island and h.active for share;
    if not found then
      raise exception using errcode = 'P0001', message = 'SHOW_OPS_REFERENCE_INVALID';
    end if;
    v_booking.hotel_name := v_hotel.name;
  end if;
  if v_booking.pickup_kind is null or v_booking.pickup_kind not in ('bus','private','own_way')
    or (v_booking.pickup_kind = 'bus') is distinct from v_booking.transport_required
    or (v_booking.transport_required and v_booking.pickup_stop_id is null)
    or (not v_booking.transport_required and v_booking.pickup_stop_id is not null) then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_REFERENCE_INVALID';
  end if;
  if v_booking.pickup_stop_id is not null then
    select * into v_stop from public.show_bus_stops s
      where s.id = v_booking.pickup_stop_id and s.business_id = v_booking.business_id
        and s.island = v_booking.island and s.active for share;
    if not found then
      raise exception using errcode = 'P0001', message = 'SHOW_OPS_REFERENCE_INVALID';
    end if;
    v_booking.pickup_time := v_stop.pickup_time;
  end if;
  v_booking.extras_snapshot := coalesce(v_booking.extras_snapshot, '[]'::jsonb);
  if pg_catalog.jsonb_typeof(v_booking.extras_snapshot) <> 'array'
    or pg_catalog.jsonb_array_length(v_booking.extras_snapshot) > 50 then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_REFERENCE_INVALID';
  end if;
  for v_extra_line in select value from pg_catalog.jsonb_array_elements(v_booking.extras_snapshot) loop
    select * into v_extra from public.show_extras e
      where e.id = (v_extra_line->>'id')::uuid and e.business_id = v_booking.business_id
        and e.product_id = v_booking.product_id and e.active for share;
    if not found or v_extra.id = any(v_extra_ids) then
      raise exception using errcode = 'P0001', message = 'SHOW_OPS_REFERENCE_INVALID';
    end if;
    v_extra_ids := pg_catalog.array_append(v_extra_ids, v_extra.id);
  end loop;

  -- Preserve seller capacity semantics: infants count, cancellations do not;
  -- NULL show capacity or absent/NULL bus capacity is not a configured limit.
  select
    coalesce(sum(greatest(0,b.adults)::bigint + greatest(0,b.children)::bigint + greatest(0,b.infants)::bigint)
      filter (where b.product_id = v_booking.product_id), 0),
    coalesce(sum(greatest(0,b.adults)::bigint + greatest(0,b.children)::bigint + greatest(0,b.infants)::bigint)
      filter (where b.transport_required and b.island = v_booking.island), 0)
    into v_show_pax, v_bus_pax from public.show_bookings b
    where b.business_id = v_booking.business_id and b.show_date = v_booking.show_date
      and (b.product_id = v_booking.product_id or b.island = v_booking.island)
      and b.cancelled_at is null;
  if v_product.capacity is not null and v_show_pax + v_pax > v_product.capacity then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_SHOW_FULL';
  end if;
  if v_booking.transport_required then
    select o.seats_ordered into v_bus_seats from public.show_bus_orders o
      where o.business_id = v_booking.business_id and o.island = v_booking.island
        and o.show_date = v_booking.show_date for share;
    if v_bus_seats is not null and v_bus_pax + v_pax > v_bus_seats then
      raise exception using errcode = 'P0001', message = 'SHOW_OPS_BUS_FULL';
    end if;
  end if;

  -- Explicit columns retain table defaults for attendance, ticket tokens, etc.
  v_booking.id := coalesce(v_booking.id, pg_catalog.gen_random_uuid());
  insert into public.show_bookings (
    id,business_id,booking_ref,show_date,guest_name,guest_mobile,guest_email,
    hotel_id,hotel_name,transport_required,pickup_kind,private_accommodation,private_zone,
    pickup_stop_id,pickup_stop_name,pickup_time,dietary_required,dietary_notes,
    supplier_id,supplier_name,billing_mode,product_id,ticket_type_id,ticket_type_name,
    show_name,island,adults,children,infants,total_cost,deposit_amount,balance_remaining,
    nett_total,adult_nett_total,child_nett_total,infant_nett_total,supplier_ticket_number,
    office_comments,office_only_comments,sales_channel,payment_method,custom_answers,
    attendees,payment_status,extras_snapshot,pricing_snapshot,created_by,updated_by,updated_at
  ) values (
    v_booking.id,v_supplier.business_id,v_booking.booking_ref,v_booking.show_date,v_booking.guest_name,v_booking.guest_mobile,v_booking.guest_email,
    v_booking.hotel_id,v_booking.hotel_name,v_booking.transport_required,v_booking.pickup_kind,v_booking.private_accommodation,v_booking.private_zone,
    v_booking.pickup_stop_id,v_booking.pickup_stop_name,v_booking.pickup_time,coalesce(v_booking.dietary_required,false),v_booking.dietary_notes,
    v_supplier.id,v_supplier.name,v_booking.billing_mode,v_product.id,v_booking.ticket_type_id,v_ticket.name,
    case when v_booking.ticket_type_id is not null then v_product.name || U&' \00B7 ' || v_ticket.name else v_product.name end,
    v_product.island,v_booking.adults,v_booking.children,v_booking.infants,v_booking.total_cost,v_booking.deposit_amount,v_booking.balance_remaining,
    v_booking.nett_total,v_booking.adult_nett_total,v_booking.child_nett_total,v_booking.infant_nett_total,v_booking.supplier_ticket_number,
    v_booking.office_comments,'Booked by ' || v_supplier.name || ' via their partner link',v_supplier.partner_type,v_booking.payment_method,coalesce(v_booking.custom_answers,'{}'::jsonb),
    v_booking.attendees,v_booking.payment_status,v_booking.extras_snapshot,v_booking.pricing_snapshot,null,null,pg_catalog.now()
  );
  return v_booking.id;
end;
$$;

-- Only the invoker wrapper is in the API-exposed schema. Explicit revokes cover
-- Supabase default grants as well as PostgreSQL's implicit PUBLIC EXECUTE.
create or replace function public.show_ops_create_partner_link_booking(p_token text, p_booking jsonb)
returns uuid
language sql volatile security invoker set search_path = ''
as $$
  select private.show_ops_create_partner_link_booking(p_token, p_booking);
$$;
revoke all on function private.show_ops_create_partner_link_booking(text,jsonb) from public, anon, authenticated;
revoke all on function public.show_ops_create_partner_link_booking(text,jsonb) from public, anon, authenticated;
grant execute on function private.show_ops_create_partner_link_booking(text,jsonb) to service_role;
grant execute on function public.show_ops_create_partner_link_booking(text,jsonb) to service_role;

commit;
