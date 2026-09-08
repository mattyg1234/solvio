-- RELEASE BUNDLE 9 Sept 2026 — paste into the Supabase SQL editor for project aasfahcrdcoqxwnlkdnv and Run once.
-- Order: snapshot → B02 partner-link RPC → B01 payments → B03 permissions → Holded → opening-balance (no-op after B01) → history.

-- 0. Recovery snapshot (20 MB). Keep for a week, then: drop table private.snap_20260909_show_bookings, private.snap_20260909_show_booking_payments;
create schema if not exists private;
create table if not exists private.snap_20260909_show_bookings as select * from public.show_bookings;
create table if not exists private.snap_20260909_show_booking_payments as select * from public.show_booking_payments;

-- ===== 20260908221151_show_ops_partner_link_capacity.sql =====
begin;
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
commit;

-- ===== 20260908221214_show_ops_opening_paid_balance.sql =====
begin;

-- Audit B01: preserve imported receipts and serialize every payment writer.
-- This builds on the existing 'import' ledger convention. It does not classify
-- imported amounts as new bank/cash receipts or infer ambiguous old ledgers.
create schema if not exists private;

alter table public.show_booking_payments drop constraint if exists show_booking_payments_method_check;
alter table public.show_booking_payments add constraint show_booking_payments_method_check
  check (method in ('cash','card','transfer','stripe','import','other'));

create unique index show_booking_payments_one_opening
  on public.show_booking_payments(booking_id) where method='import';

create or replace function private.show_ops_ensure_opening(b public.show_bookings)
returns numeric language plpgsql security definer set search_path='' as $$
declare v_count bigint; v_opening bigint; v_paid numeric; v_recorded numeric;
begin
  select count(*),count(*) filter(where method='import'),coalesce(sum(amount),0)
    into v_count,v_opening,v_paid from public.show_booking_payments where booking_id=b.id;
  if b.legacy_id is not null and b.billing_mode='deposit' then
    if v_count>0 and v_opening=0 then
      raise exception 'SHOW_OPS_OPENING_BALANCE_RECONCILIATION_REQUIRED';
    end if;
    if v_count=0 then
      v_recorded := round(b.total_cost-b.balance_remaining,2);
      if v_recorded<0 or v_recorded::text in ('NaN','Infinity','-Infinity') then
        raise exception 'SHOW_OPS_OPENING_BALANCE_RECONCILIATION_REQUIRED';
      end if;
      insert into public.show_booking_payments(business_id,booking_id,amount,method,paid_at,note)
        values(b.business_id,b.id,v_recorded,'import',b.created_at,
          'Opening balance imported from Lanzasoft (paid before Solvio)');
      v_paid := v_recorded;
    end if;
  end if;
  return v_paid;
end;
$$;
revoke all on function private.show_ops_ensure_opening(public.show_bookings) from public,authenticated;

create or replace function private.show_ops_guard_payment_insert()
returns trigger language plpgsql security definer set search_path='' as $$
declare b public.show_bookings%rowtype; v_paid numeric; v_external boolean;
begin
  select * into b from public.show_bookings where id=new.booking_id for update;
  if not found or b.business_id is distinct from new.business_id then
    raise exception 'SHOW_OPS_PAYMENT_BOOKING_MISMATCH';
  end if;
  if new.amount is null or new.amount::text in ('NaN','Infinity','-Infinity') then
    raise exception 'SHOW_OPS_INVALID_PAYMENT_AMOUNT';
  end if;
  if new.method='import' then
    -- A private nested trigger may materialize the existing opening basis.
    -- Browser clients may never manufacture or replace imported receipts.
    if current_setting('role',true) in ('authenticated','anon') and pg_trigger_depth()<2 then
      raise exception 'SHOW_OPS_IMPORT_SERVICE_ONLY';
    end if;
    if b.legacy_id is null or b.billing_mode<>'deposit' or new.amount<0
      or new.amount is distinct from round(b.total_cost-b.balance_remaining,2)
      or exists(select 1 from public.show_booking_payments where booking_id=b.id) then
      raise exception 'SHOW_OPS_OPENING_BALANCE_RECONCILIATION_REQUIRED';
    end if;
    return new;
  end if;
  if new.amount<=0 then raise exception 'SHOW_OPS_INVALID_PAYMENT_AMOUNT'; end if;
  -- A real provider receipt must remain recorded even if an old checkout link
  -- overpaid or a cancellation raced its arrival. Browser callers cannot use
  -- this exception to bypass the amount check.
  v_external := new.method='stripe' and current_setting('role',true) not in ('authenticated','anon');
  if b.billing_mode<>'deposit' or (b.cancelled_at is not null and not v_external) then
    raise exception 'SHOW_OPS_BOOKING_NOT_COLLECTIBLE';
  end if;
  v_paid := private.show_ops_ensure_opening(b);
  if not v_external and new.amount > greatest(0,b.total_cost-v_paid) then
    raise exception 'SHOW_OPS_PAYMENT_EXCEEDS_OUTSTANDING';
  end if;
  return new;
