-- Solvio Show Ops: multi-tenant show/tour operations (MHT-first, white-label)

-- ---------------------------------------------------------------------------
-- Business columns
-- ---------------------------------------------------------------------------
alter table public.businesses
  add column if not exists show_ops_enabled boolean not null default false;

alter table public.businesses
  add column if not exists show_ops_config jsonb not null default '{}'::jsonb;

alter table public.businesses
  add column if not exists show_ops_billing_tier text not null default 'starter'
    check (show_ops_billing_tier in ('starter', 'ops', 'finance'));

alter table public.businesses
  add column if not exists show_ops_display_name text;

alter table public.businesses
  add column if not exists show_ops_logo_url text;

alter table public.businesses
  add column if not exists show_ops_primary_color text;

alter table public.businesses
  add column if not exists show_ops_accent_color text;

alter table public.businesses
  add column if not exists show_ops_custom_domain text;

create unique index if not exists businesses_show_ops_custom_domain_uidx
  on public.businesses (lower(show_ops_custom_domain))
  where show_ops_custom_domain is not null and length(trim(show_ops_custom_domain)) > 0;

-- ---------------------------------------------------------------------------
-- Access helper: owner OR show_ops_members
-- ---------------------------------------------------------------------------
create table if not exists public.show_ops_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('booker', 'office', 'finance', 'admin')),
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index if not exists show_ops_members_user_idx on public.show_ops_members (user_id);

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
    where m.business_id = p_business_id and m.user_id = (select auth.uid())
  );
$$;

revoke all on function public.show_ops_can_access(uuid) from public;
grant execute on function public.show_ops_can_access(uuid) to authenticated;

alter table public.show_ops_members enable row level security;

drop policy if exists show_ops_members_select on public.show_ops_members;
create policy show_ops_members_select on public.show_ops_members
  for select to authenticated
  using (public.show_ops_can_access(business_id));

