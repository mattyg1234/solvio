-- How many of the booked party actually showed. Does not change sold pax or money.

alter table public.show_bookings
  add column if not exists arrived_pax integer;

alter table public.show_bookings drop constraint if exists show_bookings_arrived_pax_check;
alter table public.show_bookings
  add constraint show_bookings_arrived_pax_check
  check (
    arrived_pax is null
    or (arrived_pax >= 0 and arrived_pax <= adults + children + infants)
  );

comment on column public.show_bookings.arrived_pax is
  'Heads who showed. Null = not marked yet. Independent of booked adults/children/infants and invoice totals.';

update public.show_bookings
set arrived_pax = 0
where no_show is true
  and arrived_pax is null;

update public.show_bookings
set arrived_pax = adults + children + infants
where arrived_at is not null
  and coalesce(no_show, false) is false
  and arrived_pax is null;
