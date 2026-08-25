-- Seller / partner portals: isolated logins per supplier, not office access.

alter table public.show_ops_members
  drop constraint if exists show_ops_members_role_check;

alter table public.show_ops_members
  add constraint show_ops_members_role_check
  check (role in ('booker', 'office', 'finance', 'admin', 'seller'));

alter table public.show_ops_members
  add column if not exists supplier_id uuid references public.show_suppliers (id) on delete cascade;

create index if not exists show_ops_members_supplier_idx
  on public.show_ops_members (business_id, supplier_id)
  where role = 'seller';

-- Staff only (owner + office roles). Sellers must NOT inherit this.
create or replace function public.show_ops_can_access(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.owner_id = (select auth.uid())
  )
  or exists (
    select 1 from public.show_ops_members m
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and m.role in ('booker', 'office', 'finance', 'admin')
  );
$$;

create or replace function public.show_ops_seller_supplier_id(p_business_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.supplier_id
  from public.show_ops_members m
  where m.business_id = p_business_id
    and m.user_id = (select auth.uid())
    and m.role = 'seller'
    and m.supplier_id is not null
  limit 1;
$$;

revoke all on function public.show_ops_seller_supplier_id(uuid) from public;
grant execute on function public.show_ops_seller_supplier_id(uuid) to authenticated;

-- Booking refs: staff or seller of that business
create or replace function public.show_ops_next_booking_ref(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  if not public.show_ops_can_access(p_business_id)
     and public.show_ops_seller_supplier_id(p_business_id) is null then
    raise exception 'not allowed';
  end if;
  n := nextval('public.show_booking_ref_seq');
  return 'SO-' || to_char(now() at time zone 'utc', 'YYMMDD') || '-' || lpad(n::text, 5, '0');
end;
$$;

-- Members: staff see all; a seller sees only their own row
drop policy if exists show_ops_members_select on public.show_ops_members;
create policy show_ops_members_select on public.show_ops_members
  for select to authenticated
  using (
    public.show_ops_can_access(business_id)
    or user_id = (select auth.uid())
  );

-- Seller read of catalogue (needed to book)
drop policy if exists show_products_seller_sel on public.show_products;
create policy show_products_seller_sel on public.show_products
  for select to authenticated
  using (public.show_ops_seller_supplier_id(business_id) is not null);

drop policy if exists show_hotels_seller_sel on public.show_hotels;
create policy show_hotels_seller_sel on public.show_hotels
  for select to authenticated
  using (public.show_ops_seller_supplier_id(business_id) is not null);

drop policy if exists show_bus_stops_seller_sel on public.show_bus_stops;
create policy show_bus_stops_seller_sel on public.show_bus_stops
  for select to authenticated
  using (public.show_ops_seller_supplier_id(business_id) is not null);

drop policy if exists show_suppliers_seller_sel on public.show_suppliers;
create policy show_suppliers_seller_sel on public.show_suppliers
  for select to authenticated
  using (id = public.show_ops_seller_supplier_id(business_id));

-- Seller bookings: only their supplier
drop policy if exists show_bookings_seller_sel on public.show_bookings;
create policy show_bookings_seller_sel on public.show_bookings
  for select to authenticated
  using (
    supplier_id is not null
    and supplier_id = public.show_ops_seller_supplier_id(business_id)
  );

drop policy if exists show_bookings_seller_ins on public.show_bookings;
create policy show_bookings_seller_ins on public.show_bookings
  for insert to authenticated
  with check (
    supplier_id is not null
    and supplier_id = public.show_ops_seller_supplier_id(business_id)
  );

drop policy if exists show_bookings_seller_upd on public.show_bookings;
create policy show_bookings_seller_upd on public.show_bookings
  for update to authenticated
  using (supplier_id = public.show_ops_seller_supplier_id(business_id))
  with check (supplier_id = public.show_ops_seller_supplier_id(business_id));

-- Members (staff + sellers) can read the tenant they belong to (branding / config).
drop policy if exists businesses_select_show_ops_member on public.businesses;
create policy businesses_select_show_ops_member
on public.businesses for select to authenticated
using (
  exists (
    select 1 from public.show_ops_members m
    where m.business_id = businesses.id
      and m.user_id = (select auth.uid())
  )
);