drop policy if exists show_ops_members_write on public.show_ops_members;
create policy show_ops_members_write on public.show_ops_members
  for all to authenticated
  using (
    exists (
      select 1 from public.businesses b
      where b.id = show_ops_members.business_id and b.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.businesses b
      where b.id = show_ops_members.business_id and b.owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Master data
-- ---------------------------------------------------------------------------
create table if not exists public.show_suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  partner_type text not null default 'agency',
  billing_mode text not null default 'deposit'
    check (billing_mode in ('deposit', 'invoice')),
  deposit_percent numeric(6,2) not null default 30,
  invoice_nett_percent numeric(6,2) not null default 100,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists show_suppliers_business_idx on public.show_suppliers (business_id, name);

create table if not exists public.show_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  island text not null,
  ticket_type text not null default 'standard',
  adult_price numeric(12,2) not null default 0,
  child_price numeric(12,2) not null default 0,
  infant_price numeric(12,2) not null default 0,
  adult_nett numeric(12,2),
  child_nett numeric(12,2),
  transport_available boolean not null default true,
  capacity integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists show_products_business_island_idx
  on public.show_products (business_id, island, name);

create table if not exists public.show_bus_stops (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  island text not null,
  resort text not null,
  stop_name text not null,
  pickup_time time,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists show_bus_stops_business_idx
  on public.show_bus_stops (business_id, island, sort_order);

create table if not exists public.show_hotels (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  island text not null,
  bus_stop_id uuid references public.show_bus_stops (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists show_hotels_business_idx on public.show_hotels (business_id, island, name);

create table if not exists public.show_bus_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  show_date date not null,
  island text not null,
  seats_ordered integer not null default 0,
  cost_total numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, show_date, island)
);

create index if not exists show_bus_orders_business_date_idx
  on public.show_bus_orders (business_id, show_date);

-- ---------------------------------------------------------------------------
-- Bookings + finance
-- ---------------------------------------------------------------------------
create sequence if not exists public.show_booking_ref_seq;

create table if not exists public.show_bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  booking_ref text not null,
  show_date date not null,
  guest_name text not null,
  guest_mobile text,
  guest_email text,
  hotel_id uuid references public.show_hotels (id) on delete set null,
  hotel_name text,
  transport_required boolean not null default false,
  pickup_stop_id uuid references public.show_bus_stops (id) on delete set null,
  pickup_stop_name text,
  pickup_time time,
  dietary_required boolean not null default false,
  dietary_notes text,
  supplier_id uuid references public.show_suppliers (id) on delete set null,
  supplier_name text,
  billing_mode text not null default 'deposit'
    check (billing_mode in ('deposit', 'invoice')),
  product_id uuid references public.show_products (id) on delete set null,
  show_name text not null,
  island text not null,
  adults integer not null default 0,
  children integer not null default 0,
  infants integer not null default 0,
  total_cost numeric(12,2) not null default 0,
  deposit_amount numeric(12,2) not null default 0,
  balance_remaining numeric(12,2) not null default 0,
  nett_total numeric(12,2) not null default 0,
  adult_nett_total numeric(12,2) not null default 0,
  child_nett_total numeric(12,2) not null default 0,
  supplier_ticket_number text,
  office_comments text,
  office_only_comments text,
  sales_channel text not null default 'direct'
    check (sales_channel in ('direct', 'tour_op', 'hotel', 'shop', 'agency', 'partner', 'other')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partial', 'paid', 'n_a')),
  invoice_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, booking_ref)
);

create index if not exists show_bookings_business_date_idx
  on public.show_bookings (business_id, show_date);
create index if not exists show_bookings_business_island_idx
  on public.show_bookings (business_id, island, show_date);
create index if not exists show_bookings_supplier_idx
  on public.show_bookings (business_id, supplier_id, show_date);
create index if not exists show_bookings_payment_idx
  on public.show_bookings (business_id, show_date, payment_status);

create table if not exists public.show_booking_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  booking_id uuid not null references public.show_bookings (id) on delete cascade,
  amount numeric(12,2) not null,
  method text not null check (method in ('cash', 'card', 'transfer', 'other')),
  paid_at timestamptz not null default now(),
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists show_booking_payments_booking_idx
  on public.show_booking_payments (booking_id);

create table if not exists public.show_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  supplier_id uuid references public.show_suppliers (id) on delete set null,
  supplier_name text not null,
  island text,
  period_start date not null,
  period_end date not null,
  verifactu_number text,
  invoice_date date,
  payment_terms_days integer not null default 30
    check (payment_terms_days in (7, 15, 30, 45, 60, 90)),
  due_date date,
  total_amount numeric(12,2) not null default 0,
  paid boolean not null default false,
  paid_at date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists show_invoices_business_due_idx
  on public.show_invoices (business_id, due_date, paid);

create table if not exists public.show_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  invoice_id uuid not null references public.show_invoices (id) on delete cascade,
  booking_id uuid not null references public.show_bookings (id) on delete cascade,
  booking_ref text not null,
  guest_name text not null,
  supplier_ticket_number text,
  adults integer not null default 0,
  children integer not null default 0,
  adult_nett_total numeric(12,2) not null default 0,
  child_nett_total numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  unique (invoice_id, booking_id)
);

alter table public.show_bookings
  drop constraint if exists show_bookings_invoice_id_fkey;
alter table public.show_bookings
  add constraint show_bookings_invoice_id_fkey
  foreign key (invoice_id) references public.show_invoices (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Booking ref allocator
-- ---------------------------------------------------------------------------
create or replace function public.show_ops_next_booking_ref(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  if not public.show_ops_can_access(p_business_id) then
    raise exception 'not allowed';
  end if;
  n := nextval('public.show_booking_ref_seq');
  return 'SO-' || to_char(now() at time zone 'utc', 'YYMMDD') || '-' || lpad(n::text, 5, '0');
end;
$$;

revoke all on function public.show_ops_next_booking_ref(uuid) from public;
grant execute on function public.show_ops_next_booking_ref(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS for all show_* tables
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'show_suppliers',
    'show_products',
    'show_bus_stops',
    'show_hotels',
    'show_bus_orders',
    'show_bookings',
    'show_booking_payments',
    'show_invoices',
    'show_invoice_lines'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_select on public.%I', t || '_sel', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.show_ops_can_access(business_id))',
      t || '_sel', t
    );
    execute format('drop policy if exists %I_write on public.%I', t || '_w', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.show_ops_can_access(business_id)) with check (public.show_ops_can_access(business_id))',
      t || '_w', t
    );
  end loop;
end $$;

grant select, insert, update, delete on
  public.show_ops_members,
  public.show_suppliers,
  public.show_products,
  public.show_bus_stops,
  public.show_hotels,
  public.show_bus_orders,
  public.show_bookings,
  public.show_booking_payments,
  public.show_invoices,
  public.show_invoice_lines
to authenticated;

grant usage, select on sequence public.show_booking_ref_seq to authenticated;
