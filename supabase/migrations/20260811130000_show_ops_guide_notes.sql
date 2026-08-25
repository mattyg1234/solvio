-- Bus stop guide notes for bus lists
alter table public.show_bus_stops
  add column if not exists guide_notes text;