end;
$$;
revoke all on function private.show_ops_guard_payment_insert() from public,authenticated;
create trigger show_ops_payment_insert_guard before insert on public.show_booking_payments
  for each row execute function private.show_ops_guard_payment_insert();

create or replace function private.show_ops_refresh_payment_summary()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_paid numeric;
begin
  -- Import rows already describe the current summary. Skipping this update also
  -- permits a booking BEFORE UPDATE trigger to materialize its old paid basis.
  if new.method='import' then return new; end if;
  select coalesce(sum(amount),0) into v_paid from public.show_booking_payments where booking_id=new.booking_id;
  update public.show_bookings set
    balance_remaining=round(total_cost-v_paid,2),
    payment_status=case when total_cost-v_paid<=0 then 'paid' when v_paid>0 then 'partial' else 'unpaid' end,
    updated_at=clock_timestamp()
    where id=new.booking_id and business_id=new.business_id;
  return new;
end;
$$;
revoke all on function private.show_ops_refresh_payment_summary() from public,authenticated;
create trigger show_ops_payment_summary after insert on public.show_booking_payments
  for each row execute function private.show_ops_refresh_payment_summary();

create or replace function private.show_ops_guard_booking_payment_summary()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_paid numeric;
begin
  if row(new.total_cost,new.balance_remaining,new.payment_status,new.billing_mode)
     is not distinct from row(old.total_cost,old.balance_remaining,old.payment_status,old.billing_mode) then
    return new;
  end if;
  if old.billing_mode='deposit' or new.billing_mode='deposit' then
    v_paid := private.show_ops_ensure_opening(old);
    if new.billing_mode='invoice' and v_paid<>0 then
      raise exception 'SHOW_OPS_PAID_BOOKING_CANNOT_CHANGE_BILLING_MODE';
    end if;
    if new.billing_mode='deposit' then
      new.balance_remaining := round(new.total_cost-v_paid,2);
      new.payment_status := case when new.balance_remaining<=0 then 'paid' when v_paid>0 then 'partial' else 'unpaid' end;
    else
      new.balance_remaining := 0;
      new.payment_status := 'n_a';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.show_ops_guard_booking_payment_summary() from public,authenticated;
create trigger show_ops_booking_payment_summary before update on public.show_bookings
  for each row execute function private.show_ops_guard_booking_payment_summary();

-- Snapshot only unambiguous imported rows without ANY existing ledger entry.
-- Include zero openings so later receipts cannot be confused with missing basis.
-- Any legacy rows with payments but no opening remain blocked for reconciliation.
insert into public.show_booking_payments(business_id,booking_id,amount,method,paid_at,note)
select b.business_id,b.id,round(b.total_cost-b.balance_remaining,2),'import',b.created_at,
  'Opening balance imported from Lanzasoft (paid before Solvio)'
from public.show_bookings b
where b.billing_mode='deposit' and b.legacy_id is not null
  and b.total_cost::text not in ('NaN','Infinity','-Infinity')
  and b.balance_remaining::text not in ('NaN','Infinity','-Infinity')
  and b.total_cost-b.balance_remaining>=0
  and not exists(select 1 from public.show_booking_payments p where p.booking_id=b.id);

commit;

-- ===== 20260908221252_show_ops_staff_action_permissions.sql =====
begin;

-- B03 / DB3: role floors AND current page grants, in addition to existing RLS.
-- No permissive tenant/island/seller policy is replaced. NULL and empty page
-- arrays retain nav.ts role defaults; empty island arrays still mean no access.
create or replace function private.show_ops_has_action(
  p_business_id uuid, p_needed text, p_pages text[]
)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  member_role text;
  pages text[];
  ranks constant text[] := array['seller','booker','office','finance','admin','owner'];
  all_pages constant text[] := array['dashboard','calendar','shows','bookings','door','invoices','partners','hotels','buses','outlook','reports','lists','settings'];
