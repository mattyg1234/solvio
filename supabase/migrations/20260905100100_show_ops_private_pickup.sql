-- Show Ops · 5 Sept 2026 · Joel's 5/9 note
--
-- Pick-up is now a three-way choice: Bus / Private / Own way. "Private" means the
-- guest has their own transfer from a resort zone (PDC, CT, TFS, …) and stays in
-- a hotel, villa, AirBnB or with friends & family. The Office list, Door and desk
-- print show_bookings.pickup_stop_name, so the wording ("Private PDC · Villa")
-- lives in that column and those screens need no change.
--
-- transport_required stays the money + bus-list flag: true only for pickup_kind
-- = 'bus'.

alter table public.show_bookings
  add column if not exists pickup_kind text not null default 'own_way',
  add column if not exists private_accommodation text,
  add column if not exists private_zone text;

alter table public.show_bookings drop constraint if exists show_bookings_pickup_kind_check;
alter table public.show_bookings
  add constraint show_bookings_pickup_kind_check
  check (pickup_kind in ('bus', 'private', 'own_way'));

alter table public.show_bookings drop constraint if exists show_bookings_private_accommodation_check;
alter table public.show_bookings
  add constraint show_bookings_private_accommodation_check
  check (
    private_accommodation is null
    or private_accommodation in ('hotel', 'villa', 'airbnb', 'friends_family')
  );

-- Everything already on the bus keeps riding the bus.
update public.show_bookings
   set pickup_kind = 'bus'
 where transport_required = true
   and pickup_kind = 'own_way';

comment on column public.show_bookings.pickup_kind is
  'bus = on our coach (transport_required true); private = own transfer from a resort zone; own_way = walks in.';
comment on column public.show_bookings.private_accommodation is
  'Where a private-transfer guest is staying: hotel, villa, airbnb or friends_family.';
comment on column public.show_bookings.private_zone is
  'Resort zone code (show_bus_stops.zone, e.g. PDC) a private-transfer guest comes from.';
