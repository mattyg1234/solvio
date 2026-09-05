-- Joel: catalogue administration is senior-only; seller saves cannot overbook.
-- Catalogue SELECT remains available to booking staff and sellers via existing RLS.
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.show_ops_can_manage_catalogue(p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.owner_id = (select auth.uid())
  ) or exists (
    select 1 from public.show_ops_members m
    where m.business_id = p_business_id and m.user_id = (select auth.uid()) and m.role = 'admin'
  );
$$;
revoke all on function private.show_ops_can_manage_catalogue(uuid) from public;
grant execute on function private.show_ops_can_manage_catalogue(uuid) to authenticated;

-- Restrictive policies also constrain the legacy permissive FOR ALL policies.
do $$
declare t text;
begin
  foreach t in array array['show_products','show_suppliers','show_hotels','show_bus_stops','show_supplier_rates'] loop
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (private.show_ops_can_manage_catalogue(business_id))', t || '_senior_insert', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (private.show_ops_can_manage_catalogue(business_id)) with check (private.show_ops_can_manage_catalogue(business_id))', t || '_senior_update', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (private.show_ops_can_manage_catalogue(business_id))', t || '_senior_delete', t);
  end loop;
end $$;

-- Private definer trigger can count other partners' bookings without exposing them.
-- All capacity-changing writers take the same night lock, including staff overrides.
create or replace function private.show_ops_guard_partner_capacity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_lock bigint;
  v_new_lock bigint;
  v_old_lock bigint;
  v_new_product_lock bigint;
  v_old_product_lock bigint;
  v_supplier uuid;
  v_product public.show_products%rowtype;
  v_pax bigint;
  v_show_pax bigint;
  v_bus_pax bigint;
  v_bus_seats integer;
begin
  if TG_OP = 'UPDATE' then
    if row(new.business_id,new.product_id,new.island,new.show_date,new.adults,new.children,new.infants,new.transport_required,new.cancelled_at)
       is not distinct from
       row(old.business_id,old.product_id,old.island,old.show_date,old.adults,old.children,old.infants,old.transport_required,old.cancelled_at) then
      return new;
    end if;
  end if;

  -- Sort old/new lock keys so moving bookings across nights cannot invert lock order.
  v_new_lock := pg_catalog.hashtextextended(new.business_id::text || '/' || new.island || '/' || new.show_date::text, 0);
  v_new_product_lock := pg_catalog.hashtextextended('product/' || new.business_id::text || '/' || new.product_id::text || '/' || new.show_date::text, 0);
  if TG_OP = 'UPDATE' then
    v_old_product_lock := pg_catalog.hashtextextended('product/' || old.business_id::text || '/' || old.product_id::text || '/' || old.show_date::text, 0);
    v_old_lock := pg_catalog.hashtextextended(old.business_id::text || '/' || old.island || '/' || old.show_date::text, 0);
  end if;
  for v_lock in select distinct k from unnest(array[v_new_lock,v_old_lock,v_new_product_lock,v_old_product_lock]) as keys(k) where k is not null order by k loop
    perform pg_catalog.pg_advisory_xact_lock(v_lock);
  end loop;

  v_supplier := public.show_ops_seller_supplier_id(new.business_id);
  -- Staff keep their deliberate override; trusted jobs have no seller identity.
  if v_supplier is null or public.show_ops_can_access(new.business_id) then
    return new;
  end if;

  if new.supplier_id is distinct from v_supplier or new.cancelled_at is not null then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_PARTNER_BOOKING_INVALID';
  end if;
  select * into v_product from public.show_products p
    where p.id = new.product_id and p.business_id = new.business_id;
  if not found or not v_product.active or new.island is distinct from v_product.island then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_PRODUCT_UNAVAILABLE';
  end if;

  if exists (select 1 from public.show_night_closes c
    where c.business_id = new.business_id and c.show_date = new.show_date and c.island = new.island
      and c.close_kind = 'full' and (c.product_id is null or c.product_id = new.product_id)) then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_NIGHT_CLOSED';
  end if;

  -- Matches the existing night-load display: adults + children + infants.
  v_pax := greatest(0,new.adults)::bigint + greatest(0,new.children)::bigint + greatest(0,new.infants)::bigint;
  select
    coalesce(sum(greatest(0,b.adults)::bigint + greatest(0,b.children)::bigint + greatest(0,b.infants)::bigint)
      filter (where b.product_id = new.product_id),0),
    coalesce(sum(greatest(0,b.adults)::bigint + greatest(0,b.children)::bigint + greatest(0,b.infants)::bigint)
      filter (where b.transport_required and b.island = new.island),0)
    into v_show_pax,v_bus_pax
    from public.show_bookings b
    where b.business_id = new.business_id and b.show_date = new.show_date
      and (b.product_id = new.product_id or b.island = new.island)
      and b.cancelled_at is null and b.id is distinct from new.id;

  if v_product.capacity is not null and v_show_pax + v_pax > v_product.capacity then
    raise exception using errcode = 'P0001', message = 'SHOW_OPS_SHOW_FULL';
  end if;
  if new.transport_required then
    select o.seats_ordered into v_bus_seats from public.show_bus_orders o
      where o.business_id = new.business_id and o.island = new.island and o.show_date = new.show_date;
    if v_bus_seats is not null and v_bus_pax + v_pax > v_bus_seats then
      raise exception using errcode = 'P0001', message = 'SHOW_OPS_BUS_FULL';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.show_ops_guard_partner_capacity() from public;
create trigger show_ops_partner_capacity before insert or update on public.show_bookings
  for each row execute function private.show_ops_guard_partner_capacity();