begin
  if not exists(select 1 from public.businesses b where b.id=p_business_id and b.show_ops_enabled) then
    return false;
  end if;
  if exists(select 1 from public.businesses b where b.id=p_business_id and b.owner_id=(select auth.uid())) then
    member_role := 'owner';
  else
    select m.role,m.allowed_pages into member_role,pages from public.show_ops_members m
    where m.business_id=p_business_id and m.user_id=(select auth.uid());
  end if;
  if member_role is null or member_role='seller' or array_position(ranks,p_needed) is null
     or coalesce(array_position(ranks,member_role),0)<array_position(ranks,p_needed) then
    return false;
  end if;
  if coalesce(cardinality(pages),0)=0 then
    pages := case member_role
      when 'booker' then array['dashboard','calendar','bookings','door','lists']
      when 'office' then array['dashboard','calendar','bookings','door','lists','buses','outlook','reports']
      when 'finance' then array['dashboard','calendar','bookings','door','lists','buses','outlook','reports','invoices']
      when 'admin' then all_pages
      when 'owner' then all_pages
      else '{}'::text[] end;
  end if;
  pages := array_replace(pages,'stats','reports');
  return exists(select 1 from unnest(p_pages) wanted(page)
    where page=any(all_pages) and page=any(pages)
      and (page not in ('shows','partners','hotels','settings') or member_role in ('admin','owner'))
      and (page<>'invoices' or member_role in ('finance','admin','owner')));
end;
$$;
revoke all on function private.show_ops_has_action(uuid,text,text[]) from public;
grant execute on function private.show_ops_has_action(uuid,text,text[]) to authenticated;

-- Invoice data is finance-only even if a legacy FOR ALL policy grants access.
create policy show_invoices_action_scope on public.show_invoices as restrictive for all to authenticated
using(private.show_ops_has_action(business_id,'finance',array['invoices']))
with check(private.show_ops_has_action(business_id,'finance',array['invoices']));
create policy show_invoice_lines_action_scope on public.show_invoice_lines as restrictive for all to authenticated
using(private.show_ops_has_action(business_id,'finance',array['invoices']))
with check(private.show_ops_has_action(business_id,'finance',array['invoices']));

