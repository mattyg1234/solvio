-- Joel (17 Sept): Gran Canaria runs two buses, so seats remaining are tracked
-- per bus. Every other route is one bus. A pick-up stop belongs to a bus
-- permanently (Ruth's "permanent bus table"); the night's order can split the
-- ordered seats between the buses.
alter table public.show_bus_stops
  add column if not exists bus_no smallint not null default 1;
alter table public.show_bus_stops drop constraint if exists show_bus_stops_bus_no_check;
alter table public.show_bus_stops
  add constraint show_bus_stops_bus_no_check check (bus_no between 1 and 4);

alter table public.show_bus_orders
  add column if not exists seats_by_bus integer[];

comment on column public.show_bus_stops.bus_no is
  'Which coach picks this stop up on islands that run more than one (Gran Canaria = 2). 1 everywhere else.';
comment on column public.show_bus_orders.seats_by_bus is
  'Seats ordered per coach, in bus order, when the night runs more than one. Null = seats_ordered split evenly.';
