-- Show-night part/full close (stop-sale emails) + sellers cannot cancel.

create table if not exists public.show_night_closes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  show_date date not null,
  island text not null,
  product_id uuid references public.show_products (id) on delete cascade,
  close_kind text not null check (close_kind in ('part', 'full')),
  note text,
  emailed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists show_night_closes_unique
  on public.show_night_closes (
    business_id,
    show_date,
    island,
    coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists show_night_closes_business_date_idx
  on public.show_night_closes (business_id, show_date);

alter table public.show_night_closes enable row level security;

drop policy if exists show_night_closes_sel on public.show_night_closes;
create policy show_night_closes_sel on public.show_night_closes
  for select to authenticated
  using (
    public.show_ops_can_access(business_id)
    or public.show_ops_seller_supplier_id(business_id) is not null
  );

drop policy if exists show_night_closes_w on public.show_night_closes;
create policy show_night_closes_w on public.show_night_closes
  for all to authenticated
  using (public.show_ops_can_access(business_id))
  with check (public.show_ops_can_access(business_id));

grant select, insert, update, delete on public.show_night_closes to authenticated;

-- Partners can see bus orders (seats left) but cannot write them.
drop policy if exists show_bus_orders_seller_sel on public.show_bus_orders;
create policy show_bus_orders_seller_sel on public.show_bus_orders
  for select to authenticated
  using (public.show_ops_seller_supplier_id(business_id) is not null);

-- Sellers may update their own live bookings, but cannot cancel.
drop policy if exists show_bookings_seller_upd on public.show_bookings;
create policy show_bookings_seller_upd on public.show_bookings
  for update to authenticated
  using (
    supplier_id = public.show_ops_seller_supplier_id(business_id)
    and cancelled_at is null
  )
  with check (
    supplier_id = public.show_ops_seller_supplier_id(business_id)
    and cancelled_at is null
  );