-- Keep catalogue reads used to price bookings. Mutations need the matching tab.
-- Some legacy catalogue tables are absent from the repository baseline; only
-- attach policies where they exist, as the existing island migration does.
do $$ declare t text; pages text[]; op text; predicate text; begin
  foreach t in array array['show_products','show_ticket_types','show_extras','show_suppliers','show_supplier_rates','show_rate_prices','show_hotels','show_bus_stops'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    pages := case
      when t in ('show_products','show_ticket_types','show_extras') then array['shows']
      when t in ('show_suppliers','show_supplier_rates') then array['partners']
      when t='show_rate_prices' then array['shows','partners']
      else array['hotels'] end;
    predicate := format('private.show_ops_has_action(business_id,''admin'',%L::text[])',pages);
    foreach op in array array['insert','update','delete'] loop
      execute format('create policy %I on public.%I as restrictive for %s to authenticated %s',
        t||'_action_'||op,t,op,case op
          when 'insert' then 'with check('||predicate||')'
          when 'update' then 'using('||predicate||') with check('||predicate||')'
          else 'using('||predicate||')' end);
    end loop;
  end loop;
end $$;

-- Manual receipts: office + bookings. Door receipts: booker + door/lists,
-- cash/card only. Import/Stripe receipts belong to trusted payment integrations.
-- The payment worker owns validation, locking, opening imports and summaries.
create policy show_booking_payments_action_insert on public.show_booking_payments as restrictive for insert to authenticated
with check(
  (method in ('cash','card','transfer','other') and private.show_ops_has_action(business_id,'office',array['bookings']))
  or (method in ('cash','card') and private.show_ops_has_action(business_id,'booker',array['door','lists']))
);
create policy show_booking_payments_action_update on public.show_booking_payments as restrictive for update to authenticated
using(false) with check(false);
create policy show_booking_payments_action_delete on public.show_booking_payments as restrictive for delete to authenticated
using(false);

-- Preserve the existing seller INSERT path, never grant seller raw row reads
-- or updates. Membership/supplier/capacity/island policies still apply.
create policy show_bookings_action_insert on public.show_bookings as restrictive for insert to authenticated
with check(
  (private.show_ops_has_action(business_id,'booker',array['bookings'])
    or (not public.show_ops_can_access(business_id) and supplier_id=public.show_ops_seller_supplier_id(business_id)))
  and (invoice_id is null or private.show_ops_has_action(business_id,'finance',array['invoices']))
);
create policy show_bookings_action_update on public.show_bookings as restrictive for update to authenticated
using(
  private.show_ops_has_action(business_id,'booker',array['bookings','door','lists','buses'])
  or private.show_ops_has_action(business_id,'finance',array['invoices'])
  or private.show_ops_has_action(business_id,'admin',array['shows'])
)
with check(
  private.show_ops_has_action(business_id,'booker',array['bookings','door','lists','buses'])
  or private.show_ops_has_action(business_id,'finance',array['invoices'])
  or private.show_ops_has_action(business_id,'admin',array['shows'])
);
-- Staff cancel bookings; there is no hard-delete UI or audited receipt reversal.
-- This also prevents deleting a booking to cascade-delete its immutable ledger.
create policy show_bookings_action_delete on public.show_bookings as restrictive for delete to authenticated using(false);

create or replace function private.show_ops_guard_booking_action_columns()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  before_row jsonb := to_jsonb(old);
  after_row jsonb := to_jsonb(new);
  columns_allowed text[] := array['updated_at','updated_by'];
begin
  -- Trusted service work and migration sessions remain possible. Do not bypass
  -- based on CURRENT_USER alone: seller RPCs also execute as a definer owner.
  if (select auth.uid()) is null or current_setting('role',true)='service_role' then return new; end if;

  -- Only payment-trigger summary propagation may skip the column permissions.
  -- Trigger depth alone is insufficient: no guest, price, invoice, island or
  -- payment-method changes can ride along with this exemption.
  if pg_trigger_depth()>1
    and (after_row-array['balance_remaining','payment_status','updated_at','updated_by'])
      =(before_row-array['balance_remaining','payment_status','updated_at','updated_by'])
    and (private.show_ops_has_action(old.business_id,'office',array['bookings'])
      or private.show_ops_has_action(old.business_id,'booker',array['door','lists'])) then
    return new;
  end if;

  -- The existing seller photo RPC checks ownership/path/storage. Preserve its
  -- narrow update without opening any raw seller UPDATE policy.
  if not public.show_ops_can_access(old.business_id)
    and old.supplier_id=public.show_ops_seller_supplier_id(old.business_id)
    and old.created_by=(select auth.uid())
    and (after_row-array['no_show_proof_path','updated_at','updated_by'])
      =(before_row-array['no_show_proof_path','updated_at','updated_by']) then
    return new;
  end if;

  if new.invoice_id is distinct from old.invoice_id
    and not private.show_ops_has_action(old.business_id,'finance',array['invoices']) then
    raise exception using errcode='42501',message='Invoice changes require finance and invoices access';
  end if;
  if (after_row->'cancelled_at' is distinct from before_row->'cancelled_at'
      or after_row->'cancelled_by' is distinct from before_row->'cancelled_by'
      or after_row->'cancel_reason' is distinct from before_row->'cancel_reason')
    and not private.show_ops_has_action(old.business_id,'office',array['bookings']) then
    raise exception using errcode='42501',message='Cancellation requires office and bookings access';
  end if;
  if private.show_ops_has_action(old.business_id,'booker',array['bookings']) then return new; end if;

  if private.show_ops_has_action(old.business_id,'booker',array['door','lists']) then
    columns_allowed := columns_allowed || array['arrived_at','arrived_pax','door_pay_method','no_show','list_checked_by',
      'no_show_charge','no_show_decided_at','no_show_decided_by','no_show_proof_path'];
  end if;
  if private.show_ops_has_action(old.business_id,'booker',array['lists','buses']) then
    columns_allowed := columns_allowed || array['pickup_stop_id','pickup_stop_name','pickup_time','transport_required'];
  end if;
  if private.show_ops_has_action(old.business_id,'finance',array['invoices']) then
    columns_allowed := columns_allowed || array['invoice_id'];
  end if;
  if private.show_ops_has_action(old.business_id,'admin',array['shows'])
    and old.invoice_id is null and old.cancelled_at is null then
    columns_allowed := columns_allowed || array['show_name','ticket_type_name','pricing_snapshot','island','total_cost',
      'deposit_amount','nett_total','adult_nett_total','child_nett_total','infant_nett_total','extras_snapshot',
      'billing_mode','balance_remaining','payment_status'];
  end if;
  if (after_row-columns_allowed) is distinct from (before_row-columns_allowed) then
    raise exception using errcode='42501',message='Booking changes exceed your permitted pages';
  end if;
  return new;
end;
$$;
revoke all on function private.show_ops_guard_booking_action_columns() from public;
create trigger show_ops_action_columns before update on public.show_bookings
for each row execute function private.show_ops_guard_booking_action_columns();

commit;

-- ===== 20260908230000_show_ops_holded.sql =====
begin;
/*
 * Holded connector (accounts + Verifactu issuer).
 *
 * Each workspace stores its own Holded API token, encrypted with the server-side
 * SHOW_OPS_SECRETS_KEY. Partners remember their Holded contact id; invoice packs
 * remember the Holded document they were pushed to and the legal number Holded
 * assigns on approval.
 */

create table if not exists public.show_ops_integrations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  provider text not null check (provider in ('holded')),
  secret_ciphertext text not null,
  status text not null default 'connected' check (status in ('connected', 'error', 'disabled')),
  meta jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  last_error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, provider)
);

