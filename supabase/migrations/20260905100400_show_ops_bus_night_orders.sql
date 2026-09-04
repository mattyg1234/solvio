-- Show Ops · 5 Sept 2026 · Joel's notes
--
-- Tonight's coach running order. The bus run sheet lets the office drag stops
-- into the order the driver will actually do them; until now that lived in the
-- browser only and vanished on refresh. One row per island per night. Clearing
-- the row puts the sheet back on printed pick-up times. The permanent stop
-- order (show_bus_stops.sort_order) is untouched.

create table if not exists public.show_bus_night_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  show_date date not null,
  island text not null,
  stop_ids uuid[] not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (business_id, show_date, island)
);

create index if not exists show_bus_night_orders_business_date_idx
  on public.show_bus_night_orders (business_id, show_date);

alter table public.show_bus_night_orders enable row level security;

drop policy if exists show_bus_night_orders_sel on public.show_bus_night_orders;
create policy show_bus_night_orders_sel on public.show_bus_night_orders
  for select to authenticated
  using (public.show_ops_can_access(business_id));

drop policy if exists show_bus_night_orders_w on public.show_bus_night_orders;
create policy show_bus_night_orders_w on public.show_bus_night_orders
  for all to authenticated
  using (public.show_ops_can_access(business_id))
  with check (public.show_ops_can_access(business_id));

grant select, insert, update, delete on public.show_bus_night_orders to authenticated;

comment on table public.show_bus_night_orders is
  'Saved drag order of pick-up stops for one island on one night (bus run sheet). Absent = printed pick-up times.';
