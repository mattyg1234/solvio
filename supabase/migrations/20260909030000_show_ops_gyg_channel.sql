/*
 * GetYourGuide connectivity (Supplier API).
 *
 * show_channel_products maps a GetYourGuide product id (we choose the string) to a
 * Solvio show, optional ticket type and the partner row GYG sales are booked under
 * (pricing/nett + booking token). show_seat_holds are GYG reservations: held seats
 * count against availability until they are booked, released or expire (60 min).
 * Bookings created by the channel carry channel + channel_ref so GYG's retries
 * return the same booking instead of a duplicate.
 */

create table if not exists public.show_channel_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  channel text not null default 'getyourguide' check (channel in ('getyourguide')),
  external_product_id text not null check (length(external_product_id) between 1 and 255 and position('%' in external_product_id) = 0),
  product_id uuid not null references public.show_products (id) on delete restrict,
  ticket_type_id uuid references public.show_ticket_types (id) on delete set null,
  supplier_id uuid not null references public.show_suppliers (id) on delete restrict,
  pickup_kind text not null default 'own_way' check (pickup_kind in ('own_way', 'private')),
  cutoff_minutes integer not null default 120 check (cutoff_minutes >= 0),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, channel, external_product_id)
);
alter table public.show_channel_products enable row level security;
drop policy if exists show_channel_products_select on public.show_channel_products;
create policy show_channel_products_select on public.show_channel_products
  for select to authenticated using (public.show_ops_can_access(business_id));
drop policy if exists show_channel_products_write on public.show_channel_products;
create policy show_channel_products_write on public.show_channel_products
  for all to authenticated
  using (private.show_ops_has_action(business_id, 'admin', array['settings']))
  with check (private.show_ops_has_action(business_id, 'admin', array['settings']));

create table if not exists public.show_seat_holds (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  channel text not null default 'getyourguide',
  channel_product_id uuid not null references public.show_channel_products (id) on delete cascade,
  product_id uuid not null references public.show_products (id) on delete cascade,
  island text not null,
  show_date date not null,
  adults integer not null default 0 check (adults >= 0),
  children integer not null default 0 check (children >= 0),
  infants integer not null default 0 check (infants >= 0),
  reservation_ref text not null unique,
  external_booking_ref text,
  status text not null default 'held' check (status in ('held', 'booked', 'released', 'expired')),
  expires_at timestamptz not null,
  booking_id uuid references public.show_bookings (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists show_seat_holds_active_idx
  on public.show_seat_holds (business_id, product_id, show_date) where status = 'held';
create index if not exists show_seat_holds_external_idx
  on public.show_seat_holds (business_id, channel, external_booking_ref) where external_booking_ref is not null;
-- Backend only: GetYourGuide calls come in with the service role, staff never edit holds directly.
alter table public.show_seat_holds enable row level security;

alter table public.show_bookings
  add column if not exists channel text,
  add column if not exists channel_ref text;
create unique index if not exists show_bookings_channel_ref_uidx
  on public.show_bookings (business_id, channel, channel_ref) where channel_ref is not null;

comment on table public.show_channel_products is 'OTA product mapping: external product id → show / ticket type / partner. GetYourGuide today.';
comment on table public.show_seat_holds is 'OTA reservations (GetYourGuide /reserve). Held seats reduce availability until booked, released or expired.';
comment on column public.show_bookings.channel_ref is 'External booking reference (e.g. gygBookingReference). Unique per channel so OTA retries are idempotent.';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260909030000', 'show_ops_gyg_channel') on conflict do nothing;