alter table public.show_ops_integrations enable row level security;
drop policy if exists show_ops_integrations_sel on public.show_ops_integrations;
create policy show_ops_integrations_sel on public.show_ops_integrations
  for select to authenticated using (public.show_ops_can_access(business_id));
drop policy if exists show_ops_integrations_w on public.show_ops_integrations;
create policy show_ops_integrations_w on public.show_ops_integrations
  for all to authenticated
  using (public.show_ops_can_access(business_id))
  with check (public.show_ops_can_access(business_id));

alter table public.show_suppliers
  add column if not exists holded_contact_id text;

alter table public.show_invoices
  add column if not exists holded_document_id text,
  add column if not exists holded_doc_number text,
  add column if not exists holded_status text not null default 'not_sent',
  add column if not exists holded_pushed_at timestamptz,
  add column if not exists holded_synced_at timestamptz,
  add column if not exists holded_error text;

alter table public.show_invoices drop constraint if exists show_invoices_holded_status_check;
alter table public.show_invoices
  add constraint show_invoices_holded_status_check
    check (holded_status in ('not_sent', 'draft', 'approved', 'paid', 'error'));

create index if not exists show_invoices_holded_doc_idx
  on public.show_invoices (business_id, holded_document_id)
  where holded_document_id is not null;

comment on table public.show_ops_integrations is
  'Per-workspace third-party credentials (Holded). secret_ciphertext is AES-256-GCM, key = SHOW_OPS_SECRETS_KEY env.';
comment on column public.show_invoices.holded_status is
  'not_sent | draft (in Holded, unnumbered) | approved (Holded issued legal number + Verifactu) | paid | error';
commit;

-- ===== 20260909000000_show_ops_imported_paid_opening_balance.sql =====
begin;
/*
 * Imported paid balances (audit B01).
 *
 * Bookings imported from Lanzasoft carry a paid amount on the booking row
 * (total_cost − balance_remaining) but the payment ledger has no rows for them.
 * Every path that recalculates a deposit balance sums the ledger, so a note-only
 * edit or a door payment could reset a paid booking to "owes everything".
 *
 * Fix: one opening-balance ledger row per affected booking, method 'import',
 * so the ledger and the booking agree. Idempotent — only bookings with a
 * recorded paid amount and no ledger rows are touched. Reports already filter
 * on card/stripe, so these rows never count as till takings.
 */

alter table public.show_booking_payments
  drop constraint if exists show_booking_payments_method_check;
alter table public.show_booking_payments
  add constraint show_booking_payments_method_check
  check (method in ('cash', 'card', 'transfer', 'stripe', 'import', 'other'));

insert into public.show_booking_payments (business_id, booking_id, amount, method, paid_at, note)
select
  b.business_id,
  b.id,
  round(b.total_cost - b.balance_remaining, 2),
  'import',
  coalesce(b.created_at, now()),
  'Opening balance imported from Lanzasoft (paid before Solvio)'
from public.show_bookings b
where b.billing_mode = 'deposit'
  and b.legacy_id is not null
  and round(b.total_cost - b.balance_remaining, 2) > 0
  and not exists (select 1 from public.show_booking_payments p where p.booking_id = b.id);

comment on constraint show_booking_payments_method_check on public.show_booking_payments is
  'import = opening balance carried over from the legacy system, not money taken in Solvio.';
commit;

-- ===== migration history =====
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260908221151', 'show_ops_partner_link_capacity'),
  ('20260908221214', 'show_ops_opening_paid_balance'),
  ('20260908221252', 'show_ops_staff_action_permissions'),
  ('20260908230000', 'show_ops_holded'),
  ('20260909000000', 'show_ops_imported_paid_opening_balance')
on conflict do nothing;